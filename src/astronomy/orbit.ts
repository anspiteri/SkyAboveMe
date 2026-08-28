/**
 * Orbit-derived facts shown in the satellite detail panel (AGENTS.md §7, §16).
 *
 * These are pure, independently testable derivations from data we already hold:
 * the current propagated ECI position and the mean-motion orbital element.
 * They avoid adding external dependencies or pretending to know values (such
 * as visual magnitude) that the underlying data cannot support.
 */

import { WGS84_A } from "./observer.ts";
import type { EciVector } from "../domain/satellite.ts";

/**
 * Orbital period in minutes from the mean motion (revolutions per day).
 * A day is 1440 minutes, so period = 1440 / mean motion.
 */
export function orbitalPeriodMinutes(meanMotionRevPerDay: number): number {
  if (!Number.isFinite(meanMotionRevPerDay) || meanMotionRevPerDay <= 0) {
    return 0;
  }
  return 1440 / meanMotionRevPerDay;
}

/**
 * Current altitude above the Earth's (mean-sphere) surface in kilometres,
 * derived from the propagated ECI position magnitude minus the mean radius.
 * The ECI position is geocentric (measured from Earth's centre), so its
 * magnitude minus the mean Earth radius is the height above the surface.
 */
export function altitudeKm(position: EciVector): number {
  const radius = Math.hypot(position.x, position.y, position.z);
  if (!Number.isFinite(radius)) return 0;
  return radius - WGS84_A;
}
