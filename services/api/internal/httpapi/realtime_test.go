package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeRealtime struct {
	tokenUser string
	published []string
	tokenErr  error
	pubErr    error
}

func (f *fakeRealtime) TokenRequest(_ context.Context, userID string) (json.RawMessage, error) {
	f.tokenUser = userID
	return json.RawMessage(`{"clientId":"` + userID + `"}`), f.tokenErr
}

func (f *fakeRealtime) PublishConnectionChange(_ context.Context, userID string) error {
	f.published = append(f.published, userID)
	return f.pubErr
}

func TestRealtimeTokenUsesVerifiedIdentity(t *testing.T) {
	fake := &fakeRealtime{}
	server := NewHandler(&fakeProfiles{}, testAuth, fake)
	request := httptest.NewRequest(http.MethodGet, "/v1/realtime/token?userId=someone_else", nil)
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized || fake.tokenUser != "" {
		t.Fatalf("unauthorized request: status=%d token user=%q", response.Code, fake.tokenUser)
	}
	request.Header.Set("Authorization", "Bearer good-session")
	response = httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusOK || fake.tokenUser != "user_from_verified_token" || !strings.Contains(response.Body.String(), `"clientId":"user_from_verified_token"`) || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("token response: status=%d user=%q body=%s", response.Code, fake.tokenUser, response.Body.String())
	}
	fake.tokenErr = errors.New("signing failed")
	response = httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("signing failure status=%d", response.Code)
	}
}

func TestConnectionWritesPublishForBothUsersOnlyAfterSuccess(t *testing.T) {
	store := &fakeProfiles{}
	fake := &fakeRealtime{pubErr: errors.New("Ably unavailable")}
	server := NewHandler(store, testAuth, fake)
	request := func(path, body string) int {
		r := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		r.Header.Set("Authorization", "Bearer good-session")
		w := httptest.NewRecorder()
		server.ServeHTTP(w, r)
		return w.Code
	}
	if status := request("/v1/connections", `{"userId":"other"}`); status != http.StatusCreated {
		t.Fatalf("committed request with publish failure status=%d", status)
	}
	if len(fake.published) != 2 || fake.published[0] != "user_from_verified_token" || fake.published[1] != "other" {
		t.Fatalf("request published to %v", fake.published)
	}
	store.err = errors.New("database write failed")
	if status := request("/v1/connections", `{"userId":"other"}`); status != http.StatusInternalServerError || len(fake.published) != 2 {
		t.Fatalf("failed write: status=%d publishes=%v", status, fake.published)
	}
	store.err = nil
	if status := request("/v1/connections/other/accept", ""); status != http.StatusNoContent || len(fake.published) != 4 || fake.published[2] != "user_from_verified_token" || fake.published[3] != "other" {
		t.Fatalf("accepted request: status=%d publishes=%v", status, fake.published)
	}
}
