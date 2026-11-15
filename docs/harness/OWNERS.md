# Quem faz o quê (15/11/2026)

Ordem do Gustavo: o Cockpit é o único painel que importa, e cada parte tem um dono. Para não sobrescrever o trabalho de outra sessão, antes de editar arquivo de outra área, fale com o dono dela.

| Área | Dono | Arquivos |
|---|---|---|
| Integração, merges na main, CI/QA/PMO/DBA no EXO-X1, deploy do backend | MAC (Opus, integrador único) | main, `/docker/braspace` na harness |
| Painéis recolhíveis, gavetas por card, escala de UI (`--k`/zoom) | MAC | `web/moonproof/core/panels.*`, `core/tokens.css` (bloco de densidade) |
| Lua 3D (backdrop, pins dos locais, ganchos `window.moonBackdrop`) | Moonproof PWA integração e UI | `web/moon-hd/backdrop.*` |
| Nave Artemis (mesma do Landing Lab) | Moonproof PWA integração e UI | `web/moon-hd/artemis.*`, `screens/cockpit.tsx`, `cockpit-texts.ts`, `web/lab/scene.ts` |
| Publicação do Worker (wrangler) | Moonproof PWA integração e UI | Cloudflare `braspace-moonproof` |
| Arquivamento das telas fora do Cockpit e QA de UX | Braspace conversão (orquestrador de front) | `core/shell.ts`, `core/archived.ts`, redirects; não mexe no CSS do moonproof |
| Go/Rust/API: grade de série e erros | Braspace conversão (orquestrador de backend) | `api/` (exceto `api/navigation`) |
| Contrato do navigation | MAC | `api/navigation`, `api/openapi.json` (navigation) |
| Postgres/pgvector: quarentena do legado, migração e testes reais | Braspace conversão (orquestrador de backend) | `api/vector*`, `api/db/` |
| Ciência (disc_fraction, regenerar artefatos e SHAs) | Braspace visual reference pack | `api/sitevis`, `science/` |

## Regras

1. Antes de mesclar, mande o SHA com ci-local GREEN no EXO-X1 para o integrador.
2. Produção:
   - Backend: com backup (`pg_dump`) e rollback (`IMAGEM`) anotados.
   - Worker: com o version id anotado.
3. Nada de segredos em PR, docs ou mensagens.
