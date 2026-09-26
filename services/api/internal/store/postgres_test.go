package store

import (
	"context"
	"fmt"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/kabeerx9/decio-update/services/api/internal/api"
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
	if first.ID != firstID || second.ID != secondID || !reflect.DeepEqual(again, first) {
		t.Fatalf("profiles were mixed or unstable: first=%+v second=%+v again=%+v", first, second, again)
	}
	saved, err := profiles.Update(ctx, firstID, api.ProfileInput{DisplayName: "Kabeer", City: "Mumbai", Bio: "City explorer", Headline: "Mobile engineer", Interests: []string{"Go", "Design"}})
	if err != nil {
		t.Fatal(err)
	}
	reloaded, err := profiles.FindOrCreate(ctx, firstID)
	if err != nil {
		t.Fatal(err)
	}
	other, err := profiles.FindOrCreate(ctx, secondID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(saved, reloaded) || other.DisplayName != "" || other.City != "" {
		t.Fatalf("profile edit did not persist separately: saved=%+v reloaded=%+v other=%+v", saved, reloaded, other)
	}
}
