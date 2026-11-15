# BRASPACE P0 — Fullstack, PostgreSQL, pgvector e ciência

Checkpoint de 15/11/2026, horário de Brasília. Escopo: revisão e correções isoladas, não homologação científica ou autorização de voo.

## Identidade e evidência

- Main auditada: `b8997309f602b664962a7810b904faf03eae9c5c`; integração preparada sobre `cf45738ca9a64f08c9bceff86d2b9ba06f3fe9a0` (mudanças TSX/Preact preservadas).
- Árvore da main inicial: 667 arquivos. As cinco séries grandes da API foram reconstruídas pelo exportador oficial a partir dos binários exatos do repositório; todos os cinco Git blob SHA e SHA-256 do catálogo coincidiram.
- CI da main auditada: [execução 43707363264](https://github.com/Braspace/Braspace/actions/runs/43707363264), falhou antes de qualquer step observável (ci failure, release skipped). Não equivale a falha de teste nem a CI aprovado.
- #279: integração auditada PostgreSQL/pgvector e contracts, aberta com conflito; #287: frontend P0, aberta com conflito; #289: tokens/matriz de telas, draft. Reconciliar sem remover trabalho humano. O arquivo `web/moonproof/core/data.ts` é fonte de verdade após #286; não editar apenas o JS gerado.

## Correções e regressões

| ID | Defeito | Correção |
|---|---|---|
| API-01 | JSON do motor com `null` em escalar obrigatório era aceito e ecoado com HTTP 200 | rejeição na validação comum, quatro regressões HTTP 502 |
| NAV-01 | grade vazia, NaN, epoch truncado para passo fracionário, payload ambíguo | limites finitos, pelo menos uma amostra, nanossegundos, chave exata e EOF estrito; OpenAPI |
| VEC-01 | bridge rotulava projeção lexical como modelo diferente; resposta conflitante aceita | guardas de modelo e dimensão |
| FE-01 | preview não servia `/vector-embed.js` | allowlist estrita e MIME JS, preservando Preact |
| SCI-01 | fração do disco solar invertida em visibilidade parcial | fórmula corrigida, regressão de monotonicidade/simetria/limites |
| SCI-02 | hashes PGDA derivados eram sobrescritos pelos hashes de origem | separar `source_sha256` e `sha256`, verificar bytes e documentação |
| ASSET-01 | cache GLB aceitava bytes alterados do mesmo tamanho/symlink | verificar digest e tipo regular antes de servir |
| VEC-02 | conexão pgvector recusada no boot deixava a API indisponível até restart | pool lazy com limite e readiness fail-closed |

## Evidências observadas

- Chrome público: Explorar exibiu 5 locais, resultados estáticos PRE/EST, energia N/D; Evidências buscou `LOLA` e retornou 4 links com SHA, índice `braspace-lexical-384-v1`. O índice está ativo nesta observação; não comprova MiniLM ou identidade de todos os hashes.
- Cockpit: `API OK · ENGINE READY`, série SYNTHETIC, 362 h luz, 224 h maior escuridão, 369 h visibilidade da Terra em janela 720 h; avaliação com série retornou decisão, mas limitou pedido a 480 h (aviso WINDOW_TOO_LONG). Não generalizar cobertura parcial a 720 h.
- Rust: 24/24; frontend inicial pós-fix 391/391 + 70/71 complementares (1 integração depende de ONBOARD_API_URL); lint e 13 arquivos TS gerados coincidiram no SHA inicial. Ciência 34/34 após correções. HTTP E2E local 22/22 operações OpenAPI, 70 assertions diretas/proxy com Go/Rust reais; fixture sintética no E2E, nunca validação NASA.
- PostgreSQL 17.12 e extensão vector 0.8.0 inicializaram em cluster descartável. A primeira tentativa de suíte teve 14 falhas de conexão por isolamento do processo; repetir PostgreSQL e testes no mesmo processo de execução. Não confundir tentativa infra com regressão do produto.

## Integridade científica e dados

Cinco séries com 35.064 amostras cada: 175.320 amostras horárias, ângulos finitos em faixa, cinco horizontes de 360 azimutes distintos. 14 locais reais no catálogo: nove ainda sem série; 2 cenários sintéticos. As séries da API têm hashes iguais aos bytes gerados; não houve novo download de fontes brutas NASA/NAIF.

**As médias de fração do disco solar e comparações PGDA antigas permanecem desatualizadas** até regeneração de `science/results/summary.json`, `validation_pgda.json`, `horizon_reach.json`, `web/data/sites/*.json` e `sites.json` com fontes e metodologia fixadas. Estimativa auditora sobre séries quantizadas (não valores de produção): Connecting Ridge 51,9187→52,9952%; Malapert 38,5187→38,4862%; Mons Mouton 45,5684→45,2884%; Nobile 31,2177→31,1882%; Peak 80,9115→80,4249%. Não promover status PRELIMINARY.

## Backlog P0/P1 verificável

1. Reconciliar #279 sobre a main corrente e #287; manter TS como fonte canônica, testar HEAD final com Docker, Node 20/22, Go race, Rust, Postgres e Chromium. Não fazer merge automático.
2. pgvector: corrigir legado sem manifesto em #279, exigir modelo/registro e SHA/URL exatos; testar isolamento por modelo, sementes idempotentes e índice vazio. A busca lexical atual usa 384D, não embedding treinado MiniLM; não misturar.
3. Reexecutar migrações concorrentes (advisory lock em #279), ingest transacional e readback do catálogo completo em banco descartável. Verificar contagem e integridade na VPS sem escrever produção.
4. Revisar cache de horizonte/decodificação nula de amostras, intervalos de outage explícitos e consistentes entre Go/JS.
5. Corrigir race do dashboard legado: selecionar A e B, B retorna primeiro e A depois; não aplicar A sob identificação de B. Guardar geração/identidade da resposta. Definir se dashboard é local-only ou integrar com API base, CSP e allowlist.
6. Regenerar métricas de disco solar em ambiente de ciência com dados pinados, comparar sem misturar área média do disco e fração de tempo visível. Tratar nodata PGDA (255) antes de interpolar; preservar distinção entre sombra 0 e dado ausente. Nenhum novo valor científico certificado.
7. Guardar evidências brutas das 120 comparações Horizons e manifestos de origem, não apenas resumos; revisar status UI sem confundir dado real derivado com certificação.
8. Testar toda a matriz de telas nos quatro viewports e todos estados de API/erro; aqui só quatro capturas públicas abrangendo Explorar, Evidências e Cockpit/energia. Desktop Commander offline, sem acesso ao EXO-X1/VPS.
9. Confirmar artefato/digest da release, CI final e publicação acessível sem login. Entrega NASA só com revisão humana e recibo real, sem alterar privacidade do repositório.

## Comandos reprodutíveis

`go test -race -count=1 -v ./...` em `api/`, com `TEST_DATABASE_URL`, `TEST_VECTOR_DATABASE_URL`, `RUST_ENGINE_BIN` de fixture descartável; `go vet ./...`; `cargo test --locked --all-targets`; `npm --prefix web run lint && npm --prefix web test && npm --prefix web run check:ts`; `python3 -m unittest discover -s science/tests -v`; `BRASPACE_E2E_API_BIN=... BRASPACE_E2E_RUST_BIN=... node scripts/fullstack-e2e.mjs`.

Gate: não declarar produção 100%, ciência validada, PR mergeado ou CI verde sem evidência correspondente ao SHA final.
