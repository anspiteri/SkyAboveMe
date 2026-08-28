import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// satellite.js's root entry also exports an optional WebAssembly worker that
// Vite cannot bundle cleanly and that we never use (SGP4 is pure JS). We alias
// `satellite.js` to tools/satellite-entry.ts, a small shim re-exporting only
// the pure-JS submodules; the submodule specifiers are routed to their real
// files (bypassing the package's `exports` map). Deno typecheck/test keep
// using the real package root via the deno.json import map.
const SATELLITE = fileURLToPath(
  new URL("node_modules/satellite.js/dist", import.meta.url),
);

export default defineConfig({
  server: {
    port: 5173,
    // In development the satellite proxy runs locally (see scripts/dev-api.ts).
    // In production the same endpoints are served by Vercel Functions.
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  publicDir: "public",
  resolve: {
    // Order matters: the more specific `satellite.js/dist/...` subpaths must be
    // matched before the `satellite.js` root alias, since aliases match by
    // import-specifier prefix.
    alias: [
      {
        find: "satellite.js/dist/io.js",
        replacement: `${SATELLITE}/io.js`,
      },
      {
        find: "satellite.js/dist/propagation.js",
        replacement: `${SATELLITE}/propagation.js`,
      },
      {
        find: "satellite.js",
        replacement: fileURLToPath(
          new URL("./tools/satellite-entry.ts", import.meta.url),
        ),
      },
    ],
  },
});
