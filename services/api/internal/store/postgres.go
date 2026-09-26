package store

import (
	"context"
	"embed"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kabeerx9/decio-update/services/api/internal/api"
)

//go:embed schema.sql
var schema embed.FS

type Postgres struct {
	pool *pgxpool.Pool
}

func NewPostgres(ctx context.Context, databaseURL string) (*Postgres, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	statement, err := schema.ReadFile("schema.sql")
	if err != nil {
		pool.Close()
		return nil, err
	}
	if _, err := pool.Exec(ctx, string(statement)); err != nil {
		pool.Close()
		return nil, err
	}
	return &Postgres{pool: pool}, nil
}

func (s *Postgres) Close() { s.pool.Close() }

func (s *Postgres) FindOrCreate(ctx context.Context, clerkUserID string) (api.Profile, error) {
	_, err := s.pool.Exec(ctx, `INSERT INTO profiles (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, clerkUserID)
	if err != nil {
		return api.Profile{}, err
	}
	var profile api.Profile
	err = s.pool.QueryRow(ctx, `SELECT id, display_name, city, bio, headline, interests FROM profiles WHERE id = $1`, clerkUserID).
		Scan(&profile.ID, &profile.DisplayName, &profile.City, &profile.Bio, &profile.Headline, &profile.Interests)
	return profile, err
}

func (s *Postgres) Update(ctx context.Context, clerkUserID string, input api.ProfileInput) (api.Profile, error) {
	var profile api.Profile
	err := s.pool.QueryRow(ctx, `
		INSERT INTO profiles (id, display_name, city, bio, headline, interests)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (id) DO UPDATE SET
			display_name = EXCLUDED.display_name,
			city = EXCLUDED.city,
			bio = EXCLUDED.bio,
			headline = EXCLUDED.headline,
			interests = EXCLUDED.interests
		RETURNING id, display_name, city, bio, headline, interests
	`, clerkUserID, input.DisplayName, input.City, input.Bio, input.Headline, input.Interests).
		Scan(&profile.ID, &profile.DisplayName, &profile.City, &profile.Bio, &profile.Headline, &profile.Interests)
	return profile, err
}
