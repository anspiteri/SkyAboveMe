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

> **Status:** Phases 4–8 done + Style Phase 1 foundation + **VISIBLE TONIGHT
> feature done.** The app propagates satellites (SGP4), converts to
> azimuth/elevation/range against the observer, and now predicts the coming
> night: **VISIBLE TONIGHT** replaces "Visible now" as the second view. It
> computes (via pure NOAA sunrise/sunset) the sunset→next-sunrise window, then
> multi-epoch propagation (~60s steps) to detect every above-horizon pass
> (rise/interpolated set/culmination + peak elevation + azimuth), derives a best
> observing window (densest span of concurrent activity) and a chronological
> next-events list, and shows a live right-now snapshot. No fabricated
> metrics — all numbers are computed. **Offline dev fixture added:** run
> `deno task dev:mock` to view the app with static satellites while CelesTrak is
> down (serves realistic-but-frozen elements over `/api/satellites`; normal
> `dev`/prod untouched). **Next:** deeper Information-language + identity
> styling passes (STYLE-GUIDE §38 Phases 2–3) now that the feature shape is
> known; retry the live `tests/api` integration test once CelesTrak returns.
>
> **Today's date:** 2026-08-28

---

## Entries (newest first)

### 2026-08-28 — Offline dev fixture: view the app during a CelesTrak outage

**What**

* `scripts/dev-fixtures.ts` (new) — 12 curated `Satellite` fixtures with
  realistic-but-frozen orbital elements, reusing `api/curated-catalog.ts`
  labels/descriptions. Same wire shape the browser validator accepts; all
  12 build SGP4-usable `SatRec`s.
* `scripts/dev-api-mock.ts` (new) — dev proxy serving the fixtures over the same
  `/api/satellites` endpoint (404 on other paths / non-GET).
* `deno.json` — `dev:mock` task (runs `dev:api:mock` + `dev:vite`).
* `tests/dev-fixtures_test.ts` — fixture invariants: unique NORAD IDs, wire
  shape, SGP4-usability, JSON round-trip.

**Why**

* CelesTrak outage makes the live proxy return nothing, so the app shows only
  outage banners and is hard to develop against. A separate `dev:mock` task
  (user's choice) lets the app render a full sky offline without changing
  browser code or production paths.

**Next**

* Deeper styling passes (STYLE-GUIDE §38 Phases 2–3).
* Retry `tests/api` live test once CelesTrak is back.

### 2026-08-28 — VISIBLE TONIGHT feature: pass prediction for the coming night

**What**

* `src/astronomy/sun.ts` (new) — pure NOAA sunrise/sunset (`sunriseUtc`,
  `sunsetUtc`) + `tonightWindow` (sunset → next sunrise; null for polar day/night).
* `src/domain/tonight.ts` (new) — `SatellitePass`, `BestObservingWindow`,
  `NextEvent`, `TonightSummary` types.
* `src/services/tonight.ts` (new) — `computeTonightSummary` propagates each
  satellite across the night at 60s steps, converts each step to
  observer-relative elevation/azimuth, detects contiguous above-horizon passes
  (interpolating rise/set crossings, culminating at the peak sample); derives
  the best window (longest run at max concurrency) and the next-events list.
* `src/app/state.ts` — `SatelliteView` `"visible"` → `"tonight"`; new
  `TonightState` (`idle` | `no-night` | `ready{summary}`).
* `src/app/app.ts` — `computeTonight()` runs once location + satellites are
  ready; recomputed on location change / data load; reset on location clear.
* `src/components/SatelliteList.ts` — toggle "All tracked" / **"VISIBLE
  TONIGHT"**; new tonight page (live snapshot, window bar, next events, pass
  list reusing tap-to-expand detail).
* `src/components/Dashboard.ts` — forwards `tonight` prop.
* `src/styles/global.css` — tonight styles (live bar, window card, events).
* Tests — `tests/astronomy/sun_test.ts` + `tests/services/tonight_test.ts`.

**Why**

* User decided VISIBLE TONIGHT replaces the "Visible now" view and is a real
  feature (AGENTS §19b), so style foundation went first, then this feature.
  Data-provenance rule (AGENTS §13): only render computed metrics.

**Next**

* Deeper styling passes (STYLE-GUIDE §38 Phases 2–3).
* Retry `tests/api` live test once CelesTrak is back.

### 2026-08-28 — Style Phase 1 (Foundation): token-level instrument identity

**What**

* `src/styles/tokens.css` — reworked tokens to the STYLE-GUIDE.md instrument
  palette: near-black bg `#080A0A` / elevated `#0D1010`; bone text `#D8D3C4`,
  muted `#85877F`, dim `#4D514C`; **sky/object** accent cyan `#73B9C9` (+ soft /
  strong variants); **instrument** accent amber `#D6A84A` (+ soft / dim); success
  `#91B86A`, warning `#D09A3A`, danger `#C86655`; border toned to
  `rgba(216,211,196,0.14)`. Radii reduced to `2px` (machined). Shadows reduced.
  Added `--color-on-accent: #081416` (was referenced but never defined) and
  `--tracking-label`.
* `index.html` — IBM Plex Mono (400/500/600/700) via Google Fonts CDN links
  (preconnect + stylesheet); `theme-color` → `#080A0A`.
* `src/styles/global.css` — body font → monospace-first (`var(--font-mono)`) with
  `tabular-nums`.

**Why**

* Establish the instrument identity at the token level first (STYLE-GUIDE §38
  Phase 1), which applies cleanly to all current views and carries into VISIBLE
  TONIGHT. Chose third-party Google Fonts request to experiment; may switch to
  self-hosting later. No component restructure yet (deferred Phase 2).

**Verified**

* `deno check src api` ✓, `vite build` ✓ (8.43 kB CSS), 57/57 non-live tests ✓.

**Next**

* **VISIBLE TONIGHT** nighttime-viewer feature (§19b) — the destination for the
  current "Visible now" view — then the deeper Information-language + identity
  styling passes (Phases 2–3) once the feature's shape is known.

### 2026-08-28 — Style guide integrated with built functionality

**What**

* Created `agents/STYLE-GUIDE.md` (UNTRACKED — gitignored) as the visual
  direction, then reworked it so it is consistent with what V1 actually
  computes rather than describing only un-built features.
* Added **§0 "Scope & V1 Status"** with a **data-provenance** contract: markers
  PRESENT / FUTURE / TODO, and the rule that a metric renders only when the app
  computes it (tie-in to AGENTS.md §13 no-fabrication).
* Reframed the status of each "vision" section:
  * **PRESENT** (§17): real-time above-horizon list — count, aligned
    name/azimuth/elevation/range columns (monospace), cyan live-object accent,
    tap-to-expand detail, honest no-location state.
  * **FUTURE** (§15 Tonight, §16 Best Window, §18 Naked-Eye, §19 Upcoming
    Events, plus §20 objects / §21 conditions).
  * **NEW §19b "VISIBLE TONIGHT — TODO (next phase, more than style)"**: the
    destination for the current "Visible now" view — a primarily **nighttime**
    viewer computing tonight's passes, best observing window, and next events.
    Documents the required computation (multi-epoch propagation → horizon-cross
    detection → rise/set/culmination → best window) so it's actionable, and
    explicitly scopes out metrics with no data source (cloud, darkness,
    naked-eye, Moon/planets/stars, space weather, aurora).
* Reframed **§32 Existing Component Direction** to the real components and where
  each lands (header nameplate, location status strip, manual-entry form, view
  toggle, both satellite views, detail readout, outage banner).
* Updated **§24 mobile walkthrough** and **§38 styling priority**: Phases 1–2
  (Foundation + Information language) are pure style and apply to V1 now; Phase
  3 (TONIGHT / BEST WINDOW / VISIBLE TONIGHT / NEXT 60 / CONDITIONS) needs the
  §19b feature first and is not cosmetic.

**Why**

* The user wants the guide's richer night view to eventually be the **VISIBLE
  TONIGHT** page (not "Visible now"), which is a real feature beyond styling.
* Keep the guide honest: never style/fabricate metrics the app can't compute.

**Next**

* Phase 8 style implementation: update `tokens.css` (palette → bone #D8D3C4,
  instrument amber #D6A84A, sky cyan #73B9C9, near-black bg), type →
  monospace-first (IBM Plex Mono), radii ~2px, drop shadows; then apply the
  Information-language pass to current components. VISIBLE TONIGHT feature is a
  separate future phase.

### 2026-08-28 — Phase 8: Location is opt-in (no auto-prompt) + manual entry

**What**

* `src/app/state.ts` — `LocationStatusState` now has an `idle` default (no
  location requested at boot); `acquired` carries `source` ("gps" | "manual").
  Added `locationEntry` flag ("closed" | "choosing") to `AppState`.
* `src/app/app.ts` — removed the boot-time `getCurrentLocation()` auto-call.
  Added `useGpsLocation()` (guard against re-request while acquiring/acquired),
  `submitLocation(input)`, `openLocationEntry()`, `closeLocationEntry()`,
  `changeLocation()` (clears location + resets `observerRelative` to idle).
  Queries the Permissions API once on boot (inspect-only, never a prompt).
* `src/domain/location.ts` — `LocationSource`/`LocationAccuracy`,
  `ManualLocationInput` union ("city" | "coordinates"), pure
  `resolveManualLocation()` and `buildManualObserver()` (finite + in-range
  WGS-84 checks).
* `src/data/cities.ts` (new) — curated 12-city list + `findCity()` for manual
  (generic/coarse) coordinates; no network, no query-string leakage.
* `src/components/LocationStatus.ts` — rewritten: idle prompt with "Use my
  location" / "Enter location" buttons, manual-entry form (city dropdown OR raw
  lat/lon with validation), acquired state with "Change", error states with
  retry, and an honest permission-status line via the Permissions API.
* `src/components/SatelliteList.ts` / `Dashboard.ts` — accept `hasLocation`;
  "Visible now" without a location shows "No location set — set a location at
  the top…" instead of forever "calculating".
* `vercel.json` + `vite.config.ts` — Strict `Permissions-Policy` header
  (`geolocation=(self), camera=(), microphone=()`) for prod + dev.
* `src/styles/global.css` — idle/entry/button/permission-note styles.
* `tests/domain/location_test.ts` (new), extended
  `tests/services/geolocation_test.ts` (Permissions API), plus new domain tests.

**Why**

* Privacy-first (AGENTS.md §4/§12/§18/§19): precise coordinates are only fetched
  on an explicit tap, used locally for the SGP4→topocentric maths, and never
  stored, transmitted, or logged. A generic city/typed location is the
  privacy-preserving alternative; it avoids sending any query string anywhere.
* Discoverability is preserved: the All-tracked view works without location.
* The restrictive Permissions-Policy enforces the model from day one.

**Verified**

* `deno check src api` ✓, `deno run -A npm:vite build` ✓ (40.88 kB JS),
  `deno test` 57/57 non-live tests ✓ (live CelesTrak integration test still
  fails while CelesTrak is down — pre-existing).

**Next**

* Phase 8 (deployment/mobile styling polish) once location UX is confirmed; then
  commit the outstanding work.

### 2026-08-28 — Phase 7: Two views (All tracked / Visible now) + tap-to-detail

**What**

* `src/services/observer-relative.ts` — added pure `rankByVisibility(results)`
  ordering above-horizon results by elevation descending, then range ascending
  (closest first); stable, drops skips. Applied in `app.ts` `computeVisibility()`
  after `filterAboveHorizon`.
* `src/astronomy/orbit.ts` (new) — pure `orbitalPeriodMinutes()` and
  `altitudeKm()` derivations used in the detail panel.
* `src/app/state.ts` — added hoisted UI state: `view: SatelliteView`
  ("all" | "visible") and `selection: SelectedSatellite` (single-open detail).
* `src/app/app.ts` — wires `rankByVisibility`; adds `selectSatellite()`
  (single-open toggle) and `setView()`; passes new props through render.
* `src/components/Dashboard.ts` — forwards view/selection/onSelect/onSetView.
* `src/components/SatelliteList.ts` — rewritten: segmented toggle (All tracked /
  Visible now), tappable rows with chevron hint and `aria-expanded`, and a shared
  expandable detail panel (full name, curated description, NORAD, orbit facts:
  altitude/period/inclination, plus live az/elev/range) for both views. Retired
  the old ECI-fallback view.
* `src/styles/global.css` — segmented control, tappable row + chevron, expanded
  detail panel styles; kept dark-sky tokens. (Next phase is a dedicated style
  polish pass for phone + deployment.)
* `agents/v2.md` (new, UNTRACKED — added to `.gitignore`) — future
  considerations: official (non-CelesTrak) per-satellite link-outs, ranking
  refinements, mobile polish notes.
* `agents/AGENTS.md` (untracked) — §15/§25 updated for visibility ranking +
  two views; §8 structure adds `astronomy/orbit.ts`.

**Why**

* Pivot from an "interestingness" heuristic to a simple, data-honest ordering:
  rank by what is most visible / closest right now, and let tapping a satellite
  reveal its description + facts (the interesting part) rather than a numeric
  score. Two explicit views separate "browse my satellites" from "what can I see
  now". Hoisted view/selection so they survive the wholesale re-renders.
* AGENTS.md §15 (transparent ordering, no fabricated data), §16 (pure, testable),
  §21 (no new deps/framework/DB).
* CelesTrak SATCAT record URL (`records.php?CATNR=<id>`) was considered for a
  detail "link out" and deferred (see `agents/v2.md`) — prefer official sources.

**Verification**

* typecheck ✓, build ✓ (34.43 kB JS / 6.69 kB CSS — small growth from the detail
  panel), 47 non-live tests ✓ (new: `rankByVisibility` ×3, `orbit.ts` ×4).
* Live CelesTrak integration test still blocked by the ongoing outage (unrelated).

**Next**

* Phase 8 — dedicated style/polish pass to get the UI ready for a phone and
  deployment (touch targets, safe-area insets, a11y, loading states, Vercel).

---

### 2026-08-28 — Satellite-data outage / error info banner

**What**

* `src/app/state.ts` — added `{ kind: "empty" }` to `SatelliteDataState` for a
  successful proxy response that contains no satellites.
* `src/app/app.ts` — `loadSatellites()` now treats an empty successful response
  as a temporary outage (`{ kind: "empty" }`) instead of an empty sky, and
  builds clear, human-facing error messages via `satelliteDataMessage(error)`
  (replaces the terse `Couldn't load satellite data (network).`).
* `src/components/SatelliteList.ts` — added `"empty"` to its state union and a
  `renderInfoBanner()` helper; both `error` and `empty` render as a title +
  plain-language explanation + "Try again" button.
* `src/styles/global.css` — `.satellite-list__banner` styles with an amber
  (warning) left accent so the outage reads as an informative notice, not a
  generic placeholder.

**Why**

* When CelesTrak is down the proxy (correctly, per §17) delegates per-satellite
  failures and returns HTTP 200 with an **empty** array; the app previously
  read that as "success → nothing above the horizon", which is misleading
  during an outage. The new `empty` state turns this into a clear info banner.
* AGENTS.md §13 ("If a value is not available... show an honest unavailable
  state") and §17 (graceful degradation, no fake data); §19 (no sensitive logs —
  messages are generic).

**Verification**

* typecheck ✓, build ✓ (31.62 kB JS / CSS +banner), all 39 non-live tests ✓.
* The live `tests/api/satellites_test.ts` still cannot pass during the current
  confirmed CelesTrak outage (direct curl → HTTP 000); unrelated to this change.

**Next**

* Phase 7 — Ranking: a transparent "interestingness" score to order the list.

---

### 2026-08-28 — Snappier outage banner (fail-fast + client timeout)

**What**

* `api/satellites.ts` — replaced the per-request `FETCH_TIMEOUT_MS = 8s` with a
  shared `HANDLER_DEADLINE_MS = 5s` `AbortController`. `fetchCuratedSatellites()`
  aborts all in-flight CelesTrak requests at the deadline; `runBatched` stops
  scheduling new work once aborted and `fetchSatellite(noradId, signal)` uses the
  shared signal (no per-satellite timer). So an outage now resolves in ~5s instead
  of exhausting 12 requests at concurrency 4 (~24s) and returning 200/empty.
* `src/services/satellite-data.ts` — client-side `FETCH_TIMEOUT_MS = 7s`
  `AbortController` around the `/api/satellites` fetch, treated as a `network`
  failure so the loading state / outage banner surfaces promptly (~7s) even if
  the proxy or CelesTrak hangs.
* `tests/services/satellite-data_test.ts` — added a timeout test asserting the
  fetch aborts (~7s) and reports `network`; exported `FETCH_TIMEOUT_MS` for it.

**Why**

* User asked for the outage/data banner to appear snappier. During the current
  confirmed CelesTrak outage, connections hang: without this the proxy took
  ~24s (12 hung requests, 8s each, concurrency 4) and the browser waited that
  whole time. A hard server deadline + a client-side abort bound the wait to
  ~5-7s.
* Single-request batching (`gp.php` with comma-separated `CATNR`) was considered
  and rejected: CelesTrak docs state `CATNR` supports a *single* catalog number
  only, so the multi-request path was kept and made to fail fast instead.
* AGENTS.md §17 (graceful degradation / fail fast) and §7 (IO isolated in
  services).

**Verification**

* typecheck ✓, build ✓ (31.72 kB JS), 40/41 tests ✓ — only the live CelesTrak
  integration test fails and it now fails fast in ~5s (empty array → "expected at
  least one satellite") during the ongoing outage; unrelated to this change.

**Next**

* Phase 7 — Ranking: a transparent "interestingness" score to order the list.

---

### 2026-08-28 — Phase 6: Horizon filtering

**What**

* `src/domain/visibility.ts` — added pure `isAboveHorizon(elevationDeg)`
  (true iff elevation strictly > 0; exactly on the horizon counts as not above).
* `src/services/observer-relative.ts` — added `filterAboveHorizon(results)`
  keeping only `ok` results whose elevation is above the horizon.
* `src/app/app.ts` — `computeVisibility()` now stores the filtered,
  above-horizon results in `VisibilityState`.
* `src/components/SatelliteList.ts` — when `VisibilityState` is ready the list
  renders exactly the above-horizon results in computed order, with a count
  ("N satellites above the horizon") and an honest empty state ("Nothing above
  the horizon right now."). Until it is ready it falls back to the raw ECI
  position view.

**Why**

* AGENTS.md §25 Phase 6 — only display satellites with altitude > 0°.
* Filtering lives at the service/app layer (pure predicate in domain), keeping
  `isAboveHorizon` independently testable (§16: horizon boundary / negative /
  zenith). The UI no longer hides data it has: nothing is shown below the
  horizon at all.

**Tests (3 new; 40 total, 39 pass)**

* `isAboveHorizon` boundary set (positive/zero/negative/zenith).
* `filterAboveHorizon` keeps only ok-and-above (drops at-horizon, below, skip).
* `filterAboveHorizon` preserves order and handles empty input.
* NOTE: the live `tests/api/satellites_test.ts` integration test fails in this
  session because **CelesTrak is unreachable** (direct curl → HTTP 000/timeout).
  All satellites time out, the handler returns HTTP 200 with an empty array
  (per-satellite skip-and-degrade, §17), and the test's "at least one
  satellite" assertion then fails. This is an external outage, not a Phase 6
  regression — Phase 6 touched no API code. Re-run `deno task test` once
  CelesTrak is back; the API test skips/fails only on live connectivity.

Verification: typecheck ✓, build ✓ (30.60 kB JS / 13.67 gzip), dev smoke (app
shell 200, `/api/satellites` route 200 → empty list during the outage), 39/40
tests green, processes cleaned.

**Next**

* Phase 7 — Ranking: a transparent "interestingness" score to order the list.

---

**What**

* `src/utils/angles.ts` — generic degree/radian conversions + `normalizeDegrees`/
  `normalizeRadians` (created the utils dir).
* `src/domain/visibility.ts` — `ObserverRelativePosition` (elevationDeg,
  azimuthDeg, rangeKm).
* `src/astronomy/observer.ts` — WGS84 geodetic→ECEF: `geodeticToEcf()` +
  `getObserverPosition()`; exports `WGS84_A/F/E2`.
* `src/astronomy/coordinates.ts` — pure transforms: `gmstRadians(date)`,
  `eciToEcf(eci, gmst)`, `calculateTopocentricPosition(lat, lon, obsEcf, satEcf)`.
* `src/services/observer-relative.ts` — `computeObserverRelativePositions()`
  runs the frame chain ECI → (GMST rotation) → ECEF → ENU → az/el/range.
* `src/app/state.ts` — added `VisibilityState` (`idle` | `ready`) to `AppState`.
* `src/app/app.ts` — `computeVisibility()` runs when both the observer location
  (acquired) and propagated positions (ready) are present.
* `src/components/Dashboard.ts` + `SatelliteList.ts` — forward `visibility` and
  render `<az> · <el> above/below horizon · <range> km` per satellite, falling
  back to the ECI position while visibility is idle.

**Why**

* Implemented the frame transforms as local pure functions (`src/astronomy/`)
  instead of pulling more of satellite.js in, keeping astronomy self-contained
  and independently testable (AGENTS.md §7, §16) and avoiding extra Vite shim
  surface. Cross-checked against satellite.js in tests.
* Explicit coordinate-system names/comments (AGENTS.md §10): TemeECI → ECEF →
  topocentric ENU.

**Tests (15 new; 37 total passing)**

* `tests/astronomy/observer_test.ts` (5): equator/prime-meridian/pole references,
  cross-check vs satellite.js `geodeticToEcf`, height effect.
* `tests/astronomy/coordinates_test.ts` (5): `gmstRadians` vs `gstime`,
  `eciToEcf` vs `eciToEcf`, topocentric vs `ecfToLookAngles`, due-east-on-horizon,
  domain bounds.
* `tests/services/observer-relative_test.ts` (5): mapping/ordering, bounds,
  empty set, plausible LEO range, multi-satellite.

Verification: `deno task typecheck` ✓, `deno task build` ✓ (29.77 kB JS / 13.51 gzip),
`deno task test` ✓ 37/37, dev-server smoke (page 200, `/api/satellites` proxy 200,
12 satellites) ✓, stale processes cleaned.

**Next**

* Phase 7 — Ranking: a transparent "interestingness" score to order the list.

---

**What**

* `src/services/satellite-propagation.ts` — SGP4 integration:
  * `buildOmm(satellite)` rebuilds the OMM object satellite.js needs from the
    domain `Satellite` (identity fields are placeholders; SGP4 only reads the
    orbital elements).
  * `buildSatRec(satellite): SatRec | null` — `json2satrec`, null on failure.
  * `propagateSatellite(satellite, date): PropagateResult` —
    `propagate(..., { communityDecayCheckEnabled: true })` producing an ECI
    (TEME) position/velocity, or a `skip` with a diagnostic reason.
  * `propagateSatellites(satellites, date)` maps over a set (AGENTS.md §17:
    skip a failed satellite, don't break the app).
* `src/domain/satellite.ts` — added `EciVector` + `SatellitePosition`
  (noradId, timestamp, ECI position/velocity in km).
* Wiring: `state.ts` adds `PropagationState` (idle | ready);
  `app.ts` propagates at `new Date()` once satellites load; `Dashboard.ts` and
  `SatelliteList.ts` render each satellite's current ECI coordinates.
* `vite.config.ts` — aliases `satellite.js` → `tools/satellite-entry.ts`, a
  pure-JS shim re-exporting only the SGP4 submodules, so the optional WASM
  worker (which breaks the Vite build and is dead weight) is never bundled.
  `tools/satellite-entry.ts` is not under `src/`/`api/`, so Deno typecheck/test
  keep using the real package root.
* Tests: `tests/services/satellite-propagation_test.ts` (7 tests) including a
  pinned SGP4 regression reference (ISS ECI at epoch), LEO-range sanity,
  determinism, and skip-on-bad-elements. Full suite: 22 passing.

**Why**

* AGENTS.md Phase 4: "Integrate SGP4. Calculate satellite position for the
  current time."
* AGENTS.md §10 (explicit coordinate frames — ECI/TEME), §17 (graceful per-sat
  failure), §20 (prefer known/reference values).

**Details**

* Verified: `deno task typecheck` ✓, `deno task build` ✓ (clean 27.6 kB bundle,
  no WASM), `deno task test` (22/22) ✓, and the dev server serves the app and
  proxy returns all 12 satellites cleanly (no port conflicts).
* The satellite.js root entry's WASM worker fails Vite's build
  ("Top-level await not supported with the 'iife' output format") and bloats
  the bundle ~309 kB; the shim sidesteps both by importing only the pure-JS
  SGP4 path.

**Next**

* Phase 7 — Ranking: a transparent "interestingness" score to order the list.

---

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

* Phases 4–6 (Propagation / Observer-relative / Horizon filtering) — all done;
  Phase 7 introduces the ranking layer, in progress/next.

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
