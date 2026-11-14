# MoonProof API/Rust release: dependencies locked by engine/Cargo.lock.
# Builder image tags should be digested and SBOM-attested before externally managed production.
FROM rust:1.83-alpine AS rustbuilder
RUN apk add --no-cache musl-dev
WORKDIR /build/engine
COPY engine/Cargo.toml engine/Cargo.lock ./
COPY engine/src ./src
RUN cargo build --locked --release

FROM golang:1.26-alpine AS gobuilder
WORKDIR /build/api
COPY api/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/api .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates curl && addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=rustbuilder /build/engine/target/release/braspace-lunar-engine /app/bin/lunar-engine
COPY --from=gobuilder /out/api /app/bin/api
USER app
ENV LISTEN_ADDR=:8080 RUST_ENGINE_BIN=/app/bin/lunar-engine ASSET_CACHE_DIR=/var/cache/braspace
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 CMD curl -fsS http://127.0.0.1:8080/readyz || exit 1
CMD ["/app/bin/api"]
