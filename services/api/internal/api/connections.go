package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
)

var ErrConnectionExists = errors.New("connection already exists")
var ErrConnectionNotFound = errors.New("pending connection not found")
var ErrProfileIncomplete = errors.New("complete your profile first")

type Connection struct {
	Other  Profile `json:"other"`
	Status string  `json:"status"`
}

type ConnectionStore interface {
	RequestConnection(ctx context.Context, requesterID, recipientID string) error
	AcceptConnection(ctx context.Context, recipientID, requesterID string) error
	ListConnections(ctx context.Context, userID string) ([]Connection, error)
}

func registerConnectionRoutes(mux *http.ServeMux, store ConnectionStore, authenticate Middleware) {
	mux.Handle("GET /v1/connections", authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		id, ok := userID(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		connections, err := store.ListConnections(r.Context(), id)
		if err != nil {
			log.Printf("list connections: %v", err)
			http.Error(w, "connections unavailable", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(struct {
			Connections []Connection `json:"connections"`
		}{connections}); err != nil {
			log.Printf("encode connections: %v", err)
		}
	})))
	mux.Handle("POST /v1/connections", authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		id, ok := userID(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var input struct {
			UserID string `json:"userId"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil {
			http.Error(w, "invalid connection JSON", http.StatusBadRequest)
			return
		}
		if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
			http.Error(w, "expected one connection object", http.StatusBadRequest)
			return
		}
		input.UserID = strings.TrimSpace(input.UserID)
		if input.UserID == "" || len(input.UserID) > 256 || input.UserID == id {
			http.Error(w, "invalid recipient", http.StatusBadRequest)
			return
		}
		err := store.RequestConnection(r.Context(), id, input.UserID)
		switch {
		case errors.Is(err, ErrProfileIncomplete):
			http.Error(w, "complete your profile first", http.StatusBadRequest)
		case errors.Is(err, ErrProfileNotFound):
			http.Error(w, "profile not found", http.StatusNotFound)
		case errors.Is(err, ErrConnectionExists):
			http.Error(w, "connection already exists", http.StatusConflict)
		case err != nil:
			log.Printf("request connection: %v", err)
			http.Error(w, "connection unavailable", http.StatusInternalServerError)
		default:
			w.WriteHeader(http.StatusCreated)
		}
	})))
	mux.Handle("POST /v1/connections/{id}/accept", authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		id, ok := userID(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		requesterID := r.PathValue("id")
		if requesterID == "" || len(requesterID) > 256 || requesterID == id {
			http.Error(w, "invalid requester", http.StatusBadRequest)
			return
		}
		err := store.AcceptConnection(r.Context(), id, requesterID)
		switch {
		case errors.Is(err, ErrConnectionNotFound):
			http.Error(w, "pending request not found", http.StatusNotFound)
		case err != nil:
			log.Printf("accept connection: %v", err)
			http.Error(w, "connection unavailable", http.StatusInternalServerError)
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	})))
}
