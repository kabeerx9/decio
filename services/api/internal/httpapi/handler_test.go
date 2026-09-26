package httpapi

import (
	"context"
	"errors"
	"github.com/kabeerx9/decio-update/services/api/internal/domain"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeProfiles struct {
	requestedID         string
	profile             domain.Profile
	err                 error
	updated             domain.ProfileInput
	searchQuery         string
	searchCursor        string
	searchResult        domain.PeoplePage
	publicID            string
	connectionRequester string
	connectionRecipient string
	connectionResult    []domain.Connection
	postResult          domain.Post
	postPage            domain.PostPage
	postBody            string
	postPhoto           []byte
	postKind            string
	postCursor          string
}

func (f *fakeProfiles) CreatePost(_ context.Context, id, body string, photo []byte, kind string) (domain.Post, error) {
	f.requestedID, f.postBody, f.postPhoto, f.postKind = id, body, photo, kind
	return f.postResult, f.err
}

func (f *fakeProfiles) ListPosts(_ context.Context, id, cursor string) (domain.PostPage, error) {
	f.requestedID, f.postCursor = id, cursor
	return f.postPage, f.err
}

func (f *fakeProfiles) PostPhoto(_ context.Context, id, postID string) ([]byte, string, error) {
	f.requestedID, f.publicID = id, postID
	return f.postPhoto, f.postKind, f.err
}

func (f *fakeProfiles) FindOrCreate(_ context.Context, id string) (domain.Profile, error) {
	f.requestedID = id
	return f.profile, f.err
}

func (f *fakeProfiles) Update(_ context.Context, id string, input domain.ProfileInput) (domain.Profile, error) {
	f.requestedID = id
	f.updated = input
	return domain.Profile{ID: id, DisplayName: input.DisplayName, City: input.City, Bio: input.Bio, Headline: input.Headline, Interests: input.Interests}, f.err
}

func (f *fakeProfiles) SearchPeople(_ context.Context, viewerID, query, cursor string) (domain.PeoplePage, error) {
	f.requestedID, f.searchQuery, f.searchCursor = viewerID, query, cursor
	return f.searchResult, f.err
}

func (f *fakeProfiles) PublicProfile(_ context.Context, id string) (domain.Profile, error) {
	f.publicID = id
	return f.profile, f.err
}

func (f *fakeProfiles) RequestConnection(_ context.Context, requesterID, recipientID string) error {
	f.connectionRequester, f.connectionRecipient = requesterID, recipientID
	return f.err
}

func (f *fakeProfiles) AcceptConnection(_ context.Context, recipientID, requesterID string) error {
	f.connectionRequester, f.connectionRecipient = requesterID, recipientID
	return f.err
}

func (f *fakeProfiles) ListConnections(_ context.Context, id string) ([]domain.Connection, error) {
	f.requestedID = id
	return f.connectionResult, f.err
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
	profiles := &fakeProfiles{profile: domain.Profile{ID: "user_from_verified_token"}}
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

func TestPeopleSearchUsesVerifiedViewerAndReturnsPage(t *testing.T) {
	profiles := &fakeProfiles{searchResult: domain.PeoplePage{People: []domain.Profile{{ID: "other", DisplayName: "Asha", City: "Mumbai", Interests: []string{}}}, NextCursor: "other"}}
	request := httptest.NewRequest(http.MethodGet, "/v1/people?q=+mUmbai+&cursor=before", nil)
	request.Header.Set("Authorization", "Bearer good-session")
	response := httptest.NewRecorder()
	NewHandler(profiles, testAuth).ServeHTTP(response, request)
	if response.Code != http.StatusOK || profiles.requestedID != "user_from_verified_token" || profiles.searchQuery != "mUmbai" || profiles.searchCursor != "before" {
		t.Fatalf("search status=%d viewer=%q query=%q cursor=%q", response.Code, profiles.requestedID, profiles.searchQuery, profiles.searchCursor)
	}
	if !strings.Contains(response.Body.String(), `"displayName":"Asha"`) || !strings.Contains(response.Body.String(), `"nextCursor":"other"`) {
		t.Fatalf("unexpected search page: %s", response.Body.String())
	}
}

func TestPeopleSearchRequiresSessionAndBoundsQuery(t *testing.T) {
	for _, test := range []struct {
		path, token string
		want        int
	}{
		{"/v1/people?q=Mumbai", "", http.StatusUnauthorized},
		{"/v1/people?q=" + strings.Repeat("x", 81), "Bearer good-session", http.StatusBadRequest},
	} {
		profiles := &fakeProfiles{}
		request := httptest.NewRequest(http.MethodGet, test.path, nil)
		request.Header.Set("Authorization", test.token)
		response := httptest.NewRecorder()
		NewHandler(profiles, testAuth).ServeHTTP(response, request)
		if response.Code != test.want || profiles.requestedID != "" {
			t.Fatalf("path=%q status=%d storage viewer=%q", test.path, response.Code, profiles.requestedID)
		}
	}
}

func TestPublicProfileShowsOnlyPublicFields(t *testing.T) {
	profiles := &fakeProfiles{profile: domain.Profile{ID: "other", DisplayName: "Asha", City: "Mumbai", Bio: "Hello", Interests: []string{"Go"}}}
	request := httptest.NewRequest(http.MethodGet, "/v1/people/other", nil)
	request.Header.Set("Authorization", "Bearer good-session")
	response := httptest.NewRecorder()
	NewHandler(profiles, testAuth).ServeHTTP(response, request)
	if response.Code != http.StatusOK || profiles.publicID != "other" || strings.Contains(response.Body.String(), "email") || !strings.Contains(response.Body.String(), `"bio":"Hello"`) {
		t.Fatalf("public profile status=%d id=%q body=%s", response.Code, profiles.publicID, response.Body.String())
	}
}

func TestPublicProfileMissingReturns404(t *testing.T) {
	profiles := &fakeProfiles{err: domain.ErrProfileNotFound}
	request := httptest.NewRequest(http.MethodGet, "/v1/people/missing", nil)
	request.Header.Set("Authorization", "Bearer good-session")
	response := httptest.NewRecorder()
	NewHandler(profiles, testAuth).ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestPublicProfileRequiresSession(t *testing.T) {
	profiles := &fakeProfiles{}
	request := httptest.NewRequest(http.MethodGet, "/v1/people/other", nil)
	response := httptest.NewRecorder()
	NewHandler(profiles, testAuth).ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized || profiles.publicID != "" {
		t.Fatalf("unauthorized profile read reached storage: status=%d id=%q", response.Code, profiles.publicID)
	}
}
