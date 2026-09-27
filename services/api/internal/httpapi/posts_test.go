package httpapi

import (
	"bytes"
	"github.com/kabeerx9/decio-update/services/api/internal/domain"
	"image"
	"image/color"
	"image/jpeg"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPostRoutesRequireSession(t *testing.T) {
	server := NewHandler(&fakeProfiles{}, testAuth, nil)
	for _, endpoint := range []struct{ method, path string }{
		{http.MethodPost, "/v1/posts"},
		{http.MethodGet, "/v1/posts"},
		{http.MethodGet, "/v1/posts/1/photo"},
		{http.MethodGet, "/v1/posts/1/replies"},
		{http.MethodPost, "/v1/posts/1/replies"},
	} {
		request := httptest.NewRequest(endpoint.method, endpoint.path, nil)
		response := httptest.NewRecorder()
		server.ServeHTTP(response, request)
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s without session: status=%d", endpoint.method, endpoint.path, response.Code)
		}
	}
}

func TestReplyRoutesValidateAndUseVerifiedViewer(t *testing.T) {
	store := &fakeProfiles{replyResult: domain.PostReply{ID: "7"}, replyPage: domain.ReplyPage{Replies: []domain.PostReply{}}}
	server := NewHandler(store, testAuth, nil)
	request := httptest.NewRequest(http.MethodPost, "/v1/posts/23/replies", strings.NewReader(`{"body":"  Hello neighbor  "}`))
	request.Header.Set("Authorization", "Bearer good-session")
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusCreated || store.requestedID != "user_from_verified_token" || store.publicID != "23" || store.replyBody != "Hello neighbor" {
		t.Fatalf("create reply: status=%d viewer=%q post=%q body=%q", response.Code, store.requestedID, store.publicID, store.replyBody)
	}
	for _, body := range []string{`{"body":" "}`, `{"body":"hello","extra":1}`, `{"body":"hello"}{}`, `{"body":"` + strings.Repeat("a", 1001) + `"}`} {
		store.replyBody = ""
		request = httptest.NewRequest(http.MethodPost, "/v1/posts/23/replies", strings.NewReader(body))
		request.Header.Set("Authorization", "Bearer good-session")
		response = httptest.NewRecorder()
		server.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest || store.replyBody != "" {
			t.Fatalf("invalid reply: status=%d body=%q", response.Code, store.replyBody)
		}
	}
	request = httptest.NewRequest(http.MethodGet, "/v1/posts/23/replies?cursor=4", nil)
	request.Header.Set("Authorization", "Bearer good-session")
	response = httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusOK || store.requestedID != "user_from_verified_token" || store.publicID != "23" || store.replyCursor != "4" {
		t.Fatalf("list replies: status=%d viewer=%q post=%q cursor=%q", response.Code, store.requestedID, store.publicID, store.replyCursor)
	}
	store.err = domain.ErrPostNotFound
	response = httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("hidden post: status=%d", response.Code)
	}
}

func postRequest(t *testing.T, body string, photo []byte) *http.Request {
	t.Helper()
	var data bytes.Buffer
	writer := multipart.NewWriter(&data)
	if err := writer.WriteField("body", body); err != nil {
		t.Fatal(err)
	}
	if photo != nil {
		part, err := writer.CreateFormFile("photo", "photo.jpg")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(photo); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/v1/posts", &data)
	request.Header.Set("Authorization", "Bearer good-session")
	request.Header.Set("Content-Type", writer.FormDataContentType())
	return request
}

func TestCreatePostUsesVerifiedAuthorAndNormalizesPhoto(t *testing.T) {
	var raw bytes.Buffer
	photo := image.NewRGBA(image.Rect(0, 0, 1, 1))
	photo.Set(0, 0, color.RGBA{R: 1, G: 2, B: 3, A: 255})
	if err := jpeg.Encode(&raw, photo, nil); err != nil {
		t.Fatal(err)
	}
	store := &fakeProfiles{postResult: domain.Post{ID: "1"}}
	response := httptest.NewRecorder()
	NewHandler(store, testAuth, nil).ServeHTTP(response, postRequest(t, "  City hello  ", raw.Bytes()))
	if response.Code != http.StatusCreated || store.requestedID != "user_from_verified_token" || store.postBody != "City hello" || store.postKind != "image/jpeg" || len(store.postPhoto) == 0 {
		t.Fatalf("status=%d author=%q body=%q photoType=%q photoBytes=%d", response.Code, store.requestedID, store.postBody, store.postKind, len(store.postPhoto))
	}
}

func TestCreatePostRejectsInvalidInputAndIncompleteProfile(t *testing.T) {
	for _, body := range []string{"  ", strings.Repeat("a", 1001)} {
		store := &fakeProfiles{}
		response := httptest.NewRecorder()
		NewHandler(store, testAuth, nil).ServeHTTP(response, postRequest(t, body, nil))
		if response.Code != http.StatusBadRequest || store.requestedID != "" {
			t.Fatalf("invalid body status=%d storage=%q", response.Code, store.requestedID)
		}
	}
	store := &fakeProfiles{}
	response := httptest.NewRecorder()
	NewHandler(store, testAuth, nil).ServeHTTP(response, postRequest(t, "hello", []byte("not an image")))
	if response.Code != http.StatusBadRequest || store.requestedID != "" {
		t.Fatalf("invalid photo status=%d storage=%q", response.Code, store.requestedID)
	}
	store = &fakeProfiles{err: domain.ErrProfileIncomplete}
	response = httptest.NewRecorder()
	NewHandler(store, testAuth, nil).ServeHTTP(response, postRequest(t, "hello", nil))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("incomplete profile status=%d", response.Code)
	}
}

func TestPostReadUsesVerifiedViewerAndValidatesCursor(t *testing.T) {
	store := &fakeProfiles{postPage: domain.PostPage{City: "Mumbai", Posts: []domain.Post{}, NextCursor: ""}}
	request := httptest.NewRequest(http.MethodGet, "/v1/posts?cursor=21", nil)
	request.Header.Set("Authorization", "Bearer good-session")
	response := httptest.NewRecorder()
	NewHandler(store, testAuth, nil).ServeHTTP(response, request)
	if response.Code != http.StatusOK || store.requestedID != "user_from_verified_token" || store.postCursor != "21" || !strings.Contains(response.Body.String(), `"city":"Mumbai"`) {
		t.Fatalf("status=%d viewer=%q cursor=%q body=%s", response.Code, store.requestedID, store.postCursor, response.Body.String())
	}
	store = &fakeProfiles{}
	request = httptest.NewRequest(http.MethodGet, "/v1/posts?cursor=bad", nil)
	request.Header.Set("Authorization", "Bearer good-session")
	response = httptest.NewRecorder()
	NewHandler(store, testAuth, nil).ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || store.requestedID != "" {
		t.Fatalf("invalid cursor status=%d viewer=%q", response.Code, store.requestedID)
	}
}

func TestPhotoReadUsesVerifiedViewer(t *testing.T) {
	store := &fakeProfiles{postPhoto: []byte("image"), postKind: "image/jpeg"}
	request := httptest.NewRequest(http.MethodGet, "/v1/posts/23/photo", nil)
	request.Header.Set("Authorization", "Bearer good-session")
	response := httptest.NewRecorder()
	NewHandler(store, testAuth, nil).ServeHTTP(response, request)
	if response.Code != http.StatusOK || store.requestedID != "user_from_verified_token" || store.publicID != "23" || response.Header().Get("Cache-Control") != "no-store" || response.Body.String() != "image" {
		t.Fatalf("status=%d viewer=%q post=%q", response.Code, store.requestedID, store.publicID)
	}
	store.err = domain.ErrPostNotFound
	response = httptest.NewRecorder()
	NewHandler(store, testAuth, nil).ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("missing photo status=%d", response.Code)
	}
}
