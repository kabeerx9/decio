package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/kabeerx9/decio-update/services/api/internal/domain"
)

// RequestConnection inserts one pending relationship for an unordered user pair.
// The primary key makes simultaneous or reverse-direction requests conflict.
func (s *Store) RequestConnection(ctx context.Context, requesterID, recipientID string) error {
	var requesterReady, recipientReady bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS (
		SELECT 1 FROM profiles WHERE id = $1 AND onboarding_completed_at IS NOT NULL
	), EXISTS (
		SELECT 1 FROM profiles WHERE id = $2 AND onboarding_completed_at IS NOT NULL
	)`, requesterID, recipientID).Scan(&requesterReady, &recipientReady); err != nil {
		return err
	}
	if !requesterReady {
		return domain.ErrProfileIncomplete
	}
	if !recipientReady {
		return domain.ErrProfileNotFound
	}
	result, err := s.pool.Exec(ctx, `
		INSERT INTO connections (user_low, user_high, requester_id, recipient_id)
		VALUES (LEAST($1, $2), GREATEST($1, $2), $1, $2)
		ON CONFLICT (user_low, user_high) DO NOTHING
	`, requesterID, recipientID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return domain.ErrConnectionExists
	}
	return nil
}

// AcceptConnection changes only a pending request addressed to the caller.
func (s *Store) AcceptConnection(ctx context.Context, recipientID, requesterID string) error {
	var accepted string
	err := s.pool.QueryRow(ctx, `
		UPDATE connections SET status = 'accepted', accepted_at = NOW()
		WHERE recipient_id = $1 AND requester_id = $2 AND status = 'pending'
		RETURNING status
	`, recipientID, requesterID).Scan(&accepted)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrConnectionNotFound
	}
	return err
}

// ListConnections projects each relationship from the current user's side.
func (s *Store) ListConnections(ctx context.Context, userID string) ([]domain.Connection, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT p.id, p.display_name, p.city, p.bio, p.headline, p.interests, p.image_url, p.onboarding_completed_at IS NOT NULL,
			CASE WHEN c.status = 'accepted' THEN 'accepted'
			     WHEN c.recipient_id = $1 THEN 'incoming' ELSE 'sent' END,
			COALESCE(unread.count, 0)
		FROM connections c
		JOIN profiles p ON p.id = CASE WHEN c.requester_id = $1 THEN c.recipient_id ELSE c.requester_id END
		LEFT JOIN chat_reads r ON r.viewer_id = $1 AND r.other_id = p.id
		LEFT JOIN LATERAL (
			SELECT COUNT(*)::int AS count FROM direct_messages m
			WHERE c.status = 'accepted' AND m.user_low = c.user_low AND m.user_high = c.user_high
				AND m.sender_id <> $1 AND m.id > COALESCE(r.last_read_message_id, 0)
		) unread ON true
		WHERE c.requester_id = $1 OR c.recipient_id = $1
		ORDER BY c.created_at DESC, p.id
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	connections := []domain.Connection{}
	for rows.Next() {
		var connection domain.Connection
		if err := rows.Scan(&connection.Other.ID, &connection.Other.DisplayName, &connection.Other.City, &connection.Other.Bio, &connection.Other.Headline, &connection.Other.Interests, &connection.Other.ImageURL, &connection.Other.OnboardingComplete, &connection.Status, &connection.UnreadCount); err != nil {
			return nil, err
		}
		connections = append(connections, connection)
	}
	return connections, rows.Err()
}
