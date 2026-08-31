/**
 * Static satellite fixtures for offline development.
 *
 * CelesTrak is occasionally unreachable, which makes the live `/api/satellites`
 * proxy return nothing and the app show only outage banners — hard to develop
 * against. This module provides a ready-made, deterministic set of domain
 * `Satellite` objects with the exact same shape the browser validator expects
 * (`fetchSatelliteData` → `parseSatelliteList`), so the mock proxy can serve it
 * directly and the app renders a full sky with no network access.
 *
 * The data lives in `src/data/satellite-snapshot.ts` — the same frozen snapshot
 * the production proxy serves as its last-resort fallback — so development and
 * the emergency fallback behave identically. It is still NOT live data (see the
 * IMPORTANT note in that module).
 */

export { FALLBACK_SATELLITES as MOCK_SATELLITES } from "../src/data/satellite-snapshot.ts";