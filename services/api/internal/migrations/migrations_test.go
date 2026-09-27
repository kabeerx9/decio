package migrations

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func testDatabase(t *testing.T) string {
	t.Helper()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		t.Skip("set TEST_DATABASE_URL for migration integration tests")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	admin, err := pgxpool.New(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	name := fmt.Sprintf("decio_migrations_%d", time.Now().UnixNano())
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanupCtx, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		if _, err := admin.Exec(cleanupCtx, "DROP DATABASE "+name+" WITH (FORCE)"); err != nil {
			t.Errorf("drop migration test database: %v", err)
		}
	})
	u, err := url.Parse(base)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name
	return u.String()
}

func TestUpBuildsSchemaAndIsRepeatable(t *testing.T) {
	databaseURL := testDatabase(t)
	ctx := context.Background()
	if err := Up(databaseURL); err != nil {
		t.Fatal(err)
	}
	if err := Up(databaseURL); err != nil {
		t.Fatalf("repeat migration: %v", err)
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var version int
	var dirty bool
	if err := pool.QueryRow(ctx, "SELECT version, dirty FROM schema_migrations").Scan(&version, &dirty); err != nil {
		t.Fatal(err)
	}
	if version != CurrentVersion || dirty {
		t.Fatalf("migration state = %d dirty=%t", version, dirty)
	}
	for _, table := range []string{"profiles", "connections", "direct_messages", "chat_reads", "city_posts", "post_replies"} {
		var exists bool
		if err := pool.QueryRow(ctx, "SELECT to_regclass($1) IS NOT NULL", table).Scan(&exists); err != nil || !exists {
			t.Fatalf("table %s missing: %v", table, err)
		}
	}
	for _, column := range []string{"image_url", "onboarding_completed_at"} {
		var exists bool
		if err := pool.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'profiles' AND column_name = $1)", column).Scan(&exists); err != nil || !exists {
			t.Fatalf("profile column %s missing: %v", column, err)
		}
	}
}

func TestUpgradePreservesExistingProfileAndBackfillsOnboarding(t *testing.T) {
	databaseURL := testDatabase(t)
	ctx := context.Background()
	runner, err := newRunner(databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	if err := runner.Steps(1); err != nil {
		t.Fatal(err)
	}
	if sourceErr, databaseErr := runner.Close(); sourceErr != nil || databaseErr != nil {
		t.Fatalf("close baseline migration: %v %v", sourceErr, databaseErr)
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if _, err := pool.Exec(ctx, "INSERT INTO profiles (id, display_name, city) VALUES ('existing', 'Existing Person', 'Mumbai'), ('incomplete', '', '')"); err != nil {
		t.Fatal(err)
	}
	if err := Up(databaseURL); err != nil {
		t.Fatal(err)
	}
	var completed, incomplete bool
	if err := pool.QueryRow(ctx, "SELECT onboarding_completed_at IS NOT NULL FROM profiles WHERE id = 'existing'").Scan(&completed); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT onboarding_completed_at IS NOT NULL FROM profiles WHERE id = 'incomplete'").Scan(&incomplete); err != nil {
		t.Fatal(err)
	}
	if !completed || incomplete {
		t.Fatalf("backfill incorrect: existing=%t incomplete=%t", completed, incomplete)
	}
}

func TestUpAdoptsSchemaPreviouslyAppliedAtStartup(t *testing.T) {
	databaseURL := testDatabase(t)
	ctx := context.Background()
	runner, err := newRunner(databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	if err := runner.Steps(1); err != nil {
		t.Fatal(err)
	}
	if sourceErr, databaseErr := runner.Close(); sourceErr != nil || databaseErr != nil {
		t.Fatalf("close baseline migration: %v %v", sourceErr, databaseErr)
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	for _, name := range []string{"000002_post_replies.up.sql", "000003_profile_image.up.sql", "000004_onboarding_completion.up.sql"} {
		statement, err := files.ReadFile("sql/" + name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, string(statement)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, "INSERT INTO profiles (id, display_name, city) VALUES ('unfinished', 'New Person', 'Mumbai')"); err != nil {
		t.Fatal(err)
	}
	if err := Up(databaseURL); err != nil {
		t.Fatal(err)
	}
	var completed bool
	if err := pool.QueryRow(ctx, "SELECT onboarding_completed_at IS NOT NULL FROM profiles WHERE id = 'unfinished'").Scan(&completed); err != nil {
		t.Fatal(err)
	}
	if completed {
		t.Fatal("adoption must not backfill an unfinished account a second time")
	}
}
