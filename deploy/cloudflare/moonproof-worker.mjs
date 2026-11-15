// MoonProof Worker entrypoint: same-origin API proxy (moonproof-proxy.mjs) first, then the static web/ assets.
// Only a default export here: workerd treats every named export of the main module as an entrypoint and refuses
// to start when one is not a handler ("Incorrect type for map entry 'DEFAULT_UPSTREAM'"). Helpers live in the proxy module.
import { handleAPI } from "./moonproof-proxy.mjs";

export default {
  async fetch(request, env) {
    return (await handleAPI(request)) ?? env.ASSETS.fetch(request);
  },
};
