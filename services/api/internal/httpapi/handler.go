package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/kabeerx9/decio-update/services/api/internal/domain"
)

type ProfileStore interface {
	FindOrCreate(ctx context.Context, clerkUserID string) (domain.Profile, error)
	Update(ctx context.Context, clerkUserID string, input domain.ProfileInput) (domain.Profile, error)
}

type Store interface {
	ProfileStore
	PeopleStore
	ConnectionStore
	PostStore
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

func NewHandler(storage Store, authenticate Middleware) http.Handler {
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
		profile, err := storage.FindOrCreate(r.Context(), id)
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
		var input domain.ProfileInput
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
		profile, err := storage.Update(r.Context(), id, input)
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
	registerPeopleRoutes(mux, storage, authenticate)
	registerConnectionRoutes(mux, storage, authenticate)
	registerPostRoutes(mux, storage, authenticate)
	return mux
}
