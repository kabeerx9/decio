package postgres

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/kabeerx9/decio/services/api/internal/domain"
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
		if _, err := store.SetProfileImageURL(ctx, id, "https://images.clerk.test/avatar.jpg"); err != nil {
			t.Fatal(err)
		}
		if _, err := store.CompleteOnboarding(ctx, id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := store.SetProfileImageURL(ctx, ids[1], "https://images.clerk.test/connection.jpg"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.FindOrCreate(ctx, ids[3]); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Update(ctx, ids[3], domain.ProfileInput{DisplayName: "Unfinished User", City: "Mumbai", Interests: []string{}}); err != nil {
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

func TestRemovePendingConnection(t *testing.T) {
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
	a, b, c := completedConnectionUsers(t, ctx, store, "remove")
	status := func(user string) []string {
		t.Helper()
		list, err := store.ListConnections(ctx, user)
		if err != nil {
			t.Fatal(err)
		}
		statuses := []string{}
		for _, item := range list {
			statuses = append(statuses, item.Status)
		}
		return statuses
	}

	if err := store.RemovePendingConnection(ctx, a, b); !errors.Is(err, domain.ErrConnectionNotFound) {
		t.Fatalf("remove without request: %v", err)
	}
	if err := store.RequestConnection(ctx, a, b); err != nil {
		t.Fatal(err)
	}
	if err := store.RemovePendingConnection(ctx, c, a); !errors.Is(err, domain.ErrConnectionNotFound) {
		t.Fatalf("outsider removed a request: %v", err)
	}
	if err := store.RemovePendingConnection(ctx, a, b); err != nil {
		t.Fatalf("requester unsend: %v", err)
	}
	if got := status(a); len(got) != 0 {
		t.Fatalf("unsent request still listed for requester: %v", got)
	}
	if got := status(b); len(got) != 0 {
		t.Fatalf("unsent request still listed for recipient: %v", got)
	}

	if err := store.RequestConnection(ctx, a, b); err != nil {
		t.Fatalf("unsend must free the pair for a new request: %v", err)
	}
	if err := store.RemovePendingConnection(ctx, b, a); err != nil {
		t.Fatalf("recipient decline: %v", err)
	}
	if got := status(b); len(got) != 0 {
		t.Fatalf("declined request still listed: %v", got)
	}

	if err := store.RequestConnection(ctx, a, b); err != nil {
		t.Fatal(err)
	}
	if err := store.AcceptConnection(ctx, b, a); err != nil {
		t.Fatal(err)
	}
	if err := store.RemovePendingConnection(ctx, a, b); !errors.Is(err, domain.ErrConnectionNotFound) {
		t.Fatalf("accepted connection must not be removable here: %v", err)
	}
	if got := status(a); len(got) != 1 || got[0] != "accepted" {
		t.Fatalf("accepted connection changed: %v", got)
	}

	// Unsend racing accept: exactly one write may win.
	if err := store.RequestConnection(ctx, a, c); err != nil {
		t.Fatal(err)
	}
	results := make(chan error, 2)
	go func() { results <- store.RemovePendingConnection(ctx, a, c) }()
	go func() { results <- store.AcceptConnection(ctx, c, a) }()
	won, lost := 0, 0
	for range 2 {
		switch err := <-results; {
		case err == nil:
			won++
		case errors.Is(err, domain.ErrConnectionNotFound):
			lost++
		default:
			t.Fatal(err)
		}
	}
	if won != 1 || lost != 1 {
		t.Fatalf("unsend vs accept: won=%d lost=%d", won, lost)
	}
}

// completedConnectionUsers creates three onboarded profiles and removes them
// and their connections when the test ends.
func completedConnectionUsers(t *testing.T, ctx context.Context, store *Store, label string) (string, string, string) {
	t.Helper()
	prefix := fmt.Sprintf("test_%s_%d", label, time.Now().UnixNano())
	ids := []string{prefix + "_a", prefix + "_b", prefix + "_c"}
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
	for _, id := range ids {
		if _, err := store.Update(ctx, id, domain.ProfileInput{DisplayName: id, City: "Mumbai", Interests: []string{}}); err != nil {
			t.Fatal(err)
		}
		if _, err := store.SetProfileImageURL(ctx, id, "https://images.clerk.test/avatar.jpg"); err != nil {
			t.Fatal(err)
		}
		if _, err := store.CompleteOnboarding(ctx, id); err != nil {
			t.Fatal(err)
		}
	}
	return ids[0], ids[1], ids[2]
}
