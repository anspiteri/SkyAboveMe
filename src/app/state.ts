import type { LocationStatusState } from "../components/LocationStatus.ts";

/**
 * Application state for the dashboard.
 *
 * Deliberately tiny for V1. Later phases add satellite data and visibility
 * results alongside `location`.
 */
export interface AppState {
  location: LocationStatusState;
}

/** The state the app boots into: requesting location. */
export function createInitialState(): AppState {
  return { location: { kind: "acquiring" } };
}
