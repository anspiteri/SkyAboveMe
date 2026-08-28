/**
 * Local development server for the satellite proxy.
 *
 * Mirrors how Vercel invokes `api/satellites.ts` so the browser can call
 * `/api/satellites` in development without deploying. Start it alongside the
 * Vite dev server; Vite proxies `/api` to this server (see vite.config.ts).
 */
import handler from "../api/satellites.ts";

const PORT = 8787;

Deno.serve({ port: PORT }, (request: Request) => handler(request));

console.log(`[dev-api] satellite proxy listening on http://localhost:${PORT}`);
