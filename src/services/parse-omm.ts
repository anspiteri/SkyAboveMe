import type { SatelliteElements } from "../domain/satellite.ts";

/**
 * Parses a single CelesTrak OMM (Orbit Mean-elements Message) JSON record into
 * a domain satellite identity + orbital elements.
 *
 * CelesTrak omits null/blank and redundant mandatory OMM fields (CENTER_NAME,
 * REF_FRAME, TIME_SYSTEM, MEAN_ELEMENT_THEORY, ...), so this only relies on the
 * fields actually required to propagate with SGP4.
 *
 * A record that is missing a required field yields `null` so the caller can
 * skip it and continue (AGENTS.md §17) rather than failing the whole request.
 */

export interface RawOmmRecord {
  OBJECT_NAME?: string;
  OBJECT_ID?: string;
  EPOCH?: string;
  MEAN_MOTION?: string | number;
  ECCENTRICITY?: string | number;
  INCLINATION?: string | number;
  RA_OF_ASC_NODE?: string | number;
  ARG_OF_PERICENTER?: string | number;
  MEAN_ANOMALY?: string | number;
  EPHEMERIS_TYPE?: string | number;
  CLASSIFICATION_TYPE?: string;
  NORAD_CAT_ID?: string | number;
  ELEMENT_SET_NO?: string | number;
  REV_AT_EPOCH?: string | number;
  BSTAR?: string | number;
  MEAN_MOTION_DOT?: string | number;
  MEAN_MOTION_DDOT?: string | number;
}

/** Domain identity + elements extracted from one OMM record. */
export interface ParsedOmmSatellite {
  noradId: number;
  name: string;
  elements: SatelliteElements;
}

/** Parse one OMM record, or return null when a required field is missing. */
export function parseOmmRecord(raw: unknown): ParsedOmmSatellite | null {
  if (typeof raw !== "object" || raw === null) return null;

  const rec = raw as Record<string, unknown>;

  const noradId = toFiniteNumber(rec.NORAD_CAT_ID);
  const epoch = typeof rec.EPOCH === "string" ? rec.EPOCH.trim() : "";
  const meanMotion = toFiniteNumber(rec.MEAN_MOTION);
  const eccentricity = toFiniteNumber(rec.ECCENTRICITY);
  const inclination = toFiniteNumber(rec.INCLINATION);
  const raOfAscNode = toFiniteNumber(rec.RA_OF_ASC_NODE);
  const argOfPericenter = toFiniteNumber(rec.ARG_OF_PERICENTER);
  const meanAnomaly = toFiniteNumber(rec.MEAN_ANOMALY);

  const required = [
    noradId,
    epoch,
    meanMotion,
    eccentricity,
    inclination,
    raOfAscNode,
    argOfPericenter,
    meanAnomaly,
  ];

  if (required.some((v) => v === null)) return null;

  return {
    noradId: noradId as number,
    name: typeof rec.OBJECT_NAME === "string" ? rec.OBJECT_NAME.trim() : "",
    elements: {
      epoch: epoch as string,
      meanMotionRevPerDay: meanMotion as number,
      eccentricity: eccentricity as number,
      inclinationDeg: inclination as number,
      raOfAscNodeDeg: raOfAscNode as number,
      argOfPericenterDeg: argOfPericenter as number,
      meanAnomalyDeg: meanAnomaly as number,
      bstar: toFiniteNumber(rec.BSTAR) ?? 0,
      meanMotionDot: toFiniteNumber(rec.MEAN_MOTION_DOT) ?? 0,
      meanMotionDdot: toFiniteNumber(rec.MEAN_MOTION_DDOT) ?? 0,
    },
  };
}

/** Coerce a string/number field to a finite number, else null. */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
