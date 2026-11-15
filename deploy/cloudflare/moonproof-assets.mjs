// Static assets through the Worker. Cloudflare does not compress application/octet-stream, so the NASA-derived
// binary grids under /data/ (LOLA relief, PGDA sun/earth maps, site tiles: ~3.3 MB on the Mission screen) went out
// uncompressed. Setting Content-Encoding: gzip on a Worker response makes the workerd runtime gzip the body
// (encodeBody "automatic"); the bytes the browser decodes are unchanged.
export const COMPRESSIBLE_DATA = /^\/data\/[A-Za-z0-9_\-\/]+\.bin$/;

export function wantsGzip(request) {
  return (request.headers.get("accept-encoding") || "").split(",").some(token => {
    const [name, ...params] = token.trim().split(";").map(x => x.trim());
    if (!/^(gzip|\*)$/i.test(name)) return false;
    const q = params.find(p => /^q=/i.test(p));
    return !q || Number.parseFloat(q.slice(2)) > 0;
  });
}

/** Wrap an ASSETS response so a /data/*.bin body is gzip-encoded by the runtime; everything else is returned as is. */
export function compressDataAsset(request, response) {
  const { pathname } = new URL(request.url);
  if (!COMPRESSIBLE_DATA.test(pathname) || response.status !== 200 || !response.body
      || response.headers.has("content-encoding") || !wantsGzip(request)) return response;
  const headers = new Headers(response.headers);
  headers.set("content-encoding", "gzip");
  headers.delete("content-length");
  const vary = headers.get("vary");
  if (!/accept-encoding/i.test(vary || "")) headers.set("vary", vary ? vary + ", Accept-Encoding" : "Accept-Encoding");
  return new Response(response.body, { status: 200, statusText: response.statusText, headers });
}
