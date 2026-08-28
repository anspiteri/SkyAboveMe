import type { LocationStatusState } from "../components/LocationStatus.ts";
import type { Satellite } from "../domain/satellite.ts";

/**
 * Application state for the dashboard.
 *
 * Deliberately tiny for V1: current location status and the fetched satellite
 * data. Later phases add visibility results alongside `satellites`.
 */
export interface AppState {
  location: LocationStatusState;
  satellites: SatelliteDataState;
}

export type SatelliteDataState =
  | { kind: "loading" }
  | { kind: "loaded"; satellites: Satellite[] }
  | { kind: "error"; message: string };

/** The state the app boots into: requesting location and satellite data. */
export function createInitialState(): AppState {
  return {
    location: { kind: "acquiring" },
    satellites: { kind: "loading" },
  };
}
