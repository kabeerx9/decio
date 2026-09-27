package postgres

import (
	"context"
	"errors"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/kabeerx9/decio/services/api/internal/domain"
)

func (s *Store) CreatePost(ctx context.Context, authorID, body string, photo []byte, photoType string) (domain.Post, error) {
	var post domain.Post
	err := s.pool.QueryRow(ctx, `
		WITH inserted AS (
			INSERT INTO city_posts (author_id, city, body, photo, photo_type)
			SELECT id, city, $2, $3, NULLIF($4, '') FROM profiles
			WHERE id = $1 AND onboarding_completed_at IS NOT NULL
			RETURNING id, author_id, city, body, photo IS NOT NULL AS has_photo, created_at
		)
		SELECT i.id, i.author_id, p.display_name, p.image_url, i.city, i.body, i.has_photo, i.created_at
		FROM inserted i JOIN profiles p ON p.id = i.author_id
	`, authorID, body, photo, photoType).Scan(&post.ID, &post.AuthorID, &post.AuthorName, &post.AuthorImageURL, &post.City, &post.Body, &post.HasPhoto, &post.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Post{}, domain.ErrProfileIncomplete
	}
	return post, err
}

func (s *Store) ListPosts(ctx context.Context, viewerID, cursor string) (domain.PostPage, error) {
	page := domain.PostPage{Posts: []domain.Post{}}
	if err := s.pool.QueryRow(ctx, `SELECT city FROM profiles WHERE id = $1 AND onboarding_completed_at IS NOT NULL`, viewerID).Scan(&page.City); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return page, nil
		}
		return page, err
	}
	if page.City == "" {
		return page, nil
	}
	var before int64
	if cursor != "" {
		before, _ = strconv.ParseInt(cursor, 10, 64)
	}
	rows, err := s.pool.Query(ctx, `
		SELECT cp.id, cp.author_id, p.display_name, p.image_url, cp.city, cp.body, cp.photo IS NOT NULL, cp.created_at
		FROM city_posts cp JOIN profiles p ON p.id = cp.author_id
		WHERE lower(cp.city) = lower($1) AND ($2::bigint = 0 OR cp.id < $2)
		ORDER BY cp.id DESC LIMIT 21
	`, page.City, before)
	if err != nil {
		return page, err
	}
	defer rows.Close()
	for rows.Next() {
		var post domain.Post
		if err := rows.Scan(&post.ID, &post.AuthorID, &post.AuthorName, &post.AuthorImageURL, &post.City, &post.Body, &post.HasPhoto, &post.CreatedAt); err != nil {
			return page, err
		}
		page.Posts = append(page.Posts, post)
	}
	if err := rows.Err(); err != nil {
		return page, err
	}
	if len(page.Posts) > 20 {
		page.Posts = page.Posts[:20]
		page.NextCursor = page.Posts[19].ID
	}
	return page, nil
}

func (s *Store) PostPhoto(ctx context.Context, viewerID, postID string) ([]byte, string, error) {
	var photo []byte
	var kind string
	err := s.pool.QueryRow(ctx, `
		SELECT cp.photo, cp.photo_type FROM city_posts cp
		JOIN profiles viewer ON viewer.id = $1 AND viewer.onboarding_completed_at IS NOT NULL AND lower(viewer.city) = lower(cp.city)
		WHERE cp.id = $2 AND cp.photo IS NOT NULL
	`, viewerID, postID).Scan(&photo, &kind)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", domain.ErrPostNotFound
	}
	return photo, kind, err
}

func (s *Store) CreateReply(ctx context.Context, authorID, postID, body string) (domain.PostReply, error) {
	var reply domain.PostReply
	err := s.pool.QueryRow(ctx, `
		WITH inserted AS (
			INSERT INTO post_replies (post_id, author_id, body)
			SELECT cp.id, author.id, $3 FROM city_posts cp
			JOIN profiles author ON author.id = $1 AND author.onboarding_completed_at IS NOT NULL
				AND lower(author.city) = lower(cp.city)
			WHERE cp.id = $2
			RETURNING id, post_id, author_id, body, created_at
		)
		SELECT i.id, i.post_id, i.author_id, author.display_name, author.image_url, i.body, i.created_at
		FROM inserted i JOIN profiles author ON author.id = i.author_id
	`, authorID, postID, body).Scan(&reply.ID, &reply.PostID, &reply.AuthorID, &reply.AuthorName, &reply.AuthorImageURL, &reply.Body, &reply.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.PostReply{}, domain.ErrPostNotFound
	}
	return reply, err
}

func (s *Store) ListReplies(ctx context.Context, viewerID, postID, cursor string) (domain.ReplyPage, error) {
	page := domain.ReplyPage{Replies: []domain.PostReply{}}
	var after int64
	if cursor != "" {
		after, _ = strconv.ParseInt(cursor, 10, 64)
	}
	rows, err := s.pool.Query(ctx, `
		SELECT r.id, r.post_id, r.author_id, p.display_name, p.image_url, r.body, r.created_at
		FROM post_replies r JOIN profiles p ON p.id = r.author_id
		JOIN city_posts cp ON cp.id = r.post_id
		JOIN profiles viewer ON viewer.id = $1 AND viewer.onboarding_completed_at IS NOT NULL AND lower(viewer.city) = lower(cp.city)
		WHERE r.post_id = $2 AND r.id > $3
		ORDER BY r.id ASC LIMIT 31
	`, viewerID, postID, after)
	if err != nil {
		return page, err
	}
	defer rows.Close()
	for rows.Next() {
		var reply domain.PostReply
		if err := rows.Scan(&reply.ID, &reply.PostID, &reply.AuthorID, &reply.AuthorName, &reply.AuthorImageURL, &reply.Body, &reply.CreatedAt); err != nil {
			return page, err
		}
		page.Replies = append(page.Replies, reply)
	}
	if err := rows.Err(); err != nil {
		return page, err
	}
	rows.Close()
	// An empty page is valid only while this post remains visible to the viewer.
	if len(page.Replies) == 0 {
		var visible bool
		if err := s.pool.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM city_posts cp
			JOIN profiles viewer ON viewer.id = $1 AND viewer.onboarding_completed_at IS NOT NULL AND lower(viewer.city) = lower(cp.city)
			WHERE cp.id = $2)
		`, viewerID, postID).Scan(&visible); err != nil {
			return page, err
		}
		if !visible {
			return page, domain.ErrPostNotFound
		}
	}
	if len(page.Replies) > 30 {
		page.Replies = page.Replies[:30]
		page.NextCursor = page.Replies[29].ID
	}
	return page, nil
}
