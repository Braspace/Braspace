package main

import (
	"log"
	"net/http"
	"os"
	"strings"
)

// allowedOrigins parses CORS_ALLOWED_ORIGINS (comma separated, exact match).
// Empty means no cross-origin access; "*" is rejected on purpose.
func allowedOrigins(raw string) map[string]bool {
	out := map[string]bool{}
	for _, o := range strings.Split(raw, ",") {
		o = strings.TrimRight(strings.TrimSpace(o), "/")
		switch {
		case o == "":
		case o == "*":
			log.Printf("CORS_ALLOWED_ORIGINS: wildcard ignored; list explicit origins")
		case strings.HasPrefix(o, "http://") || strings.HasPrefix(o, "https://"):
			out[o] = true
		default:
			log.Printf("CORS_ALLOWED_ORIGINS: ignoring invalid origin %q", o)
		}
	}
	return out
}

func withCORS(origins map[string]bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Add("Vary", "Origin")
		allowed := origins[origin]
		if allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
			if !allowed {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "origin not allowed", "code": "CORS_FORBIDDEN"})
				return
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}

func withRecover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				if v == http.ErrAbortHandler {
					panic(v)
				}
				log.Printf("panic serving %s %s: %v", r.Method, r.URL.Path, v)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error", "code": "INTERNAL"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func withMiddleware(h http.Handler) http.Handler {
	return withRecover(withSecurityHeaders(withCORS(allowedOrigins(os.Getenv("CORS_ALLOWED_ORIGINS")), h)))
}
