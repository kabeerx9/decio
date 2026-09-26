package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeProfiles struct {
	requestedID string
	profile     Profile
	err         error
}

func (f *fakeProfiles) FindOrCreate(_ context.Context, id string) (Profile, error) {
	f.requestedID = id
	return f.profile, f.err
}

func testAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer good-session" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(WithUserID(r.Context(), "user_from_verified_token")))
	})
}

func TestMeUsesVerifiedIdentity(t *testing.T) {
	profiles := &fakeProfiles{profile: Profile{ID: "user_from_verified_token"}}
	server := NewHandler(profiles, testAuth)
	request := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	request.Header.Set("Authorization", "Bearer good-session")
	response := httptest.NewRecorder()

	server.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", response.Code, response.Body.String())
	}
	if profiles.requestedID != "user_from_verified_token" {
		t.Fatalf("profile lookup used %q", profiles.requestedID)
	}
	if !strings.Contains(response.Body.String(), `"id":"user_from_verified_token"`) {
		t.Fatalf("response omitted profile identity: %s", response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("profile response must not be cached")
	}
}

func TestMeRejectsMissingOrInvalidSession(t *testing.T) {
	for _, token := range []string{"", "Bearer invalid"} {
		t.Run(token, func(t *testing.T) {
			profiles := &fakeProfiles{}
			server := NewHandler(profiles, testAuth)
			request := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
			request.Header.Set("Authorization", token)
			response := httptest.NewRecorder()

			server.ServeHTTP(response, request)

			if response.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want 401", response.Code)
			}
			if profiles.requestedID != "" {
				t.Fatal("profile storage was reached without a verified session")
			}
		})
	}
}

func TestMeDoesNotLeakStorageErrors(t *testing.T) {
	profiles := &fakeProfiles{err: errors.New("database password: private")}
	server := NewHandler(profiles, testAuth)
	request := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	request.Header.Set("Authorization", "Bearer good-session")
	response := httptest.NewRecorder()

	server.ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError || strings.Contains(response.Body.String(), "private") {
		t.Fatalf("storage error leaked: %d %s", response.Code, response.Body.String())
	}
}
