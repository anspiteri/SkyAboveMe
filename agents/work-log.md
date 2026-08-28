# Agent Work-Log

Use this file to track each step of work. Summarise changes, decisions, and
next steps so the next agent can pick up without re-reading the whole repo.

## Formatting conventions

* Newest entries go at the **top** (`## Latest` section is always first).
* Every entry is dated, so it is obvious how recent the work is.
* One entry per logical step/commit.
* Each entry has: **What** (files changed), **Why** (decision), and **Next**.
* Keep the "next steps" rolling — when an entry's steps are done, delete them.

---

## Latest

> **Status:** Phase 3 (Satellite data) done — proxy + client fetch + basic names/
> counts UI, verified live through the dev server. Next up: Phase 4
> (Propagation with SGP4).
>
> **Today's date:** 2026-08-28

---

## Entries (newest first)

### 2026-08-28 — Phase 3: Satellite data

**What**

* `src/domain/satellite.ts` — pure `Satellite` + `SatelliteElements` types
  (parsed orbital elements + display metadata).
* `src/services/parse-omm.ts` — `parseOmmRecord()` maps one CelesTrak OMM JSON
  record to a domain identity+elements object, returning `null` for malformed
  records (skip-and-continue, AGENTS.md §17).
* `api/satellites.ts` — Vercel serverless proxy. Fetches each curated NORAD ID
  from CelesTrak (`gp.php?CATNR=…&FORMAT=JSON`) with bounded concurrency,
  parses OMM, enriches with curated labels/descriptions, returns domain
  `Satellite[]` with CORS + short CDN cache. Stateless, receives no location.
* `vercel.json` — function config (`maxDuration: 10`).
* `src/services/satellite-data.ts` — client fetch service hitting
  `/api/satellites`, validating the response shape, returning a tagged
  `SatelliteDataResult` (never throws).
* `scripts/dev-api.ts` + `vite.config.ts` proxy + `deno.json` tasks — local
  development mode: `deno task dev` runs the API handler on :8787 and Vite on
  :5173 with `/api` proxied.
* UI wiring (basic names/counts per Phase 3): `src/app/state.ts`
  (`SatelliteDataState`), `src/components/SatelliteList.ts`
  (loading/loaded/error + retry), `Dashboard.ts`, `app.ts`.
* Tests: `parse-omm_test.ts`, `satellite-data_test.ts`, `api/satellites_test.ts`
  (live integration, skips when CelesTrak is down). Total suite: 15 passing.

**Why**

* AGENTS.md §9 (OMM ↔ domain conversion at the service boundary), §17 (error
  handling), §20 (serverless proxy for CORS/caching; user chose proxy-first).
* Phase 3 goal: retrieve a manageable dataset, parse it, display names/counts.

**Details**

* Verified live: `deno task dev` -> Vite :5173 proxies `/api/satellites` ->
  handler -> CelesTrak, returning all 12 curated domain satellites (HTTP 200).
* `deno check src api` passes, `deno task build` passes.

**Next**

* Phase 4 — Propagation: integrate `satellite.js` SGP4; use `Satellite.elements`
  via `json2satrec` to compute positions for the current time.

---

### 2026-08-28 — Phase 2: Geolocation

**What**

* `src/domain/observer.ts` — pure `Observer` type (geodetic lat/lon in degrees,
  heightKm, capturedAt, accuracyM). No DOM.
* `src/services/geolocation.ts` — `getCurrentLocation()` (single, low-accuracy
  position) and `isGeolocationSupported()`; normalises every browser failure to
  a `LocationError` union (`unsupported | permission-denied |
  position-unavailable | timeout | unknown`). Never logs/transmits coordinates.
* `src/app/state.ts` — minimal `AppState` holding a `LocationStatusState`.
* `src/components/LocationStatus.ts` — status banner with distinct
  acquiring/acquired/error states and a coarse (1-decimal) location label.
* `src/components/Dashboard.ts` — renders the location status below the header.
* `src/app/app.ts` — requests location once on boot, updates state and
  re-renders on result.
* CSS for the status banner (icon + pulse animation, reduced-motion aware).
* `deno.json` — added `compilerOptions` (strict + `lib` incl. `deno.ns`/`DOM`)
  so both `deno check src` and `deno test` share a consistent type environment.
* `tests/services/geolocation_test.ts` — stubs `navigator.geolocation` to cover
  supported/unsupported, success->Observer mapping, and error-code mapping.

**Why**

* AGENTS.md §12 (geolocation), §16 (error handling), §18/§19 (privacy).
* Single position (no continuous watch) per §12.

**Details**

* Verified: `deno check src` passes, `deno task build` passes, all 4
  geolocation tests pass.
* Privacy model holds: precise coordinates stay in-browser; UI shows only a
  coarse label and error states.

**Next**

* Phase 3 (Satellite data) — done, see the entry above.

---

### 2026-08-28 — Step 1: Curated satellite catalog

**What**

* Added `api/curated-catalog.ts`: a hand-curated list of 12 notable satellites
  (NORAD catalogue numbers, labels, descriptions). Exports `CURATED_CATALOG`,
  `getCuratedSatellite()`, and `CURATED_NORAD_IDS`.

**Why**

* V1 tracks a small, notable set rather than the full catalogue, keeping the
  dashboard focused on objects people have heard of.

**Details**

* Every NORAD ID was verified live against CelesTrak
  (`gp.php?CATNR=<id>&FORMAT=JSON`) on 2026-08-28.
* List: ISS(25544), Tiangong/CSS(48274), Hubble(20580), Terra(25994),
  Aqua(27424), Envisat(27386), NOAA-20(43013), NOAA-19(33591),
  Suomi NPP(37849), Landsat 8(39084), Landsat 9(49260), MetOp-B(38771).
* Type-checks with `deno check`.

**Next**

* Done — superseded by building the serverless proxy in a later step.

---

### 2026-08-28 — Step 0: Project skeleton (Phase 1)

**What**

* Scaffolded Deno + Vite vanilla-ts project in-place (kept existing LICENSE,
  `agents/`, `api/curated-catalog.ts`).
* `deno.json`: tasks `dev`, `build`, `preview`, `typecheck`, `test`; imports for
  `vite@8.2.2`, `typescript@6.0.3`, `satellite.js@7.1.0`; `nodeModulesDir: "auto"`.
* `tsconfig.json` with strict mode: `strict`, `noUnusedLocals/Parameters`,
  `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
* `vite.config.ts`, `index.html` (dark theme-color), `public/favicon.svg`.
* Styles foundation: `src/styles/reset.css`, `tokens.css` (dark-sky design
  tokens), `global.css`.
* Minimal shell: `src/main.ts` -> `src/app/app.ts` ->
  `src/components/Dashboard.ts` rendering a "Sky Above Me" header with a
  location placeholder.
* Merged `.gitignore` (agents + Vite/Deno/node_modules/dist/deno.lock).

**Why**

* Matches AGENTS.md Phase 1 (skeleton) and §5/§6 (Deno + Vite, strict TS, ES
  modules, minimal dependencies).

**Details**

* Verified: `deno check src` passes, `deno task build` passes, dev server
  serves at `http://localhost:5173/`.

**Next**

* Phase 2 (Geolocation) and Phase 3 (Satellite data) — done, see the entries
  above.

---
