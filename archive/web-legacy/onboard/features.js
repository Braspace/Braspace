"use strict";
// Feature register for the cockpit. Mirrors docs/CHECKLIST_COMPUTADOR_BORDO.md (75 rows).
// status:
//   SIM   - implemented in this cockpit, using SYNTHETIC data only
//   PARC  - partly implemented (see note)
//   PEND  - not implemented yet, no external blocker
//   BLOQ  - blocked by data, decision or CI outside this UI
//   ESQ   - defined in the schema only
// panel: where it lives in the cockpit (null when not shown in the UI).
(function (root) {
    "use strict";
    const F = [
        ["1.1", "Escolha de lugar (predefinidos)", "SIM", "R-01", "#5, #26", "entrada", "Três lugares sintéticos"],
        ["1.2", "Coordenadas lunares personalizadas", "PARC", "R-01", "#19, #26", "entrada", "Valida faixa; o cálculo usa só o lugar escolhido"],
        ["1.3", "Data e hora de pouso em UTC", "SIM", "R-03", "#19, #21", "entrada", "Limite de efeméride não validado"],
        ["1.4", "Duração da missão", "SIM", "R-03", "#26", "entrada", "Até 30 dias"],
        ["1.5", "Público técnico e educativo", "SIM", "R-17", "#26, #47", "entrada", "Textos explicativos no modo educativo"],
        ["1.6", "Lugar com fonte NASA (ID de fonte)", "ESQ", "R-01, R-19", "#1, #2", null, "Nenhum lugar real carregado"],
        ["2.1", "Azimute e elevação do Sol", "SIM", "R-05", "#15, #25", "geometria", "Modelo sintético, não efeméride"],
        ["2.2", "Azimute e elevação da Terra", "SIM", "R-06", "#15, #16", "geometria", "Modelo sintético, não efeméride"],
        ["2.3", "Efemérides reais (SPICE ou Horizons)", "BLOQ", "R-05, R-06, R-12", "#4, #15", null, "Depende de leitura SPICE e validação"],
        ["2.4", "Libração e orientação lunar", "BLOQ", "R-12", "#4, #18", null, "Kernel identificado, não carregado"],
        ["2.5", "Validação contra Horizons (um lugar, três datas)", "BLOQ", "R-05, R-06, R-19", "#15, #34", null, "Precisa de efeméride real"],
        ["2.6", "Sem refração atmosférica", "SIM", "R-11", "#13, #15", "geometria", "Regra de texto"],
        ["3.1", "Horizonte do terreno por azimute", "PARC", "R-05, R-10", "#14, #16", "horizonte", "Função senoidal com rugosidade do lugar, não relevo"],
        ["3.2", "Leitura do DEM LOLA (GeoTIFF)", "BLOQ", "R-10", "#2, #14, #20", null, "Projeção a confirmar com gdalinfo"],
        ["3.3", "Cálculo de horizonte por raio no DEM", "PEND", "R-05, R-08", "#14, #16", null, "Método em PESQUISA_ALGORITMO.md"],
        ["3.4", "Distância máxima de busca documentada", "PEND", "R-10", "#14", null, "Depende de 3.3"],
        ["3.5", "Tratamento de pixels interpolados", "PEND", "R-10", "#17", null, "Depende de 3.2"],
        ["3.6", "Declive, paredes de cratera e crateras", "PEND", "R-10", "#14", null, "Depende de 3.2"],
        ["3.7", "Resolução do DEM registrada", "ESQ", "R-10, R-19", "#17", null, "Campo dem_resolution_m"],
        ["4.1", "Horas com luz", "SIM", "R-08", "#21, #25", "janelas", "Amostragem configurável"],
        ["4.2", "Maior escuridão contínua", "SIM", "R-08", "#21, #25", "janelas", ""],
        ["4.3", "Horas com a Terra visível", "SIM", "R-06, R-09", "#16, #21", "janelas", "Não garante enlace"],
        ["4.4", "Maior bloqueio da Terra", "SIM", "R-09", "#16, #21", "janelas", ""],
        ["4.5", "Próxima transição de luz e de visibilidade", "SIM", "R-07", "#16, #21", "janelas", "Por amostra"],
        ["4.6", "Transição com instante exato (bissecção)", "PEND", "R-07", "#16", null, "Tolerância a declarar"],
        ["4.7", "Lista de janelas de visibilidade", "SIM", "R-09", "#16, #21", "janelas", "Janelas de Terra visível"],
        ["5.1", "Luz disponível separada de potência elétrica", "SIM", "R-08, D-04", "#40", "energia", "Painéis mostram as duas separadas"],
        ["5.2", "Bateria (carga e descarga)", "SIM", "—", "#40", "energia", "Coeficientes sem fonte"],
        ["5.3", "Modelo de painel (área, eficiência, perdas)", "ESQ", "—", "#40", null, "Sem parâmetros de hardware"],
        ["5.4", "Combustível: massa, consumo, reserva e margem", "SIM", "D-02", "—", "vida", "Ilustrativo; escopo não decidido (#7)"],
        ["6.1", "Alimentação (estoque e racionamento)", "SIM", "—", "#7", "vida", "Ilustrativo; escopo não decidido"],
        ["6.2", "Pressurização da cabine (faixa aceita)", "SIM", "—", "#7", "vida", "Ilustrativo; pressão fixa"],
        ["6.3", "Pressão parcial e estoque de O2", "SIM", "—", "#7", "vida", "Ilustrativo; valores fixos"],
        ["6.4", "Decisão de escopo pelo time", "BLOQ", "—", "#7", null, "Decisão humana"],
        ["7.1", "Atrasos de 0, +24, +48 e +72 h", "SIM", "D-02, R-16", "#46", "replan", "Por lugar"],
        ["7.2", "Restrições violadas nomeadas", "SIM", "R-16", "#46, #48", "replan", "Escuridão, bloqueio, combustível"],
        ["7.3", "Resultado (viável, margem reduzida, inviável)", "SIM", "R-16", "#46, #48", "replan", "Limiares ilustrativos"],
        ["7.4", "Busca de data alternativa no mesmo lugar", "PARC", "R-15", "#46", "replan", "Grade de 24 h, sem otimização"],
        ["7.5", "Busca de lugar alternativo com fonte", "PARC", "R-15", "#5, #52", "replan", "Compara os três lugares sintéticos; sem fonte"],
        ["7.6", "Explicação quando não há alternativa validada", "SIM", "R-15", "#52", "replan", "Mostra quando nenhuma opção é viável"],
        ["8.1", "Gráfico de horizonte com Sol e Terra", "SIM", "R-05, R-06", "#25", "geometria", "Sintético"],
        ["8.2", "Linha do tempo de luz e de visibilidade", "SIM", "R-14", "#25, #26", "geometria", ""],
        ["8.3", "Controle deslizante e reprodução", "SIM", "R-14", "#25, #47", "geometria", ""],
        ["8.4", "Mapa polar do lugar", "SIM", "R-13", "#25, #47", "visual", "Projeção ampliada, sem escala real"],
        ["8.5", "Mapa 2D com dado LOLA", "BLOQ", "R-13", "#25, #47", null, "Depende de 3.2"],
        ["8.6", "3D do terreno", "BLOQ", "R-13", "#47, #54", null, "Só com dado real"],
        ["8.7", "Comparação lado a lado", "SIM", "R-02", "#26", "replan", "Três lugares, mesma data"],
        ["8.8", "Animação de transições", "PARC", "R-14", "#25", "geometria", "Reprodução do tempo, sem destaque de transição"],
        ["9.1", "Sensibilidade a altura do observador", "SIM", "D-03", "#49", "sens", "Parâmetro sintético"],
        ["9.2", "Sensibilidade a resolução do DEM", "SIM", "D-03", "#49", "sens", "Multiplicador sintético"],
        ["9.3", "Sensibilidade a passo de tempo", "SIM", "D-03", "#49", "sens", ""],
        ["9.4", "Método documentado de sensibilidade com DEM real", "PEND", "D-03", "#49", null, "Depende de 3.2"],
        ["9.5", "Compromissos ciência × engenharia", "PARC", "R-18, D-04", "#48", "ciencia", "Texto e tabela, sem ranking universal"],
        ["9.6", "Pareto reproduzível", "PEND", "D-04", "#48", null, ""],
        ["10.1", "Salvar cenário no histórico", "SIM", "D-05", "#48", "historico", "Só nesta sessão"],
        ["10.2", "Exportar JSON (copiar)", "SIM", "D-05", "#48, #50", "historico", "Copiar; download não disponível"],
        ["10.3", "Recibo com versão, parâmetros e fontes", "PEND", "D-05", "#50", null, ""],
        ["10.4", "Fontes oficiais com links", "SIM", "R-19", "#34, #52", "status", "Estado candidata"],
        ["10.5", "Limitações visíveis", "SIM", "R-19", "#34, #31", "status", ""],
        ["10.6", "Estado dos requisitos", "SIM", "R-19", "#50", "status", "Todos pendentes ou bloqueados"],
        ["10.7", "Proveniência por resultado", "ESQ", "R-19", "#50", null, "Campo provenance"],
        ["11.1", "Bloco launch_context", "BLOQ", "—", "#7", null, "Decisão de escopo"],
        ["11.2", "Consulta à Launch Library 2 pelo backend, com cache", "PEND", "—", "#7", null, "Limite de 15 por hora sem chave"],
        ["11.3", "Registro de falhas recentes com fonte primária", "PEND", "—", "#59", null, "Ver VARREDURA_APIS_LANCAMENTOS.md"],
        ["11.4", "Lançamentos fora do cálculo de viabilidade", "PEND", "—", "#59", null, ""],
        ["12.1", "Regras de QA (timestamp, fonte, unidades, aviso)", "ESQ", "D-09", "#31", null, "Documento QA_REGRESSION_RULES.md"],
        ["12.2", "Testes automatizados de UI", "PARC", "R-19", "#31, #33", "status", "Testes do modelo e da validação; sem teste de tela"],
        ["12.3", "CI com Go, Rust e Docker", "BLOQ", "—", "#33", null, "PR #45 revisado; testes locais não rodados"],
        ["12.4", "Smoke test do compose", "BLOQ", "—", "#33", null, "Depende de 12.3"],
        ["12.5", "Links públicos em aba anônima", "BLOQ", "D-08, D-09", "#10, #32", null, "Projeto público não existe"],
        ["12.6", "Idioma inglês para submissão", "PEND", "D-09", "#27, #47", null, "Interface só em português"],
        ["12.7", "Acessibilidade (contraste, foco, redução de movimento)", "PARC", "—", "#28", "status", "Foco visível e redução de movimento; não auditado"],
        ["12.8", "Declaração de uso de IA", "PEND", "D-09", "#34", "status", "Texto a escrever"],
        ["12.9", "Motor de cálculo real (Rust ou Go)", "BLOQ", "R-05 a R-12", "#13 a #21", null, "Interface calcula com modelo sintético"],
        ["12.10", "API que expõe o cálculo", "PARC", "R-01 a R-03", "#19 a #24", null, "Só o módulo onboard da API; geometria ainda no navegador"]
    ];
    const FEATURES = F.map(r => ({ id: r[0], title: r[1], status: r[2], req: r[3], issue: r[4], panel: r[5], note: r[6] }));
    const LABEL = { SIM: "OK · SINTÉTICO", PARC: "PARCIAL", PEND: "PENDENTE", BLOQ: "BLOQUEADO", ESQ: "ESQUEMA" };
    const api = { FEATURES, LABEL };
    if (typeof module !== "undefined" && module.exports)
        module.exports = api;
    root.OnboardFeatures = api;
})((typeof window !== "undefined" ? window : globalThis));
