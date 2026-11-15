# Telas arquivadas do MoonProof (15/11/2026)

Ordem do Gustavo: o **Cockpit** (`cockpit.html`) é o único painel do MoonProof. As telas abaixo saíram da
navegação e redirecionam para `cockpit.html`, mantendo `?site=` e o `#`. Nada foi apagado: os arquivos,
o histórico git e os testes de conteúdo continuam valendo. Para abrir uma tela como era, acrescente
`?archived=1` (ex.: `evidence.html?archived=1`).

| Tela | Arquivo | Motivo |
|---|---|---|
| Escolha (entrada) | `index.html` | `/moonproof/` abre direto o cockpit |
| A · Mission Control | `mission.html` | visão geral absorvida pelo cockpit |
| B · Explorar | `explore.html` | a Lua 3D com os pins vive no fundo do cockpit |
| C · Comparar | `compare.html` | fora do foco único |
| D · Replanejar | `recover.html` | fora do foco único |
| F · Evidências | `evidence.html` | fora do foco único |
| Regras | `rules.html` | sub-visão de Evidências |
| G · Landing Lab (MoonProof) | `landing.html` | o Landing Lab da navegação é `../lab.html` |
| H · Debrief | `debrief.html` | fora do foco único |
| Kits de aula | `plan.html`, `activity.html`, `present.html` | fora do foco único |

Navegação que fica (`core/shell.ts`): Cockpit, **+ Bordo** (`../onboard/`) e **Landing Lab** (`../lab.html`).
O redirect é `core/archived.ts` (carregado no `<head>` de cada tela arquivada).
