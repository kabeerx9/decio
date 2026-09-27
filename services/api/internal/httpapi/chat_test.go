package httpapi

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kabeerx9/decio/services/api/internal/domain"
)

func TestChatRoutesAuthorizeAndValidate(t *testing.T) {
	store := &fakeProfiles{}
	events := &fakeRealtime{}
	server := NewHandler(store, testAuth, events)
	call := func(method, path, body string, authorized bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		if authorized {
			r.Header.Set("Authorization", "Bearer good-session")
		}
		w := httptest.NewRecorder()
		server.ServeHTTP(w, r)
		return w
	}
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		if w := call(method, "/v1/chats/other/messages", "", false); w.Code != http.StatusUnauthorized {
			t.Fatalf("%s unauthenticated status=%d", method, w.Code)
		}
	}
	if w := call(http.MethodGet, "/v1/chats/user_from_verified_token/messages", "", true); w.Code != http.StatusBadRequest {
		t.Fatalf("self-chat status=%d", w.Code)
	}
	if w := call(http.MethodGet, "/v1/chats/other/messages?cursor=bad", "", true); w.Code != http.StatusBadRequest {
		t.Fatalf("invalid cursor status=%d", w.Code)
	}
	for _, body := range []string{`{"clientMessageId":"id_1","body":"   "}`, `{"clientMessageId":"bad id","body":"hi"}`, `{"clientMessageId":"id_1","body":"hi","senderId":"other"}`, `{"clientMessageId":"id_1","body":"hi"} {}`} {
		if w := call(http.MethodPost, "/v1/chats/other/messages", body, true); w.Code != http.StatusBadRequest {
			t.Fatalf("invalid body %q status=%d", body, w.Code)
		}
	}
	store.err = domain.ErrChatUnavailable
	if w := call(http.MethodGet, "/v1/chats/other/messages", "", true); w.Code != http.StatusForbidden {
		t.Fatalf("non-participant history status=%d", w.Code)
	}
	if w := call(http.MethodPost, "/v1/chats/other/messages", `{"clientMessageId":"id_1","body":"hi"}`, true); w.Code != http.StatusForbidden || len(events.messagePublished) != 0 {
		t.Fatalf("non-participant send status=%d events=%v", w.Code, events.messagePublished)
	}
}

func TestChatHistoryAndSendUseVerifiedIdentity(t *testing.T) {
	store := &fakeProfiles{messagePage: domain.MessagePage{Messages: []domain.DirectMessage{}, NextCursor: ""}, messageResult: domain.DirectMessage{ID: "42", SenderID: "user_from_verified_token", Body: "hello"}}
	events := &fakeRealtime{pubErr: errors.New("Ably unavailable")}
	server := NewHandler(store, testAuth, events)
	call := func(method, path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Authorization", "Bearer good-session")
		w := httptest.NewRecorder()
		server.ServeHTTP(w, r)
		return w
	}
	if w := call(http.MethodGet, "/v1/chats/other/messages?cursor=50", ""); w.Code != http.StatusOK || store.requestedID != "user_from_verified_token" || store.messageOtherID != "other" || store.messageCursor != "50" || w.Header().Get("Cache-Control") != "no-store" || !strings.Contains(w.Body.String(), `"messages":[]`) {
		t.Fatalf("history status=%d body=%s", w.Code, w.Body.String())
	}
	w := call(http.MethodPost, "/v1/chats/other/messages", `{"clientMessageId":"msg-123","body":" hello "}`)
	if w.Code != http.StatusCreated || store.requestedID != "user_from_verified_token" || store.messageClientID != "msg-123" || store.messageBody != "hello" || !strings.Contains(w.Body.String(), `"id":"42"`) {
		t.Fatalf("send status=%d body=%s", w.Code, w.Body.String())
	}
	if len(events.messagePublished) != 2 || events.messagePublished[0] != "user_from_verified_token/other/42" || events.messagePublished[1] != "other/user_from_verified_token/42" {
		t.Fatalf("message events=%v", events.messagePublished)
	}
	store.err = domain.ErrMessageConflict
	if w := call(http.MethodPost, "/v1/chats/other/messages", `{"clientMessageId":"msg-123","body":"different"}`); w.Code != http.StatusConflict || len(events.messagePublished) != 2 {
		t.Fatalf("conflicting retry status=%d events=%v", w.Code, events.messagePublished)
	}
}

func TestMarkMessagesReadUsesVerifiedIdentityAndValidMessage(t *testing.T) {
	store := &fakeProfiles{}
	server := NewHandler(store, testAuth, &fakeRealtime{})
	call := func(path, body string, authorized bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		if authorized {
			r.Header.Set("Authorization", "Bearer good-session")
		}
		w := httptest.NewRecorder()
		server.ServeHTTP(w, r)
		return w
	}
	if w := call("/v1/chats/other/read", `{"messageId":"42"}`, false); w.Code != http.StatusUnauthorized || store.readMessageID != "" {
		t.Fatalf("unauthenticated read status=%d", w.Code)
	}
	for _, body := range []string{`{"messageId":"0"}`, `{"messageId":"bad"}`, `{"messageId":"42","viewerId":"other"}`, `{"messageId":"42"} {}`} {
		if w := call("/v1/chats/other/read", body, true); w.Code != http.StatusBadRequest {
			t.Fatalf("invalid read marker %q status=%d", body, w.Code)
		}
	}
	if w := call("/v1/chats/user_from_verified_token/read", `{"messageId":"42"}`, true); w.Code != http.StatusBadRequest {
		t.Fatalf("self read status=%d", w.Code)
	}
	store.err = domain.ErrChatUnavailable
	if w := call("/v1/chats/other/read", `{"messageId":"42"}`, true); w.Code != http.StatusForbidden {
		t.Fatalf("unavailable chat status=%d", w.Code)
	}
	store.err = nil
	if w := call("/v1/chats/other/read", `{"messageId":"42"}`, true); w.Code != http.StatusNoContent || store.requestedID != "user_from_verified_token" || store.messageOtherID != "other" || store.readMessageID != "42" {
		t.Fatalf("read status=%d caller=%q peer=%q message=%q", w.Code, store.requestedID, store.messageOtherID, store.readMessageID)
	}
}
