package httpapi

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
)

type Realtime interface {
	TokenRequest(ctx context.Context, userID string) (json.RawMessage, error)
	PublishConnectionChange(ctx context.Context, userID string) error
}

func registerRealtimeRoutes(mux *http.ServeMux, realtime Realtime, authenticate Middleware) {
	mux.Handle("GET /v1/realtime/token", authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		id, ok := userID(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if realtime == nil {
			http.Error(w, "realtime unavailable", http.StatusServiceUnavailable)
			return
		}
		request, err := realtime.TokenRequest(r.Context(), id)
		if err != nil {
			log.Printf("create realtime token: %v", err)
			http.Error(w, "realtime unavailable", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(request)
	})))
}
