package main

import "net/http"

// routeStatusProbe discards the body of ServeMux's built-in fallback so its
// native 404/405 choice and Allow header survive JSON error normalization.
// It is used only when ServeMux.Handler reports no registered route match.
type routeStatusProbe struct {
	header http.Header
	status int
}

func (p *routeStatusProbe) Header() http.Header { return p.header }
func (p *routeStatusProbe) WriteHeader(status int) {
	if p.status == 0 {
		p.status = status
	}
}
func (p *routeStatusProbe) Write(b []byte) (int, error) {
	if p.status == 0 {
		p.status = http.StatusOK
	}
	return len(b), nil
}

// withJSONRoutingErrors keeps all registered routes and Go's native method
// resolution intact. Only otherwise unhandled routes are normalized to the
// documented {code,error} JSON envelope instead of net/http text/plain.
func withJSONRoutingErrors(mux *http.ServeMux) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handler, pattern := mux.Handler(r)
		if pattern != "" {
			mux.ServeHTTP(w, r)
			return
		}
		probe := &routeStatusProbe{header: make(http.Header)}
		handler.ServeHTTP(probe, r)
		switch probe.status {
		case http.StatusNotFound:
			writeJSON(w, http.StatusNotFound, map[string]string{
				"code": "API_ROUTE_NOT_FOUND", "error": "route not found",
			})
		case http.StatusMethodNotAllowed:
			if allow := probe.header.Get("Allow"); allow != "" {
				w.Header().Set("Allow", allow)
			}
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{
				"code": "METHOD_NOT_ALLOWED", "error": "method not allowed",
			})
		default:
			// Preserve net/http responses other than its plain-text 404/405,
			// including path-cleaning redirects and malformed RequestURI handling.
			handler.ServeHTTP(w, r)
		}
	})
}
