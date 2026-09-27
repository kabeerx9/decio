package httpapi

import (
	"context"
	"net/http"

	"github.com/clerk/clerk-sdk-go/v2"
	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"
	"github.com/clerk/clerk-sdk-go/v2/user"
)

// ClerkImageURL reads the authenticated user's current image from Clerk.
// The client never supplies a public image URL to the Decio API.
func ClerkImageURL(ctx context.Context, userID string) (string, error) {
	account, err := user.Get(ctx, userID)
	if err != nil {
		return "", err
	}
	if !account.HasImage || account.ImageURL == nil {
		return "", nil
	}
	return *account.ImageURL, nil
}

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
