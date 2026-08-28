/**
 * Location source & accuracy domain types, plus helpers for building an
 * `Observer` from manually-entered generic coordinates (AGENTS.md §7, §12).
 *
 * Location can be supplied two ways:
 *   - GPS (browser geolocation) — precise, source "gps".
 *   - manual (a curated city, or raw lat/lon the user types) — deliberately
 *     coarse/generic, source "manual".
 *
 * These are pure, browser-free helpers: building an observer never touches the
 * DOM or network, so it is independently testable.
 */

import type { Observer } from "./observer.ts";
import { findCity } from "../data/cities.ts";

/** How the location was obtained. */
export type LocationSource = "gps" | "manual";

/**
 * Precision of the location. V1 keeps this implicit (GPS is precise, manual is
 * coarse); a finer-grained choice is parked in agents/v2.md.
 */
export type LocationAccuracy = "precise" | "coarse";

/** Valid WGS-84 geodetic latitude bounds, degrees. */
const MIN_LAT = -90;
const MAX_LAT = 90;
/** Valid WGS-84 longitude bounds, degrees. */
const MIN_LON = -180;
const MAX_LON = 180;

/**
 * The two kinds of manual location the user can submit: choose a city from the
 * curated list, or type raw coordinates. This is the component↔app contract;
 * the app resolves it to an `Observer`.
 */
export type ManualLocationInput =
  | { kind: "city"; name: string }
  | { kind: "coordinates"; latitude: number; longitude: number };

/**
 * Resolve a manual location input to an `Observer` (coarse/generic), or null if
 * it cannot be turned into a valid position (unknown city or out-of-range
 * coordinates).
 */
export function resolveManualLocation(
  input: ManualLocationInput,
  capturedAt: Date,
): Observer | null {
  if (input.kind === "city") {
    const city = findCity(input.name);
    if (city === null) return null;
    return buildManualObserver(city.latitude, city.longitude, capturedAt);
  }
  return buildManualObserver(input.latitude, input.longitude, capturedAt);
}

/**
 * Build an `Observer` from manually-entered coordinates, or null when the input
 * is not a finite, in-range WGS-84 position. `capturedAt` is the clock time the
 * user submitted the choice; `accuracyM` is null because we cannot know how
 * accurate a typed/city location is.
 */
export function buildManualObserver(
  latitude: unknown,
  longitude: unknown,
  capturedAt: Date,
): Observer | null {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (latitude < MIN_LAT || latitude > MAX_LAT) return null;
  if (longitude < MIN_LON || longitude > MAX_LON) return null;

  return {
    latitude,
    longitude,
    heightKm: 0,
    capturedAt,
    accuracyM: null,
  };
}

/** True when the trimmed string parses to a plausible decimal latitude. */
export function isPlausibleLatitude(value: string): boolean {
  const n = Number(value.trim());
  return Number.isFinite(n) && n >= MIN_LAT && n <= MAX_LAT;
}

/** True when the trimmed string parses to a plausible decimal longitude. */
export function isPlausibleLongitude(value: string): boolean {
  const n = Number(value.trim());
  return Number.isFinite(n) && n >= MIN_LON && n <= MAX_LON;
}

/** Parse a trimmed decimal string to a number, or null if not a finite number. */
export function parseCoordinate(value: string): number | null {
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
}
