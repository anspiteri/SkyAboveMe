/**
 * SGP4 orbital propagation (Phase 4).
 *
 * Reconstructs the OMM shape expected by satellite.js from our domain
 * `Satellite`, builds an SGP4 structure (`SatRec`), and propagates it to the
 * requested instant to produce an ECI (TEME) position/velocity (AGENTS.md §10).
 *
 * External I/O is not involved here; the only external dependency is the
 * satellite.js library, kept behind this service boundary.
 */
import { json2satrec, propagate, type OMMJsonObject, type SatRec } from "satellite.js";
import type { EciVector, Satellite, SatellitePosition } from "../domain/satellite.ts";

/** Whether a satellite propagated successfully or had to be skipped. */
export type PropagateResult =
  | { status: "ok"; position: SatellitePosition }
  | { status: "skip"; noradId: number; reason: string };

/**
 * Rebuild the OMM object that satellite.js needs from a domain `Satellite`.
 *
 * The numeric orbital elements are the authoritative inputs to SGP4. The
 * identity fields (`OBJECT_ID`, `ELEMENT_SET_NO`) carry no propagation weight
 * but are required by the OMM type, so we supply placeholder values.
 */
export function buildOmm(satellite: Satellite): OMMJsonObject {
  const e = satellite.elements;
  return {
    OBJECT_NAME: satellite.name,
    OBJECT_ID: satellite.name,
    EPOCH: e.epoch,
    MEAN_MOTION: e.meanMotionRevPerDay,
    ECCENTRICITY: e.eccentricity,
    INCLINATION: e.inclinationDeg,
    RA_OF_ASC_NODE: e.raOfAscNodeDeg,
    ARG_OF_PERICENTER: e.argOfPericenterDeg,
    MEAN_ANOMALY: e.meanAnomalyDeg,
    NORAD_CAT_ID: satellite.noradId,
    ELEMENT_SET_NO: "999",
    BSTAR: e.bstar,
    MEAN_MOTION_DOT: e.meanMotionDot,
    MEAN_MOTION_DDOT: e.meanMotionDdot,
  };
}

/** Build the SGP4 structure for a satellite, or null if the elements are unusable. */
export function buildSatRec(satellite: Satellite): SatRec | null {
  try {
    return json2satrec(buildOmm(satellite));
  } catch {
    // The elements are out of range for SGP4 (e.g. eccentricity >= 1).
    return null;
  }
}

/**
 * Propagate a single satellite to `date`.
 *
 * Returns `ok` with the ECI position/velocity on success, or `skip` with a
 * diagnostic reason on failure rather than throwing (AGENTS.md §17: skip a
 * failed satellite and log what happened).
 */
export function propagateSatellite(
  satellite: Satellite,
  date: Date,
): PropagateResult {
  const satrec = buildSatRec(satellite);
  if (satrec === null) {
    return { status: "skip", noradId: satellite.noradId, reason: "elements could not be loaded into SGP4" };
  }

  const pv = propagate(satrec, date, { communityDecayCheckEnabled: true });
  if (pv === null) {
    return {
      status: "skip",
      noradId: satellite.noradId,
      reason: `SGP4 could not propagate (error ${satrec.error})`,
    };
  }

  return {
    status: "ok",
    position: {
      noradId: satellite.noradId,
      timestamp: date,
      position: toEciVector(pv.position),
      velocity: toEciVector(pv.velocity),
    },
  };
}

/** Propagate a set of satellites to a single instant, returning one result each. */
export function propagateSatellites(
  satellites: Satellite[],
  date: Date,
): PropagateResult[] {
  return satellites.map((satellite) => propagateSatellite(satellite, date));
}

function toEciVector(v: { x: number; y: number; z: number }): EciVector {
  return { x: v.x, y: v.y, z: v.z };
}
