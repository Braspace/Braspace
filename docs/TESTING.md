# Testing Guide

All test suites below were executed against `main` (`0e646c3c50ad665c34013415809e951e489a3b0f`) on **2026-11-14**.

## Summary

| Suite | Command | Count / Status |
|---|---|---|
| **Web (Node test runner)** | `npm --prefix web test` | 74 tests: 74 passed, 0 failed |
| **Onboard Cockpit** | `node --test web/onboard/test/*.mjs` | 50 tests: 49 passed, 0 failed, 1 skipped |
| **Go API** | `cd api && go test ./...` | `api` and `api/onboard` pass |
| **Rust Engine** | `cd engine && cargo test` | 3 unit + 6 integration (`cli_regression.rs`) = 9 passed |
| **Python Science** | `python3 -m unittest discover -s science/tests` | 21 tests OK |
| **Python Root** | `python3 -m unittest discover -s tests` | 9 tests OK |

## Running Each Suite

### 1. Web (`web/`)
```bash
npm --prefix web test
```

### 2. Onboard Cockpit (`web/onboard/`)
```bash
node --test web/onboard/test/*.mjs
```

### 3. Go API (`api/`)
```bash
cd api && go test ./...
```

### 4. Rust Visibility Engine (`engine/`)
```bash
cd engine && cargo test
```

### 5. Python Science Pipeline (`science/tests/`)
```bash
python3 -m unittest discover -s science/tests
```

### 6. Python Root Tests (`tests/`)
```bash
python3 -m unittest discover -s tests
```

### 7. Public Smoke Test
```bash
bash scripts/smoke-publico.sh
```
