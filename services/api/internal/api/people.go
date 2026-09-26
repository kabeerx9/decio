package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"unicode/utf8"
)

var ErrProfileNotFound = errors.New("profile not found")

type PeoplePage struct {
	People     []Profile `json:"people"`
	NextCursor string    `json:"nextCursor"`
}

func registerPeopleRoutes(mux *http.ServeMux, profiles ProfileStore, authenticate Middleware) {
	mux.Handle("GET /v1/people", authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		viewerID, ok := userID(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		query := strings.TrimSpace(r.URL.Query().Get("q"))
		cursor := r.URL.Query().Get("cursor")
		if utf8.RuneCountInString(query) > 80 || len(cursor) > 256 {
			http.Error(w, "invalid search parameters", http.StatusBadRequest)
			return
		}
		page, err := profiles.SearchPeople(r.Context(), viewerID, query, cursor)
		if err != nil {
			log.Printf("search people: %v", err)
			http.Error(w, "people unavailable", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(page); err != nil {
			log.Printf("encode people: %v", err)
		}
	})))
	mux.Handle("GET /v1/people/{id}", authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if _, ok := userID(r.Context()); !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		profile, err := profiles.PublicProfile(r.Context(), r.PathValue("id"))
		if errors.Is(err, ErrProfileNotFound) {
			http.Error(w, "profile not found", http.StatusNotFound)
			return
		}
		if err != nil {
			log.Printf("load public profile: %v", err)
			http.Error(w, "profile unavailable", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(profile); err != nil {
			log.Printf("encode public profile: %v", err)
		}
	})))
}
