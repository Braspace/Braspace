// The original renderer is loaded asynchronously so synchronous WebGL or CDN
// failures cannot strand the user behind a permanent loading screen.
export const LOAD_LIMIT_MS = 45000;
export function fallbackText(lang) {
  return lang === 'pt' ? '3D indisponível. Prévia estática do relevo de Joel (LOLA 80 m; luz ilustrativa).' :
    '3D unavailable. Static preview of Joel’s LOLA 80 m terrain; illustrative lighting.';
}
export function showFallback(box, lang) {
  if (!box || box.classList.contains('done')) return;
  box.classList.add('error');
  if (box.firstElementChild) box.firstElementChild.textContent = fallbackText(lang);
}
export async function startViewer({ box, lang, load, timeout = LOAD_LIMIT_MS }) {
  const watchdog = setTimeout(() => showFallback(box,lang),timeout);
  try { await load(); }
  catch { clearTimeout(watchdog); showFallback(box,lang); }
  return watchdog;
}
if (typeof document !== 'undefined') {
  const lang = new URLSearchParams(location.search).get('lang') === 'pt' ? 'pt' : 'en';
  const box = document.getElementById('loading');
  const retry = document.getElementById('moon-preview-retry');
  const link = document.getElementById('moon-preview-map');
  if (lang === 'pt') {
    box.firstElementChild.textContent = 'Carregando o Moon HD…';
    retry.textContent = 'Tentar novamente';
    link.textContent = 'Abrir mapa do Polo Sul';
  }
  retry.addEventListener('click', () => location.reload());
  const observer = new MutationObserver(() => {
    if (box.classList.contains('done') || box.classList.contains('error')) {
      observer.disconnect();
      if (box.classList.contains('error')) showFallback(box, lang);
    }
  });
  observer.observe(box, {attributes:true,attributeFilter:['class']});
  // Propagate the current mission context to the functional 2D map.
  const target = new URL(link.href);
  const query = new URLSearchParams(location.search);
  for (const key of ['site','start','t','d','lang']) if (query.has(key)) target.searchParams.set(key,query.get(key));
  link.href = target.href;
  startViewer({box,lang,load:() => import('./app.js')}).then(timer => {
    if (box.classList.contains('done') || box.classList.contains('error')) clearTimeout(timer);
  });
}
