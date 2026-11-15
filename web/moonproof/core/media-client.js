// Site-linked illustrative media only; never cache failed API responses or unsafe links.
const SITE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function validateMedia(data, siteId) {
  if (data?.site_id !== siteId || !Array.isArray(data.media)) return null;
  const cards = [];
  for (const item of data.media) {
    if (!item || typeof item.title !== "string" || !item.title.trim() || typeof item.credit !== "string" || !item.credit.trim() || item.illustrative_only !== true || typeof item.page_url !== "string" || !item.page_url.startsWith("https://") || /\s/.test(item.page_url)) return null;
    let url;
    try { url = new URL(item.page_url); } catch { return null; }
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    cards.push({ title: item.title, credit: item.credit, page_url: url.href, illustrative_only: true });
  }
  return cards;
}

export function createMediaLoader(api) {
  const cache = new Map();
  return async function loadMedia(siteId) {
    if (!SITE.test(siteId || "")) return null;
    if (!cache.has(siteId)) {
      const pending = Promise.resolve().then(() => api(`/api/sites/${encodeURIComponent(siteId)}/media`)).then(r => r?.ok ? validateMedia(r.data, siteId) : null).catch(() => null);
      cache.set(siteId, pending);
      // Keep valid responses (including honest empty arrays). Failed reads must be retryable.
      pending.then(cards => { if (cards === null && cache.get(siteId) === pending) cache.delete(siteId); });
    }
    return cache.get(siteId);
  };
}
