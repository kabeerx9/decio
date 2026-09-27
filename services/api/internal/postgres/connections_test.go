package postgres

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/kabeerx9/decio-update/services/api/internal/domain"
)

func TestConnectionAuthorizationAndStateTransitions(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL for Store integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	store, err := New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(store.Close)
	ids := []string{
		fmt.Sprintf("test_connection_%d_a", time.Now().UnixNano()),
		fmt.Sprintf("test_connection_%d_b", time.Now().UnixNano()),
		fmt.Sprintf("test_connection_%d_c", time.Now().UnixNano()),
		fmt.Sprintf("test_connection_%d_blank", time.Now().UnixNano()),
	}
	t.Cleanup(func() {
		cleanupCtx, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		for _, id := range ids {
			if _, err := store.pool.Exec(cleanupCtx, "DELETE FROM connections WHERE requester_id = $1 OR recipient_id = $1", id); err != nil {
				t.Error(err)
			}
			if _, err := store.pool.Exec(cleanupCtx, "DELETE FROM profiles WHERE id = $1", id); err != nil {
				t.Error(err)
			}
		}
	})
	for _, id := range ids[:3] {
		if _, err := store.Update(ctx, id, domain.ProfileInput{DisplayName: id, City: "Mumbai", Interests: []string{}}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := store.SetProfileImageURL(ctx, ids[1], "https://images.clerk.test/connection.jpg"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.FindOrCreate(ctx, ids[3]); err != nil {
		t.Fatal(err)
	}
	if err := store.RequestConnection(ctx, ids[3], ids[0]); !errors.Is(err, domain.ErrProfileIncomplete) {
		t.Fatalf("incomplete requester: %v", err)
	}
	if err := store.RequestConnection(ctx, ids[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	if err := store.RequestConnection(ctx, ids[0], ids[1]); !errors.Is(err, domain.ErrConnectionExists) {
		t.Fatalf("duplicate request: %v", err)
	}
	if err := store.RequestConnection(ctx, ids[1], ids[0]); !errors.Is(err, domain.ErrConnectionExists) {
		t.Fatalf("reverse request: %v", err)
	}
	for _, test := range []struct {
		user   string
		status string
	}{{ids[0], "sent"}, {ids[1], "incoming"}} {
		list, err := store.ListConnections(ctx, test.user)
		if err != nil || len(list) != 1 || list[0].Status != test.status {
			t.Fatalf("%s sees %v, err=%v", test.user, list, err)
		}
	}
	list, err := store.ListConnections(ctx, ids[0])
	if err != nil || len(list) != 1 || list[0].Other.ImageURL != "https://images.clerk.test/connection.jpg" {
		t.Fatalf("connection photo: %+v %v", list, err)
	}
	for _, user := range []string{ids[0], ids[2]} {
		if err := store.AcceptConnection(ctx, user, ids[0]); !errors.Is(err, domain.ErrConnectionNotFound) {
			t.Fatalf("non-recipient accepted: %v", err)
		}
	}
	if err := store.AcceptConnection(ctx, ids[1], ids[0]); err != nil {
		t.Fatal(err)
	}
	if err := store.AcceptConnection(ctx, ids[1], ids[0]); !errors.Is(err, domain.ErrConnectionNotFound) {
		t.Fatalf("repeat accept: %v", err)
	}
	for _, user := range ids[:2] {
		list, err := store.ListConnections(ctx, user)
		if err != nil || len(list) != 1 || list[0].Status != "accepted" {
			t.Fatalf("%s sees %v, err=%v", user, list, err)
		}
	}
	if err := store.RequestConnection(ctx, ids[0], "missing_person"); !errors.Is(err, domain.ErrProfileNotFound) {
		t.Fatalf("missing recipient: %v", err)
	}

	var wait sync.WaitGroup
	results := make(chan error, 2)
	for _, pair := range [][2]string{{ids[0], ids[2]}, {ids[2], ids[0]}} {
		wait.Add(1)
		go func(from, to string) { defer wait.Done(); results <- store.RequestConnection(ctx, from, to) }(pair[0], pair[1])
	}
	wait.Wait()
	close(results)
	created, conflicted := 0, 0
	for err := range results {
		switch {
		case err == nil:
			created++
		case errors.Is(err, domain.ErrConnectionExists):
			conflicted++
		default:
			t.Fatal(err)
		}
	}
	if created != 1 || conflicted != 1 {
		t.Fatalf("racing requests: created=%d conflicted=%d", created, conflicted)
	}
}
