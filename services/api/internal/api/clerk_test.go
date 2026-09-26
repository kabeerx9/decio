package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/clerk/clerk-sdk-go/v2"
)

func TestClerkAuthRejectsUnverifiedRequests(t *testing.T) {
	clerk.SetKey("sk_test_dummy")
	called := false
	handler := ClerkAuth()(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))
	for _, header := range []string{"", "Bearer not-a-jwt"} {
		request := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
		request.Header.Set("Authorization", header)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusUnauthorized || called {
			t.Fatalf("header %q: status=%d, downstream called=%v", header, response.Code, called)
		}
	}
}
