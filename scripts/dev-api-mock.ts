/**
 * Offline satellite data server for development.
 *
 * Serves the curated satellite fixtures (see `dev-fixtures.ts`) over the same
 * `/api/satellites` endpoint the browser calls, so the app renders a full sky
 * even while CelesTrak is unreachable. Start it in place of `scripts/dev-api.ts`
 * (use `deno task dev:mock`): Vite proxies `/api` to this server and nothing in
 * the browser or production code changes.
 */

import { MOCK_SATELLITES } from "./dev-fixtures.ts";

const PORT = 8787;

Deno.serve({ port: PORT }, (request: Request) => {
  if (request.method !== "GET" || new URL(request.url).pathname !== "/api/satellites") {
    return new Response(
      JSON.stringify({ error: "Not found" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify(MOCK_SATELLITES), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
});

console.log(`[dev-api:mock] serving offline satellite fixtures on http://localhost:${PORT}`);
