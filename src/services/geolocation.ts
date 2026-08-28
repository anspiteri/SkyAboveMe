import type { Observer } from "../domain/observer.ts";

/**
 * Browser geolocation adapter.
 *
 * Requests a single, approximate position from the browser (no continuous
 * watch in V1). The precise coordinates are used only in the browser for
 * local astronomy calculations; they are never transmitted, stored, or logged
 * (see AGENTS.md §12, §18, §19).
 */

/** Reasons a location request can fail, mapped to distinct UI states. */
export type LocationError =
  | "unsupported"
  | "permission-denied"
  | "position-unavailable"
  | "timeout"
  | "unknown";

export type LocationResult =
  | { ok: true; observer: Observer }
  | { ok: false; error: LocationError };

const DEFAULT_TIMEOUT_MS = 10_000;

/** True when this browser exposes the Geolocation API at all. */
export function isGeolocationSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

/**
 * Request the observer's current position once.
 *
 * Catches every failure mode and normalises it to a `LocationError`, so the
 * caller can render a helpful state. Never logs coordinates.
 */
export function getCurrentLocation(): Promise<LocationResult> {
  if (!isGeolocationSupported()) {
    return Promise.resolve({ ok: false, error: "unsupported" });
  }

  return new Promise((resolve) => {
    // enableHighAccuracy is deliberately false: satellite viewing only needs
    // roughly kilometre-scale accuracy, and low accuracy is quicker to obtain.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          ok: true,
          observer: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            heightKm: 0,
            capturedAt: new Date(position.timestamp),
            accuracyM: position.coords.accuracy,
          },
        });
      },
      (error) => {
        resolve({ ok: false, error: mapPositionError(error.code) });
      },
      {
        enableHighAccuracy: false,
        timeout: DEFAULT_TIMEOUT_MS,
        maximumAge: 60_000,
      },
    );
  });
}

/** Normalise a GeolocationPositionError code to our `LocationError` union. */
function mapPositionError(code: number): LocationError {
  switch (code) {
    case 1: // PERMISSION_DENIED
      return "permission-denied";
    case 2: // POSITION_UNAVAILABLE
      return "position-unavailable";
    case 3: // TIMEOUT
      return "timeout";
    default:
      return "unknown";
  }
}
