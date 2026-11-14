# Status das issues de Ninzinhu

Atualizado em 2026-11-14, após consulta ao GitHub. Itens marcados como "concluído" têm evidência no repositório. Os demais estão abertos.

## Issues atribuídas

| Issue | Título resumido | Prazo | Situação | Evidência no repositório |
|---|---|---|---|---|
| #59 | Taxonomia de riscos, evidência de QA e gates de submissão (BS-056) | 15/11 | Aberta, nova | Nenhuma |
| #50 | Rastrear requisitos obrigatórios até evidência (BS-048) | 15/11 23:59 | Parcial | `docs/REQUISITOS_RASTREABILIDADE_NINZINHU.md` |
| #42 | Confirmar seis inscrições da equipe (BS-042) | Hoje | Aberta | Nenhuma; depende de ação humana |
| #34 | Auditar formulário NASA e transparência de IA (BS-034) | 15/11 | Parcial | `docs/NASA_FORM_CHECKLIST.md`, `docs/FONTES_OFICIAIS_NASA.md` |
| #33 | CI para Go, Rust e Docker (BS-033) | 15/11 | Bloqueada | Revisão do PR #45 pendente de execução local |
| #32 | Verificação pública em aba anônima (BS-032) | 15/11 | Bloqueada | Nenhuma |
| #31 | Regras de QA e honestidade científica (BS-031) | 15/11 | Parcial | `docs/QA_REGRESSION_RULES.md` |
| #35 | Triagem de defeitos (BS-035) | 15/11 | Parcial | Convenções em `docs/QA_REGRESSION_RULES.md` |
| #36 | Retrospectiva (BS-036) | 16/11 | Não iniciada | Depende de #11 |
| #43 | Arquivo pós-submissão (BS-043) | — | Aberta | Modelo no PR #45; nada a arquivar até a submissão |
| #10 | Links públicos do projeto e da demo (BS-010), do Gustavo, com comentário seu | — | Aberta | Deck de 7 slides com link de leitura pública existe; acesso anônimo não verificado |

## Bloqueios que dependem de outras pessoas

- **Dados NASA** (#34, #50, #59): nenhum dataset registrado. Depende de #1 a #4 e #38 (@maccachera).
- **Código para CI** (#33): PR #45 com CI para Go e Rust ainda não revisado localmente.
- **Links públicos** (#32, #10): projeto público não existe; apenas o deck.
- **Desafio**: o texto oficial da página do Space Apps 2026 não foi conferido. Ver `docs/FONTES_OFICIAIS_NASA.md`.

## Próximos passos

1. #59: definir a taxonomia de riscos e os gates de submissão, com níveis ligados a limiares explícitos.
2. #50: concluir o rastreio de todos os requisitos, incluindo os que dependem de #52 e #54.
3. #33: rodar localmente os testes de Go, Rust e o `docker compose` do PR #45.
4. #32 e #10: abrir os links em aba anônima e registrar capturas e URLs.
5. #34: confirmar o texto oficial do formulário e preencher o checklist.
