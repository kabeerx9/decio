package store

import (
	"context"
	"errors"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/kabeerx9/decio-update/services/api/internal/api"
)

func (s *Postgres) CreatePost(ctx context.Context, authorID, body string, photo []byte, photoType string) (api.Post, error) {
	var post api.Post
	err := s.pool.QueryRow(ctx, `
		WITH inserted AS (
			INSERT INTO city_posts (author_id, city, body, photo, photo_type)
			SELECT id, city, $2, $3, NULLIF($4, '') FROM profiles
			WHERE id = $1 AND city <> '' AND display_name <> ''
			RETURNING id, author_id, city, body, photo IS NOT NULL AS has_photo, created_at
		)
		SELECT i.id, i.author_id, p.display_name, i.city, i.body, i.has_photo, i.created_at
		FROM inserted i JOIN profiles p ON p.id = i.author_id
	`, authorID, body, photo, photoType).Scan(&post.ID, &post.AuthorID, &post.AuthorName, &post.City, &post.Body, &post.HasPhoto, &post.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return api.Post{}, api.ErrProfileIncomplete
	}
	return post, err
}

func (s *Postgres) ListPosts(ctx context.Context, viewerID, cursor string) (api.PostPage, error) {
	page := api.PostPage{Posts: []api.Post{}}
	if err := s.pool.QueryRow(ctx, `SELECT city FROM profiles WHERE id = $1`, viewerID).Scan(&page.City); err != nil {
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
		SELECT cp.id, cp.author_id, p.display_name, cp.city, cp.body, cp.photo IS NOT NULL, cp.created_at
		FROM city_posts cp JOIN profiles p ON p.id = cp.author_id
		WHERE lower(cp.city) = lower($1) AND ($2::bigint = 0 OR cp.id < $2)
		ORDER BY cp.id DESC LIMIT 21
	`, page.City, before)
	if err != nil {
		return page, err
	}
	defer rows.Close()
	for rows.Next() {
		var post api.Post
		if err := rows.Scan(&post.ID, &post.AuthorID, &post.AuthorName, &post.City, &post.Body, &post.HasPhoto, &post.CreatedAt); err != nil {
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

func (s *Postgres) PostPhoto(ctx context.Context, viewerID, postID string) ([]byte, string, error) {
	var photo []byte
	var kind string
	err := s.pool.QueryRow(ctx, `
		SELECT cp.photo, cp.photo_type FROM city_posts cp
		JOIN profiles viewer ON viewer.id = $1 AND viewer.city <> '' AND lower(viewer.city) = lower(cp.city)
		WHERE cp.id = $2 AND cp.photo IS NOT NULL
	`, viewerID, postID).Scan(&photo, &kind)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", api.ErrPostNotFound
	}
	return photo, kind, err
}
