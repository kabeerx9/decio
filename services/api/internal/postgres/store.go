package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kabeerx9/decio-update/services/api/internal/migrations"
)

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
	var version int
	var dirty bool
	if err := pool.QueryRow(ctx, "SELECT version, dirty FROM schema_migrations").Scan(&version, &dirty); err != nil {
		pool.Close()
		return nil, fmt.Errorf("check schema migrations (run go run ./cmd/migrate up): %w", err)
	}
	if dirty || version < migrations.CurrentVersion {
		pool.Close()
		return nil, fmt.Errorf("database migration state is version %d (dirty=%t); require version %d (run go run ./cmd/migrate up)", version, dirty, migrations.CurrentVersion)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }
