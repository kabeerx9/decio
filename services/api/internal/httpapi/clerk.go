package httpapi

import (
	"net/http"

	"github.com/clerk/clerk-sdk-go/v2"
	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"
)

func ClerkAuth() Middleware {
	return func(next http.Handler) http.Handler {
		verified := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := clerk.SessionClaimsFromContext(r.Context())
			if !ok || claims.Subject == "" {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r.WithContext(WithUserID(r.Context(), claims.Subject)))
		})
		return clerkhttp.WithHeaderAuthorization()(verified)
	}
}
