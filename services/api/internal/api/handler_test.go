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
	updated     ProfileInput
}

func (f *fakeProfiles) FindOrCreate(_ context.Context, id string) (Profile, error) {
	f.requestedID = id
	return f.profile, f.err
}

func (f *fakeProfiles) Update(_ context.Context, id string, input ProfileInput) (Profile, error) {
	f.requestedID = id
	f.updated = input
	return Profile{ID: id, DisplayName: input.DisplayName, City: input.City, Bio: input.Bio, Headline: input.Headline, Interests: input.Interests}, f.err
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

func TestPutMeUsesVerifiedIdentityAndNormalizes(t *testing.T) {
	profiles := &fakeProfiles{}
	server := NewHandler(profiles, testAuth)
	request := httptest.NewRequest(http.MethodPut, "/v1/me", strings.NewReader(`{"displayName":"  Kabeer  ","city":" Mumbai ","bio":"  Hello  ","headline":" Builder ","interests":[" React Native ","Go"]}`))
	request.Header.Set("Authorization", "Bearer good-session")
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", response.Code, response.Body.String())
	}
	if profiles.requestedID != "user_from_verified_token" || profiles.updated.DisplayName != "Kabeer" || profiles.updated.City != "Mumbai" || profiles.updated.Interests[0] != "React Native" {
		t.Fatalf("profile save used wrong identity or fields: id=%q, input=%+v", profiles.requestedID, profiles.updated)
	}
	if !strings.Contains(response.Body.String(), `"id":"user_from_verified_token"`) {
		t.Fatalf("response omitted verified identity: %s", response.Body.String())
	}
}

func TestPutMeRejectsInvalidInputBeforeStorage(t *testing.T) {
	cases := []string{
		`{"displayName":"K","city":"Mumbai"}`,
		`{"displayName":"Kabeer","city":""}`,
		`{"displayName":"Kabeer","city":"Mumbai","interests":["Go","go"]}`,
		`{"displayName":"Kabeer","city":"Mumbai","interests":["one","two","three","four"]}`,
		`{"displayName":"Kabeer","city":"Mumbai","id":"another_user"}`,
		`{"displayName":"Kabeer","city":"Mumbai"} {}`,
	}
	for _, body := range cases {
		profiles := &fakeProfiles{}
		request := httptest.NewRequest(http.MethodPut, "/v1/me", strings.NewReader(body))
		request.Header.Set("Authorization", "Bearer good-session")
		response := httptest.NewRecorder()
		NewHandler(profiles, testAuth).ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest || profiles.requestedID != "" {
			t.Fatalf("body %s got status %d and storage id %q", body, response.Code, profiles.requestedID)
		}
	}
}

func TestPutMeRejectsMissingSession(t *testing.T) {
	profiles := &fakeProfiles{}
	request := httptest.NewRequest(http.MethodPut, "/v1/me", strings.NewReader(`{"displayName":"Kabeer","city":"Mumbai"}`))
	response := httptest.NewRecorder()
	NewHandler(profiles, testAuth).ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized || profiles.requestedID != "" {
		t.Fatalf("unauthorized write reached storage: status %d, id %q", response.Code, profiles.requestedID)
	}
}

func TestPutMeDoesNotLeakStorageErrors(t *testing.T) {
	profiles := &fakeProfiles{err: errors.New("database password: private")}
	request := httptest.NewRequest(http.MethodPut, "/v1/me", strings.NewReader(`{"displayName":"Kabeer","city":"Mumbai"}`))
	request.Header.Set("Authorization", "Bearer good-session")
	response := httptest.NewRecorder()
	NewHandler(profiles, testAuth).ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError || strings.Contains(response.Body.String(), "private") {
		t.Fatalf("storage error leaked: %d %s", response.Code, response.Body.String())
	}
}
