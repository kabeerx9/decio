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

func TestChatHistoryAuthorizationPaginationAndRetries(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL for Store integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	store, err := New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(store.Close)
	stamp := time.Now().UnixNano()
	a, b, stranger := fmt.Sprintf("chat_%d_a", stamp), fmt.Sprintf("chat_%d_b", stamp), fmt.Sprintf("chat_%d_c", stamp)
	t.Cleanup(func() {
		cleanupCtx, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		for _, id := range []string{a, b, stranger} {
			if _, err := store.pool.Exec(cleanupCtx, "DELETE FROM direct_messages WHERE sender_id = $1 OR user_low = $1 OR user_high = $1", id); err != nil {
				t.Error(err)
			}
			if _, err := store.pool.Exec(cleanupCtx, "DELETE FROM connections WHERE requester_id = $1 OR recipient_id = $1", id); err != nil {
				t.Error(err)
			}
			if _, err := store.pool.Exec(cleanupCtx, "DELETE FROM profiles WHERE id = $1", id); err != nil {
				t.Error(err)
			}
		}
	})
	for _, id := range []string{a, b, stranger} {
		if _, err := store.Update(ctx, id, domain.ProfileInput{DisplayName: id, City: "Mumbai", Interests: []string{}}); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.RequestConnection(ctx, a, b); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ListMessages(ctx, a, b, ""); !errors.Is(err, domain.ErrChatUnavailable) {
		t.Fatalf("pending history: %v", err)
	}
	if _, err := store.SendMessage(ctx, a, b, "pending", "hello"); !errors.Is(err, domain.ErrChatUnavailable) {
		t.Fatalf("pending send: %v", err)
	}
	if err := store.AcceptConnection(ctx, b, a); err != nil {
		t.Fatal(err)
	}
	if page, err := store.ListMessages(ctx, a, b, ""); err != nil || len(page.Messages) != 0 {
		t.Fatalf("new conversation: %+v %v", page, err)
	}
	if _, err := store.ListMessages(ctx, stranger, a, ""); !errors.Is(err, domain.ErrChatUnavailable) {
		t.Fatalf("stranger history: %v", err)
	}
	if _, err := store.SendMessage(ctx, stranger, a, "stranger", "hello"); !errors.Is(err, domain.ErrChatUnavailable) {
		t.Fatalf("stranger send: %v", err)
	}

	var first domain.DirectMessage
	insertedIDs := make(map[string]bool)
	for i := 0; i < 23; i++ {
		message, err := store.SendMessage(ctx, a, b, fmt.Sprintf("msg_%d", i), fmt.Sprintf("hello %d", i))
		if err != nil {
			t.Fatal(err)
		}
		if insertedIDs[message.ID] || message.Body != fmt.Sprintf("hello %d", i) {
			t.Fatalf("message %d reused ID or body: %+v", i, message)
		}
		insertedIDs[message.ID] = true
		if i == 0 {
			first = message
		}
	}
	retry, err := store.SendMessage(ctx, a, b, "msg_0", "hello 0")
	if err != nil || retry.ID != first.ID {
		t.Fatalf("idempotent retry: %+v %v", retry, err)
	}
	if _, err := store.SendMessage(ctx, a, b, "msg_0", "changed"); !errors.Is(err, domain.ErrMessageConflict) {
		t.Fatalf("changed retry: %v", err)
	}
	if _, err := store.SendMessage(ctx, a, stranger, "msg_0", "hello 0"); !errors.Is(err, domain.ErrChatUnavailable) {
		t.Fatalf("unconnected retry: %v", err)
	}
	page, err := store.ListMessages(ctx, b, a, "")
	if err != nil || len(page.Messages) != 20 || page.NextCursor == "" || page.Messages[0].Body != "hello 22" {
		t.Fatalf("first page: %+v %v", page, err)
	}
	older, err := store.ListMessages(ctx, a, b, page.NextCursor)
	if err != nil || len(older.Messages) != 3 || older.NextCursor != "" || older.Messages[2].ID != first.ID {
		t.Fatalf("older page: %+v %v", older, err)
	}

	results := make(chan domain.DirectMessage, 2)
	errorsOut := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			message, err := store.SendMessage(ctx, b, a, "racing", "from b")
			results <- message
			errorsOut <- err
		}()
	}
	wg.Wait()
	close(results)
	close(errorsOut)
	for err := range errorsOut {
		if err != nil {
			t.Fatal(err)
		}
	}
	var racedID string
	for message := range results {
		if racedID == "" {
			racedID = message.ID
		} else if message.ID != racedID {
			t.Fatalf("concurrent retry created %q and %q", racedID, message.ID)
		}
	}
}
