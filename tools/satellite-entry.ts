// Vite-only re-export shim for satellite.js (never imported by Deno).
//
// The satellite.js root entry re-exports an optional WebAssembly worker that
// Vite fails to bundle ("Top-level await is not supported with the 'iife'
// output format") and drags in ~280 kB of dead WASM code that we never run.
// SGP4 itself is pure JavaScript in `dist/io.js` + `dist/propagation.js`, so
// this shim re-exports just those submodules and is aliased from `satellite.js`
// in `vite.config.ts`. Deno typecheck/tests keep using the real package root.
export { json2satrec } from "satellite.js/dist/io.js";
export { propagate } from "satellite.js/dist/propagation.js";
export type { OMMJsonObject } from "satellite.js/dist/common-types.js";
export type { SatRec } from "satellite.js/dist/propagation/SatRec.js";
