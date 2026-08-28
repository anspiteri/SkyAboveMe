import type { LocationStatusState } from "../components/LocationStatus.ts";
import type { Satellite } from "../domain/satellite.ts";
import type { PropagateResult } from "../services/satellite-propagation.ts";

/**
 * Application state for the dashboard.
 *
 * V1 composition: current location status, the fetched satellite data, and the
 * computed SGP4 positions. Later phases add observer-relative visibility
 * results alongside `positions`.
 */
export interface AppState {
  location: LocationStatusState;
  satellites: SatelliteDataState;
  positions: PropagationState;
}

export type SatelliteDataState =
  | { kind: "loading" }
  | { kind: "loaded"; satellites: Satellite[] }
  | { kind: "error"; message: string };

/**
 * The outcome of propagating the loaded satellites to a single instant.
 * Per-satellite failures are surfaced inside `results` as skips, so the
 * top-level state is always either idle (no satellites yet) or ready.
 */
export type PropagationState =
  | { kind: "idle" }
  | { kind: "ready"; results: PropagateResult[]; computedAt: number };

/** The state the app boots into: requesting location and satellite data. */
export function createInitialState(): AppState {
  return {
    location: { kind: "acquiring" },
    satellites: { kind: "loading" },
    positions: { kind: "idle" },
  };
}
