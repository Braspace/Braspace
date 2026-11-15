// Three audience entry points; routes remain shared, not separate applications.
export const MODES = [
  { path: "/explorar", label: "Aluno", action: "Explorar", description: "Descubra o polo sul, a luz do Sol e a Terra.", icon: "explorar" },
  { path: "/aula", label: "Professor", action: "Dar uma aula", description: "Apresente uma pergunta e prepare uma atividade.", icon: "aula" },
  { path: "/comparar/tecnico", label: "Engenheiro de missão", action: "Planejar", description: "Compare locais, regras e evidências para a missão.", icon: "bordo" },
] as const;

export const TOOLS = [
  { path: "/comparar", label: "Comparar locais", icon: "comparar" },
  { path: "/aula/atividade", label: "Montar atividade", icon: "aula" },
  { path: "/bordo", label: "Painel de bordo (simulação)", icon: "bordo" },
  { path: "/bordo/replanejar", label: "Replanejar missão (simulação)", icon: "bordo" },
  { path: "/terreno", label: "Laboratório de terreno e pouso", icon: "terreno" },
  { path: "/evidencias", label: "Fontes e limitações", icon: "evidencias" },
] as const;

export function activeMode(path: string): string | null {
  if (path === "/explorar" || path === "/comparar") return "/explorar";
  if (path === "/aula" || path.startsWith("/aula/")) return "/aula";
  if (path === "/comparar/tecnico" || path === "/bordo" || path.startsWith("/bordo/") || path === "/terreno") return "/comparar/tecnico";
  return null;
}

// Never discard the selected scenario on a mode shortcut.
export function scenarioQuery(query: Record<string, string | undefined>, site?: string | null) {
  return { site: site ?? query.site, t: query.t, d: query.d };
}
