import { defineConfig } from "vite";

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
});
