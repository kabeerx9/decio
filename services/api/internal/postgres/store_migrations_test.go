package postgres

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestNewRequiresMigrations(t *testing.T) {
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		t.Skip("set TEST_DATABASE_URL for Store integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	admin, err := pgxpool.New(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	name := fmt.Sprintf("decio_unmigrated_%d", time.Now().UnixNano())
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanupCtx, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		if _, err := admin.Exec(cleanupCtx, "DROP DATABASE "+name+" WITH (FORCE)"); err != nil {
			t.Errorf("drop unmigrated database: %v", err)
		}
	})
	u, err := url.Parse(base)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name
	store, err := New(ctx, u.String())
	if store != nil {
		store.Close()
	}
	if err == nil {
		t.Fatal("unmigrated database must be rejected")
	}
	pool, err := pgxpool.New(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if _, err := pool.Exec(ctx, "CREATE TABLE schema_migrations (version bigint NOT NULL PRIMARY KEY, dirty boolean NOT NULL)"); err != nil {
		t.Fatal(err)
	}
	for _, state := range []struct {
		version int
		dirty   bool
	}{
		{version: 3, dirty: false},
		{version: 4, dirty: true},
	} {
		if _, err := pool.Exec(ctx, "DELETE FROM schema_migrations"); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, "INSERT INTO schema_migrations (version, dirty) VALUES ($1, $2)", state.version, state.dirty); err != nil {
			t.Fatal(err)
		}
		store, err := New(ctx, u.String())
		if store != nil {
			store.Close()
		}
		if err == nil {
			t.Fatalf("version %d dirty=%t must be rejected", state.version, state.dirty)
		}
	}
}
