package postgres

import (
	"context"
	"errors"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/kabeerx9/decio/services/api/internal/domain"
)

func (s *Store) SendMessage(ctx context.Context, senderID, otherID, clientMessageID, body string) (domain.DirectMessage, error) {
	var message domain.DirectMessage
	err := s.pool.QueryRow(ctx, `
		INSERT INTO direct_messages (user_low, user_high, sender_id, client_message_id, body)
		SELECT c.user_low, c.user_high, $1, $3, $4 FROM connections c
		WHERE c.user_low = LEAST($1, $2) AND c.user_high = GREATEST($1, $2) AND c.status = 'accepted'
		ON CONFLICT (sender_id, client_message_id) DO NOTHING
		RETURNING direct_messages.id::text, direct_messages.sender_id, direct_messages.body, direct_messages.created_at
	`, senderID, otherID, clientMessageID, body).Scan(&message.ID, &message.SenderID, &message.Body, &message.CreatedAt)
	if err == nil {
		return message, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return domain.DirectMessage{}, err
	}
	// A duplicate may have committed while the insert waited on its unique key.
	var accepted bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM connections
		WHERE user_low = LEAST($1, $2) AND user_high = GREATEST($1, $2) AND status = 'accepted')`, senderID, otherID).Scan(&accepted); err != nil {
		return domain.DirectMessage{}, err
	}
	if !accepted {
		return domain.DirectMessage{}, domain.ErrChatUnavailable
	}
	var existingOtherID string
	err = s.pool.QueryRow(ctx, `
		SELECT m.id::text, m.sender_id, m.body, m.created_at,
			CASE WHEN m.sender_id = m.user_low THEN m.user_high ELSE m.user_low END
		FROM direct_messages m WHERE m.sender_id = $1 AND m.client_message_id = $2
	`, senderID, clientMessageID).Scan(&message.ID, &message.SenderID, &message.Body, &message.CreatedAt, &existingOtherID)
	if err == nil {
		if existingOtherID != otherID || message.Body != body {
			return domain.DirectMessage{}, domain.ErrMessageConflict
		}
		return message, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return domain.DirectMessage{}, err
	}
	return domain.DirectMessage{}, domain.ErrChatUnavailable
}

func (s *Store) ListMessages(ctx context.Context, viewerID, otherID, cursor string) (domain.MessagePage, error) {
	page := domain.MessagePage{Messages: []domain.DirectMessage{}}
	var accepted bool
	if err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM connections
		WHERE user_low = LEAST($1, $2) AND user_high = GREATEST($1, $2) AND status = 'accepted')
	`, viewerID, otherID).Scan(&accepted); err != nil {
		return page, err
	}
	if !accepted {
		return page, domain.ErrChatUnavailable
	}
	var before int64
	if cursor != "" {
		before, _ = strconv.ParseInt(cursor, 10, 64)
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, sender_id, body, created_at FROM direct_messages
		WHERE user_low = LEAST($1, $2) AND user_high = GREATEST($1, $2)
			AND ($3::bigint = 0 OR id < $3)
		ORDER BY id DESC LIMIT 21
	`, viewerID, otherID, before)
	if err != nil {
		return page, err
	}
	defer rows.Close()
	for rows.Next() {
		var message domain.DirectMessage
		if err := rows.Scan(&message.ID, &message.SenderID, &message.Body, &message.CreatedAt); err != nil {
			return page, err
		}
		page.Messages = append(page.Messages, message)
	}
	if err := rows.Err(); err != nil {
		return page, err
	}
	if len(page.Messages) > 20 {
		page.Messages = page.Messages[:20]
		page.NextCursor = page.Messages[19].ID
	}
	return page, nil
}

// MarkMessagesRead advances only to a message that belongs to this accepted chat.
// GREATEST keeps concurrent reads from moving the cursor backwards.
func (s *Store) MarkMessagesRead(ctx context.Context, viewerID, otherID, messageID string) error {
	var lastRead int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO chat_reads (viewer_id, other_id, last_read_message_id)
		SELECT $1, $2, m.id FROM direct_messages m
		JOIN connections c ON c.user_low = m.user_low AND c.user_high = m.user_high
		WHERE m.id = $3::bigint AND m.user_low = LEAST($1, $2) AND m.user_high = GREATEST($1, $2)
			AND c.status = 'accepted'
		ON CONFLICT (viewer_id, other_id) DO UPDATE
		SET last_read_message_id = GREATEST(chat_reads.last_read_message_id, EXCLUDED.last_read_message_id)
		RETURNING last_read_message_id
	`, viewerID, otherID, messageID).Scan(&lastRead)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrChatUnavailable
	}
	return err
}
