/**
 * Deno Deploy entrypoint ("dynamic" runtime).
 *
 * Serves the whole app from a single Deno process:
 *   - `/api/satellites`  → the satellite data proxy (api/satellites.ts)
 *   - everything else    → the Vite production build in `dist/` (SPA fallback)
 *
 * This replaces the two-piece Vercel setup (static frontend + Deno function)
 * with one edge deployment, so the browser always calls the same-origin
 * `/api/satellites` and no observer coordinates leave the device.
 */
import { serveDir } from "@std/http/file-server";
import apiHandler from "./api/satellites.ts";

const API_PATH = "/api/satellites";
const DIST_ROOT = `${import.meta.dirname}/dist`;

const PERMISSIONS_POLICY = "geolocation=(self), camera=(), microphone=()";

// The SPA shell is read once at boot and served as the fallback for any path
// that does not resolve to a built asset (e.g. "/" and future client routes).
let fallbackHtml: string | null = null;
try {
  fallbackHtml = await Deno.readTextFile(`${DIST_ROOT}/index.html`);
} catch {
  // dist/ is absent when running without a prior `deno task build`; the app
  // will still serve /api/satellites and log the missing shell.
}

Deno.serve({ onListen: () => {} }, handler);

async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === API_PATH) {
    return withHeaders(await apiHandler(request));
  }

  // Serve the production frontend. Any path that does not resolve to a real
  // file in dist/ falls back to the SPA shell so client-side routes work.
  const response = await serveDir(request, { fsRoot: DIST_ROOT, quiet: true });
  if (response.status !== 404) {
    return withHeaders(response);
  }

  if (fallbackHtml === null) {
    return withHeaders(new Response("Not Found", { status: 404 }));
  }
  return withHeaders(
    new Response(fallbackHtml, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }),
  );
}

function withHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
