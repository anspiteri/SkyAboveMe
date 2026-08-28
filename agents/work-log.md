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

> **Status:** Skeleton (Phase 1) is committed. Next up: Phase 2 (Geolocation).
>
> **Today's date:** 2026-08-28

---

## Entries (newest first)

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

* Phase 2 — Geolocation: implement `src/services/geolocation.ts`, add
  `LocationStatus` component, wire accepted/denied/unavailable/timeout states.
* Phase 3 — Satellite data: build Vercel serverless proxy `api/satellites.ts`
  that fetches `CURATED_NORAD_IDS` from CelesTrak (OMM JSON) server-side to
  avoid CORS; add client fetch service.

---
