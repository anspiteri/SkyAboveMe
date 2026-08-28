/**
 * Orchestrates the frame chain from propagated satellite ECI positions to
 * observer-relative (azimuth/elevation/range) results for the current moment
 * (AGENTS.md §10, §22).
 *
 * The flow for each propagated satellite:
 *   ECI  ── rotation by GMST at T ──>  ECEF  ── relative to observer ──>  alt/az/range
 */

import type { Observer } from "../domain/observer.ts";
import type { SatellitePosition } from "../domain/satellite.ts";
import {
  isAboveHorizon,
  type ObserverRelativePosition,
} from "../domain/visibility.ts";
import { getObserverPosition } from "../astronomy/observer.ts";
import {
  calculateTopocentricPosition,
  eciToEcf,
  gmstRadians,
} from "../astronomy/coordinates.ts";

export type ObserverRelativeResult =
  | {
      status: "ok";
      noradId: number;
      position: ObserverRelativePosition;
    }
  | {
      status: "skip";
      noradId: number;
      reason: string;
    };

/**
 * Compute azimuth, elevation and range for every successfully propagated
 * satellite. Satellites with no position are reported as skips so the caller
 * can show a stable, self-explanatory list without bubbling errors.
 */
export function computeObserverRelativePositions(
  observer: Observer,
  positions: SatellitePosition[],
): ObserverRelativeResult[] {
  const observerEcf = getObserverPosition(observer);
  const gmst = gmstRadians(positions[0]?.timestamp ?? observer.capturedAt);

  const results: ObserverRelativeResult[] = [];

  for (const pos of positions) {
    const satelliteEcf = eciToEcf(pos.position, gmst);
    const position = calculateTopocentricPosition(
      observer.latitude,
      observer.longitude,
      observerEcf,
      satelliteEcf,
    );
    results.push({ status: "ok", noradId: pos.noradId, position });
  }

  return results;
}

/**
 * Keep only the results for satellites currently above the observer's horizon
 * (elevation > 0°), dropping both below-horizon satellites and skips. This is
 * the Phase 6 filtering step: the dashboard shows only what is visible now.
 */
export function filterAboveHorizon(
  results: ObserverRelativeResult[],
): ObserverRelativeResult[] {
  return results.filter(
    (r) => r.status === "ok" && isAboveHorizon(r.position.elevationDeg),
  );
}
