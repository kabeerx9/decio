package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/kabeerx9/decio/services/api/internal/domain"
	"github.com/kabeerx9/decio/services/api/internal/service"
)

var clientMessageIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

type ChatStore interface {
	SendMessage(ctx context.Context, senderID, otherID, clientMessageID, body string) (domain.DirectMessage, error)
	ListMessages(ctx context.Context, viewerID, otherID, cursor string) (domain.MessagePage, error)
	MarkMessagesRead(ctx context.Context, viewerID, otherID, messageID string) error
}

func registerChatRoutes(mux *http.ServeMux, store ChatStore, realtime Realtime, authenticate Middleware) {
	chat := service.NewChat(store, realtime)
	mux.Handle("POST /v1/chats/{id}/read", authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		viewerID, ok := userID(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		otherID := r.PathValue("id")
		if !validChatPeer(viewerID, otherID) {
			http.Error(w, "invalid chat participant", http.StatusBadRequest)
			return
		}
		var input struct {
			MessageID string `json:"messageId"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil {
			http.Error(w, "invalid read marker JSON", http.StatusBadRequest)
			return
		}
		if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
			http.Error(w, "expected one read marker", http.StatusBadRequest)
			return
		}
		messageID, err := strconv.ParseInt(input.MessageID, 10, 64)
		if err != nil || messageID < 1 {
			http.Error(w, "invalid message ID", http.StatusBadRequest)
			return
		}
		err = store.MarkMessagesRead(r.Context(), viewerID, otherID, input.MessageID)
		switch {
		case errors.Is(err, domain.ErrChatUnavailable):
			http.Error(w, "chat requires an accepted connection and message", http.StatusForbidden)
		case err != nil:
			log.Printf("mark messages read: %v", err)
			http.Error(w, "read marker unavailable", http.StatusInternalServerError)
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	})))
	mux.Handle("GET /v1/chats/{id}/messages", authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		viewerID, ok := userID(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		otherID := r.PathValue("id")
		if !validChatPeer(viewerID, otherID) {
			http.Error(w, "invalid chat participant", http.StatusBadRequest)
			return
		}
		cursor := r.URL.Query().Get("cursor")
		if cursor != "" {
			value, err := strconv.ParseInt(cursor, 10, 64)
			if err != nil || value < 1 {
				http.Error(w, "invalid cursor", http.StatusBadRequest)
				return
			}
		}
		page, err := store.ListMessages(r.Context(), viewerID, otherID, cursor)
		switch {
		case errors.Is(err, domain.ErrChatUnavailable):
			http.Error(w, "chat requires an accepted connection", http.StatusForbidden)
		case err != nil:
			log.Printf("list messages: %v", err)
			http.Error(w, "messages unavailable", http.StatusInternalServerError)
		default:
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(page)
		}
	})))
	mux.Handle("POST /v1/chats/{id}/messages", authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		senderID, ok := userID(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		otherID := r.PathValue("id")
		if !validChatPeer(senderID, otherID) {
			http.Error(w, "invalid chat participant", http.StatusBadRequest)
			return
		}
		var input struct {
			ClientMessageID string `json:"clientMessageId"`
			Body            string `json:"body"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil {
			http.Error(w, "invalid message JSON", http.StatusBadRequest)
			return
		}
		if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
			http.Error(w, "expected one message object", http.StatusBadRequest)
			return
		}
		input.Body = strings.TrimSpace(input.Body)
		if !clientMessageIDPattern.MatchString(input.ClientMessageID) || !utf8.ValidString(input.Body) || utf8.RuneCountInString(input.Body) < 1 || utf8.RuneCountInString(input.Body) > 2000 {
			http.Error(w, "message needs 1–2000 characters and a valid client message ID", http.StatusBadRequest)
			return
		}
		message, err := chat.Send(r.Context(), senderID, otherID, input.ClientMessageID, input.Body)
		switch {
		case errors.Is(err, domain.ErrChatUnavailable):
			http.Error(w, "chat requires an accepted connection", http.StatusForbidden)
		case errors.Is(err, domain.ErrMessageConflict):
			http.Error(w, "client message ID already used", http.StatusConflict)
		case err != nil:
			log.Printf("send message: %v", err)
			http.Error(w, "message unavailable", http.StatusInternalServerError)
		default:
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(message)
		}
	})))
}

func validChatPeer(userID, otherID string) bool {
	return otherID != "" && otherID != userID && len(otherID) <= 256
}
