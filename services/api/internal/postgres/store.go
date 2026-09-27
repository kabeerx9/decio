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
	tx, err := pool.Begin(ctx)
	if err != nil {
		pool.Close()
		return nil, err
	}
	defer tx.Rollback(ctx)
	// Serialize schema upgrades when multiple API instances start together.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(1984265324)`); err != nil {
		_ = tx.Rollback(ctx)
		pool.Close()
		return nil, err
	}
	if _, err := tx.Exec(ctx, string(statement)); err != nil {
		_ = tx.Rollback(ctx)
		pool.Close()
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		_ = tx.Rollback(ctx)
		pool.Close()
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }
