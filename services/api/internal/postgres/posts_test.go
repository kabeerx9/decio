package postgres

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/kabeerx9/decio-update/services/api/internal/domain"
)

func TestCityPostsScopePaginationAndPhoto(t *testing.T) {
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
	prefix := fmt.Sprintf("post_test_%d", time.Now().UnixNano())
	author, neighbor, outsider, blank := prefix+"_author", prefix+"_neighbor", prefix+"_outsider", prefix+"_blank"
	t.Cleanup(func() {
		cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		_, _ = store.pool.Exec(cleanup, `DELETE FROM city_posts WHERE author_id = ANY($1)`, []string{author, neighbor, outsider, blank})
		_, _ = store.pool.Exec(cleanup, `DELETE FROM profiles WHERE id = ANY($1)`, []string{author, neighbor, outsider, blank})
	})
	for _, person := range []struct{ id, city string }{{author, "Mumbai"}, {neighbor, "mumbai"}, {outsider, "Delhi"}} {
		if _, err := store.Update(ctx, person.id, domain.ProfileInput{DisplayName: person.id, City: person.city, Interests: []string{}}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := store.FindOrCreate(ctx, blank); err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreatePost(ctx, blank, "bad", nil, ""); !errors.Is(err, domain.ErrProfileIncomplete) {
		t.Fatalf("blank profile: %v", err)
	}
	page, err := store.ListPosts(ctx, blank, "")
	if err != nil || page.City != "" || len(page.Posts) != 0 {
		t.Fatalf("blank city: %+v %v", page, err)
	}
	for i := 0; i < 22; i++ {
		var photo []byte
		var kind string
		if i == 0 {
			photo, kind = []byte("image data"), "image/jpeg"
		}
		post, err := store.CreatePost(ctx, author, fmt.Sprintf("post %d", i), photo, kind)
		if err != nil || post.City != "Mumbai" || post.AuthorID != author || post.HasPhoto != (i == 0) {
			t.Fatalf("create: %+v %v", post, err)
		}
	}
	if _, err := store.CreatePost(ctx, outsider, "Delhi post", nil, ""); err != nil {
		t.Fatal(err)
	}
	first, err := store.ListPosts(ctx, neighbor, "")
	if err != nil || len(first.Posts) != 20 || first.NextCursor == "" {
		t.Fatalf("first page: %d cursor=%q err=%v", len(first.Posts), first.NextCursor, err)
	}
	second, err := store.ListPosts(ctx, neighbor, first.NextCursor)
	if err != nil || len(second.Posts) != 2 || second.NextCursor != "" || second.Posts[1].Body != "post 0" {
		t.Fatalf("second page: %+v err=%v", second, err)
	}
	for _, post := range append(first.Posts, second.Posts...) {
		if post.City != "Mumbai" {
			t.Fatalf("cross-city post: %+v", post)
		}
	}
	photoID := second.Posts[1].ID
	data, kind, err := store.PostPhoto(ctx, neighbor, photoID)
	if err != nil || string(data) != "image data" || kind != "image/jpeg" {
		t.Fatalf("same-city photo: %q %q %v", data, kind, err)
	}
	if _, _, err := store.PostPhoto(ctx, outsider, photoID); !errors.Is(err, domain.ErrPostNotFound) {
		t.Fatalf("cross-city photo: %v", err)
	}
	if _, _, err := store.PostPhoto(ctx, blank, photoID); !errors.Is(err, domain.ErrPostNotFound) {
		t.Fatalf("blank-city photo: %v", err)
	}
	if _, err := store.Update(ctx, neighbor, domain.ProfileInput{DisplayName: neighbor, City: "Delhi", Interests: []string{}}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := store.PostPhoto(ctx, neighbor, photoID); !errors.Is(err, domain.ErrPostNotFound) {
		t.Fatalf("moved-city photo: %v", err)
	}
}
