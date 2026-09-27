package postgres

import (
	"context"
	"fmt"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/kabeerx9/decio-update/services/api/internal/domain"
)

func TestFindOrCreateKeepsProfilesSeparate(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL for Store integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	profiles, err := New(ctx, databaseURL)
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
	saved, err := profiles.Update(ctx, firstID, domain.ProfileInput{DisplayName: "Kabeer", City: "Mumbai", Bio: "City explorer", Headline: "Mobile engineer", Interests: []string{"Go", "Design"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := profiles.CompleteOnboarding(ctx, firstID); err != domain.ErrProfileIncomplete {
		t.Fatalf("missing photo must not complete onboarding: %v", err)
	}
	if _, err := profiles.PublicProfile(ctx, firstID); err != domain.ErrProfileNotFound {
		t.Fatalf("unfinished account must not have public profile: %v", err)
	}
	imageURL := "https://images.clerk.test/avatar.jpg"
	saved, err = profiles.SetProfileImageURL(ctx, firstID, imageURL)
	if err != nil || saved.ImageURL != imageURL {
		t.Fatalf("save image URL: %+v %v", saved, err)
	}
	saved, err = profiles.Update(ctx, firstID, domain.ProfileInput{DisplayName: "Kabeer", City: "Mumbai", Bio: "City explorer", Headline: "Mobile engineer", Interests: []string{"Go", "Design"}})
	if err != nil || saved.ImageURL != imageURL {
		t.Fatalf("profile edit must retain image URL: %+v %v", saved, err)
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
	if _, err := profiles.CompleteOnboarding(ctx, secondID); err != domain.ErrProfileIncomplete {
		t.Fatalf("blank profile must not complete onboarding: %v", err)
	}
	completed, err := profiles.CompleteOnboarding(ctx, firstID)
	if err != nil || !completed.OnboardingComplete {
		t.Fatalf("complete onboarding: %+v %v", completed, err)
	}
	completedAgain, err := profiles.CompleteOnboarding(ctx, firstID)
	if err != nil || !reflect.DeepEqual(completed, completedAgain) {
		t.Fatalf("completion must be idempotent: %+v %v", completedAgain, err)
	}
	cleared, err := profiles.SetProfileImageURL(ctx, firstID, "")
	if err != nil || cleared.ImageURL != "" || !cleared.OnboardingComplete {
		t.Fatalf("clear image URL: %+v %v", cleared, err)
	}
}

func TestSearchPeopleMatchesPublicProfilesAndPages(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL for Store integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	profiles, err := New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(profiles.Close)
	prefix := fmt.Sprintf("test_search_%d_", time.Now().UnixNano())
	ids := make([]string, 0, 24)
	t.Cleanup(func() {
		cleanupCtx, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		for _, id := range ids {
			if _, err := profiles.pool.Exec(cleanupCtx, "DELETE FROM profiles WHERE id = $1", id); err != nil {
				t.Errorf("clean up profile %s: %v", id, err)
			}
		}
	})
	for index := 0; index < 23; index++ {
		id := fmt.Sprintf("%s%02d", prefix, index)
		ids = append(ids, id)
		city, headline := prefix+"Mumbai", "Engineer"
		if index == 22 {
			city, headline = "Pune", prefix+"Illustrator"
		}
		if _, err := profiles.Update(ctx, id, domain.ProfileInput{DisplayName: fmt.Sprintf("Person %02d %s", index, prefix), City: city, Headline: headline, Interests: []string{}}); err != nil {
			t.Fatal(err)
		}
		if _, err := profiles.SetProfileImageURL(ctx, id, "https://images.clerk.test/avatar.jpg"); err != nil {
			t.Fatal(err)
		}
		if _, err := profiles.CompleteOnboarding(ctx, id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := profiles.SetProfileImageURL(ctx, ids[22], "https://images.clerk.test/illustrator.jpg"); err != nil {
		t.Fatal(err)
	}
	viewerID := ids[0]
	page, err := profiles.SearchPeople(ctx, viewerID, prefix+"mUmBaI", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(page.People) != 20 || page.People[0].ID != ids[1] || page.NextCursor != ids[20] {
		t.Fatalf("first page wrong: count=%d first=%+v cursor=%q", len(page.People), page.People[0], page.NextCursor)
	}
	second, err := profiles.SearchPeople(ctx, viewerID, prefix+"mUmBaI", page.NextCursor)
	if err != nil {
		t.Fatal(err)
	}
	if len(second.People) != 1 || second.People[0].ID != ids[21] || second.NextCursor != "" {
		t.Fatalf("second page wrong: %+v", second)
	}
	byHeadline, err := profiles.SearchPeople(ctx, viewerID, prefix+"illustrator", "")
	if err != nil || len(byHeadline.People) != 1 || byHeadline.People[0].ID != ids[22] || byHeadline.People[0].ImageURL != "https://images.clerk.test/illustrator.jpg" {
		t.Fatalf("headline search wrong: %+v %v", byHeadline, err)
	}
	byName, err := profiles.SearchPeople(ctx, viewerID, "pErSoN 21 "+prefix, "")
	if err != nil || len(byName.People) != 1 || byName.People[0].ID != ids[21] {
		t.Fatalf("name search wrong: %+v %v", byName, err)
	}
	noResults, err := profiles.SearchPeople(ctx, viewerID, prefix+"absent", "")
	if err != nil || len(noResults.People) != 0 || noResults.NextCursor != "" {
		t.Fatalf("empty search wrong: %+v %v", noResults, err)
	}
	public, err := profiles.PublicProfile(ctx, ids[22])
	if err != nil || public.ID != ids[22] || public.City != "Pune" || public.ImageURL != "https://images.clerk.test/illustrator.jpg" {
		t.Fatalf("public profile wrong: %+v %v", public, err)
	}
	if _, err := profiles.PublicProfile(ctx, prefix+"missing"); err != domain.ErrProfileNotFound {
		t.Fatalf("missing public profile error = %v", err)
	}
}
