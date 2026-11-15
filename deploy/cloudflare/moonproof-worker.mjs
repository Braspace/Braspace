// MoonProof Worker entrypoint (wrangler `main`). Default export ONLY: workerd treats every named export of the
// main module as an entrypoint and refuses to start on non-handlers ("Incorrect type for map entry 'DEFAULT_UPSTREAM'").
// The same-origin API proxy and its helpers live in moonproof-proxy.mjs.
import { handleMoonAPI } from "./moonproof-proxy.mjs";
import { compressDataAsset } from "./moonproof-assets.mjs";

export default {
  async fetch(request, env) {
    return (await handleMoonAPI(request)) ?? compressDataAsset(request, await env.ASSETS.fetch(request));
  },
};
