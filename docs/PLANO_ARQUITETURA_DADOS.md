# Plano: fonte de dados, cálculo e consumo (computador de bordo)

Data: 2026-11-14. Base: `origin/main` em `7680910`, após as PRs #53, #71, #72 e #73 terem sido mescladas. Este documento é para revisão do time. Não altera código de `main`.

## 1. Estado de `main` (confirmado no Git)

| Item | Situação |
|---|---|
| Dataset LOLA | `data/manifest.json` e `data/LOLA_80S_80M_VERIFICATION.md` (PR #71, mesclada). O binário `LDEM_80S_80M.IMG` **não está no repositório**. Nenhum código lê o binário. |
| Catálogo de sítios | `api/sitedata/catalog.json`: regiões-candidatas do Artemis III (Malapert, Haworth etc.), com coordenadas de centro de feição, não de pouso. |
| Séries de sítio | `api/sitedata/series/synthetic-demo-a.json` e `-b.json`: **sintéticas**. |
| API de missão (#53) | Endpoints de comparação e replanejamento por atraso, com PostgreSQL opcional. Dependem das séries sintéticas. |
| API de simulação (#70) | `POST /api/onboard/evaluate` e `POST /api/onboard/report` (#72). Só energia e riscos, a partir de amostras de Sol e Terra recebidas. |
| Interface web (#73) | `web/` em `main`, com globo 3D e avaliação pela API. |
| Processador de horizonte LOLA (PR #75) | **Rascunho.** `science/lola_horizon.py`, em Python. Não calcula Sol nem Terra. Saída marcada como preliminar. |
| Integridade de grade (PR #76) | **Aberta, pronta para revisão.** Impede grades fora do intervalo e rejeita `VALIDATED` sem atestado. |
| Visibilidade calculada no servidor (PR #74) | **Aberta.** Pede o endpoint `site-evaluate` e consumíveis na interface. Sobrepõe o cockpit. |

**Conclusão:** `main` ainda não consome o LOLA nem calcula efemérides. Os resultados continuam sintéticos.

## 2. Fonte de dados

- **Binário LOLA:** baixar uma vez, com hash `SHA-256` conferido contra `data/manifest.json`. Guardar fora do Git (armazenamento local ou volume do Docker). O repositório guarda só o manifesto.
- **Efemérides:** SPICE, com `moon_pa_de440_200625.bpc` e `moon_de440_250416.tf` (ver `PESQUISA_ALGORITMO.md`). Horizons como referência de validação, não como fonte de série.
- **Série por sítio:** gerada por um processo offline, a partir do DEM e das efemérides. Guardada com hash, versão e data de geração. A API lê essa série, em vez de recalcular.

## 3. Cálculo

Quem calcula o quê, de acordo com `docs/architecture.md` (ADR-0001):

| Etapa | Responsável | Observação |
|---|---|---|
| Leitura do DEM e horizonte por raio | Rust (ou Python, só para pré-cálculo) | PR #75 é um começo em Python. Decidir se fica como ferramenta offline. |
| Sol e Terra (SPICE) | Rust | Hoje não há binding Go confiável para CSPICE. |
| Transições de luz e visibilidade | Rust | Bisseção entre amostras, com tolerância declarada. |
| Energia, bateria, riscos | Go (#70) | Já existe. Não recalcular no navegador. |
| Apresentação | Interface | Só mostra o que a API devolve, com a origem de cada número. |

## 4. Consumo de dados e de API

1. **Pré-cálculo por sítio**, em vez de cálculo a cada clique. A série fica pronta; a API só lê.
2. **Pedidos em lote:** a API aceita até 8 cenários por requisição (`MaxCandidates`). Agrupar.
3. **Cache por hash de entrada:** o mesmo pedido, com o mesmo hash SHA-256, não recalcula.
4. **Sem chamadas externas no navegador.** Lançamentos e efemérides passam pelo servidor.

## 5. Lançamentos recentes

- A Launch Library 2 permite 15 requisições por hora sem chave. Consultar pelo servidor, com cache, e verificar o consumo com `/2.3.0/api-throttle/`.
- **Os eventos recentes não entram no cálculo físico.** Eles servem como motivo de atraso no replanejamento (R-16), com fonte primária quando houver. A causa só entra depois de ler o relatório oficial (FAA, JAXA, empresa). Hoje só há cobertura de imprensa.

## 6. Conflitos a resolver antes de seguir

1. **Duas interfaces:** cockpit (este branch) e `web/` (#73, já em `main`). Recomendação: manter `web/` como interface oficial e portar o que for único do cockpit (painéis de sensibilidade, registro e status).
2. **Consumíveis:** #53 e #74 já tratam O2 e alimentação na API e na interface. Cancelar os painéis de vida do cockpit, para não duplicar.
3. **Geometria no navegador:** o cockpit ainda calcula Sol e Terra no navegador. Remover depois que a série do servidor existir (#74 faz isso).
4. **Processador em Python (#75) versus ADR-0001 (Rust):** decidir antes da revisão de #75.
5. **Escopo (issue #7):** decisão do time.

## 7. Próximos passos

1. Revisar #76 e #75 com @joeljato e @maccachera. Não mesclar #75 sem o binário real.
2. Baixar o `LDEM_80S_80M.IMG` e conferir o hash. Registrar o resultado no manifesto.
3. Gerar uma série de um sítio (horizonte + Sol e Terra) e comparar com Horizons em três datas.
4. Escolher uma interface oficial e remover a duplicata.
5. Implementar o cache e o agrupamento de pedidos na API.

## 8. Limites deste plano

- Não li cada arquivo das PRs abertas. Baseei-me nos corpos das PRs e nos arquivos de `main`.
- Não executei o processador de #75 nem os testes de #76.
- Não há data de entrega para o binário LOLA nem para a série de efemérides.
