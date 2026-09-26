package api

import "net/http"

// AllowOrigins permits browser requests from the exact frontend origins configured by the server.
func AllowOrigins(origins []string) Middleware {
	allowed := make(map[string]bool, len(origins))
	for _, origin := range origins {
		if origin != "" {
			allowed[origin] = true
		}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin == "" || !allowed[origin] {
				next.ServeHTTP(w, r)
				return
			}
			w.Header().Add("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Origin", origin)
			if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
				requestedMethod := r.Header.Get("Access-Control-Request-Method")
				if requestedMethod != http.MethodGet && requestedMethod != http.MethodPut {
					http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
					return
				}
				w.Header().Set("Access-Control-Allow-Methods", "GET, PUT")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
