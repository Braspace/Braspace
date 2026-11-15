// Deploy config for the Cloudflare Worker (braspace-moonproof). The Worker proxies /api same-origin, so the
// public API base is this origin. BRASPACE_COMMIT is intentionally absent here: a deploy step may write it
// (const BRASPACE_COMMIT = "<sha>";) so Evidence/Plan show the exact build; a committed SHA would go stale.
// Read with fetch() by moonproof/screens/evidence.tsx and plan.tsx, and by scripts/smoke-publico.sh.
const API = "https://braspace-moonproof.almeida-me.workers.dev";
