# syntax=docker/dockerfile:1
# Bootstrap build. Dependencies are not yet pinned to immutable digests (Node is pinned to a patched 22.x: CVE-2026-111497, Brotli).
#
# One Dockerfile = build + every test + release (BR89).
#   docker build --target test .      runs ALL tests (Go, Rust, web, science); fails if any fails
#   docker build .                    builds `release`, which only exists if `test` passed
# `release` MUST stay the LAST stage: production deploys run a plain `docker build`.

# ---------------------------------------------------------------- build ----
FROM rust:1.83-alpine AS rustbuilder
RUN apk add --no-cache musl-dev
WORKDIR /build/engine
COPY engine/Cargo.toml ./
COPY engine/src ./src
RUN cargo build --release

FROM golang:1.26-alpine AS gobuilder
WORKDIR /build/api
COPY api/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/api .

# ----------------------------------------------------------------- tests ---
# test-go: vet + race tests (same flags as the old CI). Real Rust binary is wired in
# so TestRealEngineAgreesWithContract runs instead of skipping.
# Postgres-backed tests (TEST_DATABASE_URL) need a live DB: scripts/ci-local.sh runs them.
FROM golang:1.26-alpine AS test-go
RUN apk add --no-cache build-base
WORKDIR /src
COPY api/ ./api/
COPY data/ ./data/
COPY examples/ ./examples/
COPY compose.yaml ./compose.yaml
COPY --from=rustbuilder /build/engine/target/release/braspace-lunar-engine /src/engine/target/debug/braspace-lunar-engine
WORKDIR /src/api
ENV RUST_ENGINE_BIN=/src/engine/target/debug/braspace-lunar-engine
RUN go vet ./... && go test -race -count=1 ./...
RUN mkdir -p /markers && echo ok > /markers/go

# test-rust: unit + real-process integration tests of the engine, lockfile enforced.
FROM rust:1.83-alpine AS test-rust
RUN apk add --no-cache musl-dev
WORKDIR /src/engine
COPY engine/ ./
RUN cargo test --locked --all-targets
RUN mkdir -p /markers && echo ok > /markers/rust

# test-web: lint, server tests, onboard cockpit tests, and the real
# web -> Go -> Rust end-to-end replay (scripts/fullstack-e2e.mjs).
FROM node:22.23.5-alpine AS test-web
RUN apk add --no-cache curl
WORKDIR /src
COPY web/ ./web/
COPY scripts/ ./scripts/
COPY examples/ ./examples/
COPY data/ ./data/
# web/moonproof/tests/evidence-model.test.mjs checks the registry against this matrix.
COPY docs/ASSET_LICENSE_MATRIX.md ./docs/ASSET_LICENSE_MATRIX.md
# audit-p0.test.mjs checks the acceptance status table; plan-calc.test.mjs validates request bodies against the OpenAPI contract.
COPY docs/SCIENTIFIC_ACCEPTANCE.md ./docs/SCIENTIFIC_ACCEPTANCE.md
COPY api/openapi.json ./api/openapi.json
COPY --from=gobuilder /out/api /opt/e2e/braspace-e2e-api
COPY --from=rustbuilder /build/engine/target/release/braspace-lunar-engine /src/engine/target/debug/braspace-lunar-engine
# No package-lock.json in web/ (no dependencies): npm ci is not applicable.
RUN mkdir -p /src/api
ENV BRASPACE_E2E_API_BIN=/opt/e2e/braspace-e2e-api
RUN npm --prefix web run lint \
 && npm --prefix web test \
 && node --test web/onboard/test/*.mjs \
 && node scripts/fullstack-e2e.mjs
RUN mkdir -p /markers && echo ok > /markers/web

# test-science: data contract + LOLA/SPICE/asset-integrity tests, offline.
FROM python:3.12-alpine AS test-science
WORKDIR /src
COPY tests/ ./tests/
COPY scripts/ ./scripts/
COPY science/ ./science/
COPY data/ ./data/
COPY web/ ./web/
COPY api/db/ ./api/db/
COPY compose.yaml ./
# science/tests/test_terrain_backgrounds.py checks the products against this matrix.
COPY docs/ASSET_LICENSE_MATRIX.md ./docs/ASSET_LICENSE_MATRIX.md
RUN python3 -m compileall -q scripts tests science \
 && python3 -m unittest discover -s tests -v \
 && python3 -m unittest discover -s science/tests -v
COPY science/results/ ./science/results/
RUN python3 -c "import json; idx=json.load(open('web/data/sites.json')); v=json.load(open('science/results/validation_pgda.json')); assert idx['science_status']=='PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED', idx['science_status']; assert [1 for r in v['results'] if abs(r['diff_sun_pp'])>5], 'known PGDA discrepancy removed without reviewed evidence'" \
 && ! grep -ri "CREATE EXTENSION.*vector" api/db/migrations
RUN mkdir -p /markers && echo ok > /markers/science

# test: only exists if the four stages above all passed.
FROM alpine:3.21 AS test
COPY --from=test-go /markers/go /markers/go
COPY --from=test-rust /markers/rust /markers/rust
COPY --from=test-web /markers/web /markers/web
COPY --from=test-science /markers/science /markers/science

# --------------------------------------------------------------- release ---
# Production image: identical to the pre-BR89 image (same user, ENV, HEALTHCHECK, CMD).
# The bind mount from `test` makes the build depend on it without adding a byte to the image.
FROM alpine:3.21 AS release
RUN --mount=type=bind,from=test,source=/markers,target=/markers test -f /markers/go -a -f /markers/rust -a -f /markers/web -a -f /markers/science
RUN apk add --no-cache ca-certificates curl && addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=rustbuilder /build/engine/target/release/braspace-lunar-engine /app/bin/lunar-engine
COPY --from=gobuilder /out/api /app/bin/api
USER app
ENV LISTEN_ADDR=:8080 RUST_ENGINE_BIN=/app/bin/lunar-engine ASSET_CACHE_DIR=/var/cache/braspace
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 CMD curl -fsS http://127.0.0.1:8080/readyz || exit 1
CMD ["/app/bin/api"]
