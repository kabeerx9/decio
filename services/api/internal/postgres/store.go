package postgres

import (
	"context"
	"embed"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schema embed.FS

type Store struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, databaseURL string) (*Store, error) {
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
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }
