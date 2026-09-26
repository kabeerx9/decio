package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
	"unicode/utf8"
)

type Profile struct {
	ID          string   `json:"id"`
	DisplayName string   `json:"displayName"`
	City        string   `json:"city"`
	Bio         string   `json:"bio"`
	Headline    string   `json:"headline"`
	Interests   []string `json:"interests"`
}

type ProfileInput struct {
	DisplayName string   `json:"displayName"`
	City        string   `json:"city"`
	Bio         string   `json:"bio"`
	Headline    string   `json:"headline"`
	Interests   []string `json:"interests"`
}

type ProfileStore interface {
	FindOrCreate(ctx context.Context, clerkUserID string) (Profile, error)
	Update(ctx context.Context, clerkUserID string, input ProfileInput) (Profile, error)
	SearchPeople(ctx context.Context, viewerID, query, cursor string) (PeoplePage, error)
	PublicProfile(ctx context.Context, id string) (Profile, error)
}

type Middleware func(http.Handler) http.Handler

type userIDKey struct{}

func WithUserID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, userIDKey{}, id)
}

func userID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(userIDKey{}).(string)
	return id, ok && id != ""
}

func NewHandler(profiles ProfileStore, authenticate Middleware) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.Handle("GET /v1/me", authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		id, ok := userID(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		profile, err := profiles.FindOrCreate(r.Context(), id)
		if err != nil {
			log.Printf("load profile: %v", err)
			http.Error(w, "profile unavailable", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(profile); err != nil {
			log.Printf("encode profile: %v", err)
		}
	})))
	mux.Handle("PUT /v1/me", authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		id, ok := userID(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var input ProfileInput
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil {
			http.Error(w, "invalid profile JSON", http.StatusBadRequest)
			return
		}
		if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
			http.Error(w, "expected one profile object", http.StatusBadRequest)
			return
		}
		if message := input.NormalizeAndValidate(); message != "" {
			http.Error(w, message, http.StatusBadRequest)
			return
		}
		profile, err := profiles.Update(r.Context(), id, input)
		if err != nil {
			log.Printf("save profile: %v", err)
			http.Error(w, "profile unavailable", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(profile); err != nil {
			log.Printf("encode profile: %v", err)
		}
	})))
	registerPeopleRoutes(mux, profiles, authenticate)
	return mux
}

func (input *ProfileInput) NormalizeAndValidate() string {
	input.DisplayName = strings.TrimSpace(input.DisplayName)
	input.City = strings.TrimSpace(input.City)
	input.Bio = strings.TrimSpace(input.Bio)
	input.Headline = strings.TrimSpace(input.Headline)
	if n := utf8.RuneCountInString(input.DisplayName); n < 2 || n > 60 || strings.ContainsAny(input.DisplayName, "\r\n") {
		return "display name must be 2–60 characters on one line"
	}
	if n := utf8.RuneCountInString(input.City); n < 2 || n > 80 || strings.ContainsAny(input.City, "\r\n") {
		return "city must be 2–80 characters on one line"
	}
	if utf8.RuneCountInString(input.Bio) > 280 {
		return "bio must be 280 characters or fewer"
	}
	if utf8.RuneCountInString(input.Headline) > 80 || strings.ContainsAny(input.Headline, "\r\n") {
		return "headline must be 80 characters or fewer on one line"
	}
	if len(input.Interests) > 3 {
		return "choose no more than three interests"
	}
	seen := make(map[string]bool, len(input.Interests))
	for index, interest := range input.Interests {
		interest = strings.TrimSpace(interest)
		if n := utf8.RuneCountInString(interest); n < 2 || n > 24 || strings.ContainsAny(interest, "\r\n") {
			return "each interest must be 2–24 characters on one line"
		}
		key := strings.ToLower(interest)
		if seen[key] {
			return "interests must be different"
		}
		seen[key] = true
		input.Interests[index] = interest
	}
	if input.Interests == nil {
		input.Interests = []string{}
	}
	return ""
}
