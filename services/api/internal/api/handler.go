package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
)

type Profile struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	City        string `json:"city"`
}

type ProfileStore interface {
	FindOrCreate(ctx context.Context, clerkUserID string) (Profile, error)
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
	return mux
}
