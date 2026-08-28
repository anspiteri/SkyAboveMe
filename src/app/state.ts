import type { LocationStatusState } from "../components/LocationStatus.ts";
import type { Satellite } from "../domain/satellite.ts";
import type { PropagateResult } from "../services/satellite-propagation.ts";
import type { ObserverRelativeResult } from "../services/observer-relative.ts";
import type { TonightSummary } from "../domain/tonight.ts";

/**
 * Application state for the dashboard.
 *
 * V1 composition: current location status, the fetched satellite data, the
 * computed SGP4 positions, the observer-relative (azimuth/elevation/range)
 * visibility results derived from those positions plus the observer location,
 * and the user's UI choices (which satellite view is shown, and which satellite
 * (if any) has its detail panel expanded).
 */
export interface AppState {
  location: LocationStatusState;
  /** Whether the manual "Enter location" form is open. */
  locationEntry: LocationEntryState;
  satellites: SatelliteDataState;
  positions: PropagationState;
  observerRelative: VisibilityState;
  /** The VISIBLE TONIGHT pass prediction, once location + satellites are known. */
  tonight: TonightState;
  /** Which satellite list the user is viewing. */
  view: SatelliteView;
  /** The satellite (if any) whose detail panel is expanded. */
  selection: SelectedSatellite;
}

/** Whether the manual "Enter location" form is open (closed by default). */
export type LocationEntryState =
  | { kind: "closed" }
  | { kind: "choosing" };

/** The two satellite views the dashboard can show. */
export type SatelliteView = "all" | "tonight";

/**
 * The VISIBLE TONIGHT pass prediction. `idle` until both a location and loaded
 * satellites exist; `no-night` when the location/date has no distinct night
 * (polar day/night); `ready` with the computed passes once available.
 */
export type TonightState =
  | { kind: "idle" }
  | { kind: "no-night" }
  | { kind: "ready"; summary: TonightSummary };

/**
 * Which satellite's detail panel is open. `none` means no panel is expanded.
 * Exactly one satellite can be expanded at a time (single-open accordion).
 */
export type SelectedSatellite =
  | { kind: "none" }
  | { kind: "selected"; noradId: number };

export type SatelliteDataState =
  | { kind: "loading" }
  | { kind: "loaded"; satellites: Satellite[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };

/**
 * The outcome of propagating the loaded satellites to a single instant.
 * Per-satellite failures are surfaced inside `results` as skips, so the
 * top-level state is always either idle (no satellites yet) or ready.
 */
export type PropagationState =
  | { kind: "idle" }
  | { kind: "ready"; results: PropagateResult[]; computedAt: number };

/**
 * Observer-relative (azimuth/elevation/range) results for the propagated
 * satellites. `idle` until both the observer location and propagated positions
 * are available; once both exist the results are computed against the observer.
 */
export type VisibilityState =
  | { kind: "idle" }
  | { kind: "ready"; results: ObserverRelativeResult[]; computedAt: number };

/**
 * The state the app boots into. Location is NOT requested at boot: the app is
 * fully usable without it (All-tracked view), and the user opts in when ready
 * (AGENTS.md §12).
 */
export function createInitialState(): AppState {
  return {
    location: { kind: "idle" },
    locationEntry: { kind: "closed" },
    satellites: { kind: "loading" },
    positions: { kind: "idle" },
    observerRelative: { kind: "idle" },
    tonight: { kind: "idle" },
    view: "all",
    selection: { kind: "none" },
  };
}
