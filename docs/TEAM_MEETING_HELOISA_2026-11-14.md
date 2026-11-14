# BRASPACE — Contribuições da Heloísa de Paula Nogueira (reunião do hackathon)

**Data de consolidação:** 14/11/2026 · **Equipe:** BRASPACE / NASA Space Apps Challenge 2026 · **Desafio:** Lunar Landing Site Navigator.  
**Origem:** resumo da reunião e notas compartilhadas pelo usuário. Este documento **não é uma transcrição auditiva da reunião**; diferencia a sugestão relatada de uma decisão aprovada, e não atribui à Heloísa ações não relatadas.

## Intervenções registradas e seu encaminhamento

| Nº | Contribuição relatada da Heloísa | Encaminhamento / evidência necessária |
|---|---|---|
| 01 | Questionou como o grupo definiu o desafio e pediu o racional das decisões; explicou ausência na reunião anterior | Documentar o desafio, escopo e decisões em #7, PR #44 e docs de requisitos, sem pressupor consenso não registrado |
| 02 | Propôs manter o repositório privado até o limite de entrega, em face da exposição de propostas concorrentes | **Proposta de privacidade**: repo privado, PRs internos; preparar URL pública do aplicativo e da apresentação *antes* do envio NASA (#10, #32, #51) |
| 03 | Realizou pesquisa/coleta ('scraping') de links de repositórios concorrentes e compartilhou fontes com o grupo | Catálogo de **15** repositórios em `COMPETITORS_2026_15_REPOS.md` (#51); coletar só informação pública permitida, respeitar termos, licenças e autoria |
| 04 | Advertiu que reproduzir apenas o escopo genérico não diferenciaria a equipe | Decisão de produto proposta: **Mission Resilience Explorer**, experiência de recuperação de missão e transparência de decisão (#7, #46, #48) |
| 05 | Explicou variação de iluminação no polo sul e implicações energéticas de baixos ângulos solares, terreno e períodos de sombra | Modelar topografia real, Sol e horizonte (#14–#16) e separar iluminação de potência elétrica (#40). Referenciar 'períodos/ciclos de iluminação' em vez de estações atmosféricas terrestres |
| 06 | Destacou perdas de janelas de comunicação direta com a Terra conforme local exato | Produzir timeline de visibilidade geométrica e blackout máximo (#16, #21, #25); nunca inferir automaticamente link RF/DSN garantido |
| 07 | Reforçou que 3D, posição Sun/Earth e horizonte real são requisitos essenciais para uma experiência de entendimento | Registro obrigatório da equipe em R-05, R-06, R-10, R-13, R-14; 3D é explicativo e não pode contradizer os cálculos ou fabricar precisão |
| 08 | Sugeriu replanejamento automático para imprevistos/atrasos, inclusive de desenvolvimento de hardware | Entrada 'atraso +24/+48/+72 horas', comparar cenário-base e novas datas, e alternativas próximas; mostrar restrições quebradas (#46) |
| 09 | Propôs oferecer plano principal com opções de datas/locais alternativas na mesma região | `Recover` deve exibir solução, custo/compromisso ou dizer 'nenhuma alternativa verificada' (#46, #52) |
| 10 | Compartilharia anotações estruturadas pelo WhatsApp | Manter este resumo reprodutível no GitHub e apontar o documento ao grupo; **não há confirmação aqui de envio via WhatsApp** |
| 11 | Defendeu que a principal decisão é o produto/funcionalidades, não a linguagem de programação | Priorizar vertical slice de dados NASA + cálculo validado + interface; Go/Rust/Docker/pgvector não devem impedir uma entrega científica mínima (#7, #8, #9) |
| 12 | Solicitou UX intuitiva para engenheiros, educadores e público | Progressiva: *Learn*, modo educativo, modo técnico com unidades e proveniência, acessibilidade (#26, #28, #47) |
| 13 | Citou abordagens criativas e lúdicas (jogos, museus virtuais) de vencedores de edições anteriores | Tratar como inspiração narrada pela equipe, **não como fato histórico validado**. Um concorrente já documenta jogo educativo; foco no fluxo original de decisão (#27, #51) |
| 14 | Propôs hub principal enxuto com cerca de cinco áreas, evitando dezenas de botões | **Explore · Compare · Recover · Science & Engineering · Evidence & Learn**, com navegação progressiva (#47) |

## Decisões em aberto — não presumir aprovação de todo o time

- [ ] Alinhar com os seis membros se o nome de trabalho será `MoonProof — Mission Resilience Explorer` ou somente `BRASPACE Lunar Landing Site Navigator`; nome no formulário NASA só deve mudar após consenso.
- [ ] Confirmar que os 19 requisitos consolidaram todas as necessidades de ciência/engenharia; não declarar como implementados até obter PR/testes.
- [ ] Escolher uma configuração científica mínima para comprovação: um local LOLA + série temporal SPICE/JPL validada + cenário de atraso.
- [ ] Confirmar o conjunto de dados que Gabriel Maccachero realmente conseguiu adquirir e passar a Joel/Gabriel Freire; link de documentação por si só não significa dado usado.
- [ ] Confirmar projeto final e apresentação acessíveis em janela anônima, mantendo o repo privado até liberação autorizada.
- [ ] Atualizar slides em inglês para refletir só funcionalidades efetivamente executadas; não editar o formulário NASA sem conferência da equipe.

## Interface — cinco módulos propostos

**1. Explore:** local, coordenadas, data/hora e duração, mapa lunar 2D e terreno 3D explicativo, Sol/Terra vs horizonte.

**2. Compare:** dois ou mais cenários/localizações, mesma escala UTC, visibilidade e maiores períodos de sombra/comunicação; comparação ciência × engenharia.

**3. Recover:** simulação de atraso/mudança de hardware, recálculo e alternativas próximas, margens, motivo da inviabilidade e hipóteses assumidas.

**4. Science & Engineering:** requisitos científicos (acesso ao terreno e objetivos observacionais) e engenharia (energia, bateria, escuridão, comunicação e inclinação) com critérios configuráveis, sem ranking arbitrário.

**5. Evidence & Learn:** fontes NASA/JPL, versão dos dados, resolução do terreno, estado da validação, limites físicos, explicações didáticas e transparência de IA.

## Cuidados de privacidade e avaliação

**Repositório privado:** manter a implementação da BRASPACE em `Braspace/Braspace` privado pode ser uma decisão adequada da equipe. **Entretanto, o formulário NASA exige links publicamente acessíveis do projeto e da demonstração sem login, permissão ou senha.** A equipe pode publicar uma página de aplicação independente e o deck no Google Slides como leitor público, conservando o repositório privado até aprovação. Não deixar publicação dos links para depois do prazo.

**Crédito e originalidade:** pesquisa em repositórios públicos não concede licença para copiar código, design, dataset reprocessado ou imagens; consultar licença e atribuir corretamente. IA gerativa no material final deve ser declarada conforme guia NASA.

## Prioridades imediatas

1. @maccachera: fontes NASA reais e possibilidade de calcular horizonte (#1, #2, #3, #52).
2. @joeljato: geometria lunar correta, horizonte e validação (#14, #15, #49).
3. @gfreiresjrp: API tipada + replan por atraso (#21, #46).
4. @lisanogueira: projeto UX original com cinco entradas e apresentação precisa (#25, #27, #47, #51).
5. @Ninzinhu: cobertura dos requisitos, QA e links públicos (#32, #34, #50).
6. @gustavofullstack: decisões, integração, PRs, deploy e submissão (#7, #8, #10, #11, #48).

**Status:** documentação e planejamento. Nenhuma funcionalidade deve ser marcada `DONE` sem readback do código e testes.

## Contribuições adicionais — Super Lua 3D e execução (registradas em 14/11)

Estas propostas complementam os registros anteriores e foram apresentadas pela equipe como itens para organização e implementação.

15. **Gamificação + mapa lunar 3D:** apoiar um globo lunar 3D atrativo, com interações e desafios educativos originais, mas preservando interface limpa e cálculo científico real. Encaminhado à Heloísa (#60) para roteiro/UX e a Gustavo (#54) para implementação.
16. **Relatórios e dados da missão:** gerar relatório de cenário em HTML imprimível/PDF, incluindo resumo de observação, dados, fontes, alterações após recálculo, riscos classificados, causas, margens e alternativas. Encaminhado ao Gustavo (#58, código) e João Victor (#59, QA e taxonomia de riscos).
17. **Divisão por especialidade:** Gustavo assume foco prioritário em código, integrações e deploy. Gabriel Freire codifica API; Joel produz ciência/Rust; Gabriel Maccachero lidera pesquisa, URLs e imagens sem obrigação de programar; Heloísa lidera produto, benchmark e UX sem obrigação de programar; João Victor cuida de QA, documentação, evidências e links sem obrigação de programar. Atribuições reais alteradas nas issues #7, #10, #37 e #43. Ver [papéis e handoffs](TEAM_ROLES_AND_HANDOFFS_2026.md).
18. **Diversificação de fontes de dados:** Google Moon apenas inspiração de UX; LROC QuickMap e NASA Galleries como referências e descoberta; NASA SVS CGI Moon Kit como fonte de texturas autorizadas; LROC PDS/LOLA e JPL SPICE como fontes científicas a verificar antes de integração. É obrigatória a análise de licenças/atribuições por asset, sem scraping de tiles proprietários. Encaminhado a Maccachero (#55, #61) e Gabriel Freire (#57).

### Referências estruturadas

- [Super Moon 3D — arquitetura visual e científica](SUPER_MOON_3D_TECHNICAL_SPEC.md)
- [Mission Report — HTML/PDF e matriz de risco](MISSION_REPORT_AND_RISK_SPEC.md)
- [Fonte/asset: direitos Google, NASA e LROC](LUNAR_ASSETS_RIGHTS_AND_SOURCES.md)
- [Gamificação educativa e cinco áreas](GAMIFIED_LUNAR_UX_AND_HUB.md)
- [Roadmap de execução](SUPERMOON_DELIVERY_ROADMAP_2026.md)

**Nota:** estes são requisitos e decisões operacionais planejadas; globo 3D, gamificação e relatório em execução ainda não foram comprovados. A autorização do merge PR #45 se refere ao bootstrap Go/Rust com CI, não à conclusão dessas funcionalidades.
