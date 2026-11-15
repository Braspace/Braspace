# Verificação local do backend Braspace

Use um PostgreSQL descartável com dois bancos separados. O primeiro recebe o catálogo da missão e o segundo recebe o esquema opcional de metadados. A suíte vetorial cria dados e constraints de teste.

```sh
# Na raiz do checkout, com TEST_DATABASE_URL e TEST_VECTOR_DATABASE_URL
# apontando para os bancos descartáveis.
(cd engine && cargo test --all-targets && cargo build)
export RUST_ENGINE_BIN="$PWD/engine/target/debug/braspace-lunar-engine"
(cd api && go vet ./... && go test -count=1 ./...)
(cd api && go test -race -count=1 -run '^TestVector' .)
npm --prefix web run lint
npm --prefix web test
npm --prefix web run check:ts
python3 scripts/validate_derived_series.py
python3 scripts/validate_polar_source_evidence.py
```

O comando `vector-ingest` da linha atual usa a projeção lexical `braspace-lexical-384-v1`. A ingestão aplica o esquema opcional e grava o lote na mesma transação. Repetir o comando com os mesmos dados conserva `updated_at`. O campo `upserted` indica quantas entradas o comando processou, inclusive entradas idênticas.

O teste de integração cobre rollback provocado por uma linha rejeitada, repetição idempotente, ordenação por cosseno e recusa de modelo diferente. O contrato de busca usa 384 números e limite de 1 a 10. O limite padrão de 5 só se aplica quando o campo é omitido. Empates são resolvidos pelo identificador da fonte, em ordenação binária.

Valide também a busca nas duas telas de Evidências com `BRASPACE_VECTOR_ENABLED=1`, `BRASPACE_VECTOR_MODEL_ID=braspace-lexical-384-v1` e o índice carregado. A busca deve retornar nome e referência da fonte e manter `scientifically_validated: false`. Os resultados são metadados. As amostras de missão continuam no PostgreSQL convencional ou no catálogo embarcado.

Para rodar a matriz HTTP também com PostgreSQL, use o banco descartável do
catálogo. O teste compara a resposta direta da API com a resposta do proxy web
em cada operação documentada. Use um banco já carregado com os dados do checkout:

```sh
mkdir -p tmp
(cd api && go build -o ../tmp/braspace-e2e-api .)
(cd api && DATABASE_URL="$TEST_DATABASE_URL" ../tmp/braspace-e2e-api ingest)
BRASPACE_E2E_API_BIN="$PWD/tmp/braspace-e2e-api" \
BRASPACE_E2E_DATABASE_URL="$TEST_DATABASE_URL" node scripts/fullstack-e2e.mjs
```

Sem `BRASPACE_E2E_DATABASE_URL`, a matriz usa o catálogo embarcado. Nos dois
modos a busca vetorial fica desligada por padrão e tem sua própria suíte.
