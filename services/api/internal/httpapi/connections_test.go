package httpapi

import (
	"github.com/kabeerx9/decio/services/api/internal/domain"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestConnectionRoutesRequireSessionAndRejectSelfRequest(t *testing.T) {
	server := NewHandler(&fakeProfiles{}, testAuth, nil)
	for _, endpoint := range []struct{ method, path string }{{http.MethodPost, "/v1/connections"}, {http.MethodPost, "/v1/connections/user_2/accept"}, {http.MethodGet, "/v1/connections"}} {
		request := httptest.NewRequest(endpoint.method, endpoint.path, strings.NewReader(`{"userId":"user_2"}`))
		response := httptest.NewRecorder()
		server.ServeHTTP(response, request)
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("%s without session: status=%d", endpoint.path, response.Code)
		}
	}
	request := httptest.NewRequest(http.MethodPost, "/v1/connections", strings.NewReader(`{"userId":"user_from_verified_token"}`))
	request.Header.Set("Authorization", "Bearer good-session")
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("self-request status=%d, want 400", response.Code)
	}
	for _, body := range []string{`{"userId":""}`, `{"userId":"other","status":"accepted"}`, `{"userId":"other"} {}`} {
		request := httptest.NewRequest(http.MethodPost, "/v1/connections", strings.NewReader(body))
		request.Header.Set("Authorization", "Bearer good-session")
		response := httptest.NewRecorder()
		server.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("invalid body %q: status=%d", body, response.Code)
		}
	}
}

func TestConnectionRoutesUseVerifiedIdentityAndMapStateErrors(t *testing.T) {
	profiles := &fakeProfiles{}
	server := NewHandler(profiles, testAuth, nil)
	request := func(method, path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Authorization", "Bearer good-session")
		response := httptest.NewRecorder()
		server.ServeHTTP(response, r)
		return response
	}
	if response := request(http.MethodPost, "/v1/connections", `{"userId":"other"}`); response.Code != http.StatusCreated || profiles.connectionRequester != "user_from_verified_token" || profiles.connectionRecipient != "other" {
		t.Fatalf("request status=%d from=%q to=%q", response.Code, profiles.connectionRequester, profiles.connectionRecipient)
	}
	profiles.err = domain.ErrConnectionExists
	if response := request(http.MethodPost, "/v1/connections", `{"userId":"other"}`); response.Code != http.StatusConflict {
		t.Fatalf("duplicate status=%d", response.Code)
	}
	profiles.err = domain.ErrProfileIncomplete
	if response := request(http.MethodPost, "/v1/connections", `{"userId":"other"}`); response.Code != http.StatusBadRequest {
		t.Fatalf("incomplete profile status=%d", response.Code)
	}
	profiles.err = domain.ErrConnectionNotFound
	if response := request(http.MethodPost, "/v1/connections/other/accept", ""); response.Code != http.StatusNotFound || profiles.connectionRecipient != "user_from_verified_token" {
		t.Fatalf("non-recipient accept status=%d recipient=%q", response.Code, profiles.connectionRecipient)
	}
	profiles.err = nil
	if response := request(http.MethodPost, "/v1/connections/other/accept", ""); response.Code != http.StatusNoContent {
		t.Fatalf("accept status=%d", response.Code)
	}
	profiles.connectionResult = []domain.Connection{{Other: domain.Profile{ID: "other", DisplayName: "Other", Interests: []string{}}, Status: "accepted"}}
	response := request(http.MethodGet, "/v1/connections", "")
	if response.Code != http.StatusOK || profiles.requestedID != "user_from_verified_token" || !strings.Contains(response.Body.String(), `"status":"accepted"`) || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("list status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestRemoveConnectionUsesVerifiedIdentityAndMapsMissingToNotFound(t *testing.T) {
	profiles := &fakeProfiles{}
	server := NewHandler(profiles, testAuth, nil)
	remove := func(path, auth string) int {
		r := httptest.NewRequest(http.MethodDelete, path, nil)
		if auth != "" {
			r.Header.Set("Authorization", auth)
		}
		response := httptest.NewRecorder()
		server.ServeHTTP(response, r)
		return response.Code
	}
	if status := remove("/v1/connections/other", ""); status != http.StatusUnauthorized || profiles.removedBy != "" {
		t.Fatalf("remove without session: status=%d removedBy=%q", status, profiles.removedBy)
	}
	if status := remove("/v1/connections/user_from_verified_token", "Bearer good-session"); status != http.StatusBadRequest || profiles.removedBy != "" {
		t.Fatalf("self remove: status=%d", status)
	}
	if status := remove("/v1/connections/other", "Bearer good-session"); status != http.StatusNoContent || profiles.removedBy != "user_from_verified_token" || profiles.removedOther != "other" {
		t.Fatalf("remove status=%d by=%q other=%q", status, profiles.removedBy, profiles.removedOther)
	}
	profiles.err = domain.ErrConnectionNotFound
	if status := remove("/v1/connections/other", "Bearer good-session"); status != http.StatusNotFound {
		t.Fatalf("no pending request status=%d", status)
	}
}
