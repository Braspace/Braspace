// Type-only helpers shared by the typed lab/studio/app modules (nothing at runtime).
/** Open-ended JSON from the Go API; callers validate the fields they read. */
export type Json = Record<string, any>;
/** three.js is loaded from a CDN and has no local type declarations: its module and scene objects are loosely typed. */
export type Three = any;
