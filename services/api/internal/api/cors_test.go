package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAllowOrigins(t *testing.T) {
	handler := AllowOrigins([]string{"http://localhost:8081"})(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	preflight := httptest.NewRequest(http.MethodOptions, "/v1/me", nil)
	preflight.Header.Set("Origin", "http://localhost:8081")
	preflight.Header.Set("Access-Control-Request-Method", "GET")
	preflight.Header.Set("Access-Control-Request-Headers", "authorization")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, preflight)
	if response.Code != http.StatusNoContent || response.Header().Get("Access-Control-Allow-Origin") != "http://localhost:8081" || response.Header().Get("Access-Control-Allow-Headers") == "" {
		t.Fatalf("allowed preflight: %d, headers %v", response.Code, response.Header())
	}
	postPreflight := httptest.NewRequest(http.MethodOptions, "/v1/posts", nil)
	postPreflight.Header.Set("Origin", "http://localhost:8081")
	postPreflight.Header.Set("Access-Control-Request-Method", "POST")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, postPreflight)
	if response.Code != http.StatusNoContent || response.Header().Get("Access-Control-Allow-Methods") != "GET, PUT, POST" {
		t.Fatalf("post preflight: %d, headers %v", response.Code, response.Header())
	}

	for _, origin := range []string{"https://evil.example", ""} {
		request := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
		request.Header.Set("Origin", origin)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatalf("origin %q was allowed", origin)
		}
	}
}
