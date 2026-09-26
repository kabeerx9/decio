package store

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"
)

func TestFindOrCreateKeepsProfilesSeparate(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL for Postgres integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	profiles, err := NewPostgres(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(profiles.Close)
	firstID := fmt.Sprintf("test_user_%d_one", time.Now().UnixNano())
	secondID := fmt.Sprintf("test_user_%d_two", time.Now().UnixNano())
	t.Cleanup(func() {
		cleanupCtx, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		for _, id := range []string{firstID, secondID} {
			if _, err := profiles.pool.Exec(cleanupCtx, "DELETE FROM profiles WHERE id = $1", id); err != nil {
				t.Errorf("clean up profile %s: %v", id, err)
			}
		}
	})

	first, err := profiles.FindOrCreate(ctx, firstID)
	if err != nil {
		t.Fatal(err)
	}
	second, err := profiles.FindOrCreate(ctx, secondID)
	if err != nil {
		t.Fatal(err)
	}
	again, err := profiles.FindOrCreate(ctx, firstID)
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != firstID || second.ID != secondID || again != first {
		t.Fatalf("profiles were mixed or unstable: first=%+v second=%+v again=%+v", first, second, again)
	}
}
