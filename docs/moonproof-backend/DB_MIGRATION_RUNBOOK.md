# Runbook de migração e recuperação do PostgreSQL (evidência de QA)

Banco descartável e local: container `braspace-qa-pg` (Postgres 16 + pgvector), `127.0.0.1:55432`, usuário `braspace`, banco `braspace`. A senha fica em arquivo local fora do repositório e é lida em variável de shell. Ela nunca aparece neste documento nem em logs.

## O que foi executado
1. Estado inicial (já preparado pelo orquestrador: `migrate`, `ingest`, `verify`, `vector-ingest`): `schema_migrations`=3, `sites`=16, `ephemeris_samples`=178248, `source_semantic_index`=10.
2. `api migrate` executado 2 vezes seguidas (binário `s23-api migrate`, com `DATABASE_URL` no ambiente). Ambas saíram com rc=0 e imprimiram `null` (nenhuma migração nova aplicada). As contagens ficaram idênticas e os timestamps de `schema_migrations` não mudaram (001_init, 002_preliminary_status, 003_no_validated_status). Resultado: idempotente.
3. `api verify`: `ok: true`, `problems: []` (catálogo de 16 sites, 7 séries conferidas por hash).
4. Store confirmado como Postgres: `GET /api/health` devolve `"data_source":"postgres"`.
5. Teste de recuperação: `docker stop braspace-qa-pg`, sondagem de `/readyz`, `/api/health`, `/api/sites/{id}` e `/api/vector/status`, `docker start braspace-qa-pg`, nova sondagem, sem reiniciar a API.

## Resultado do teste de queda
| Momento | /readyz | /api/health | /api/sites/{id} | /api/vector/status |
|---|---|---|---|---|
| Banco no ar | 200 | 200 postgres | 200 | available=true |
| Banco parado | 200 | 200 postgres | 200 | available=false |
| Banco de volta (t+1s) | 200 | 200 postgres | 200 | available=true |

- O processo da API não caiu e não houve panic. O vetor foi o único componente que reportou a indisponibilidade, de forma explícita (`available:false`; a busca devolve 503 `VECTOR_UNAVAILABLE`).
- Recuperou sozinho, sem reinício da API.
- Ressalva: `/readyz` e `/api/health` NÃO refletem o estado do banco. O catálogo é carregado do Postgres uma vez, no boot, em um snapshot em memória (`loadStoreFromDB`). Durante a queda tudo continuou respondendo 200 a partir da memória. Isso é decisão de arquitetura, não bug pequeno. Está documentado como limitação em `BACKEND_EVIDENCE.md`.
- O container foi deixado rodando no final.

## Schema real (vetor e auditoria)
- `source_semantic_index(source_ref, title, source_url, sha256, model_id, embedding vector(384), updated_at)`, com CHECKs de https, hex64 e modelo.
- A coluna `ingest_manifest_sha256` NÃO existe neste schema. O mais próximo é `source_manifest.manifest_sha256` (NOT NULL), e essa tabela está vazia (0 linhas) porque `ingest` rodou sem `-manifest`. Não há como uma linha ter `ingest_manifest_sha256` nulo. As 10 linhas do índice vetorial têm `sha256` NOT NULL e `source_url` https, e a API ainda revalida isso a cada hit (`untrusted vector source metadata` -> 503).

## Observação de ambiente
O comando de subida indicado não inclui `BRASPACE_VECTOR_ENABLED=1` nem `BRASPACE_VECTOR_MODEL_ID`. Sem eles `/api/vector/status` devolve `enabled:false` e a busca devolve 503. Para os testes de vetor, a API foi reiniciada com `BRASPACE_VECTOR_ENABLED=1 BRASPACE_VECTOR_MODEL_ID=braspace-lexical-384-v1`.
