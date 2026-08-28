/**
 * Coordinate transforms between the frames used for propagation and for
 * viewing (AGENTS.md §10, §22):
 *
 *   TemeECI ─(gmst rotation)─> ECEF ─(observer ENU basis)─> look angles
 *
 * These are pure functions; the caller supplies the propagated satellite
 * position, the observer's geodetic position and the observation time.
 *
 * Frame notes:
 *  - TemeECI: the satellite.js SGP4 output, inertial, x-axis ≈ vernal equinox.
 *  - ECEF: rotates with the Earth; x-axis through Greenwich.
 *  - Topocentric (azimuth/elevation/range): relative to the observer's local
 *    horizon, computed in an east/north/up basis.
 */

import type { EciVector } from "../domain/satellite.ts";
import type { EcfVector } from "./observer.ts";
import {
  degreesToRadians,
  normalizeRadians,
  normalizeDegrees,
  radiansToDegrees,
} from "../utils/angles.ts";

const J2000_JD = 2451545.0;
const DAYS_PER_CENTURY = 36525.0;

/**
 * Greenwich Mean Sidereal Time for a given instant, in radians.
 *
 * Standard IAU expression using the Julian Date relative to J2000:
 *   GMST₀ (deg) = 280.46061837 + 360.98564736629·d + 0.000387933·T² − T³/38710000
 * where d = JD − 2451545 and T = d / 36525.
 */
export function gmstRadians(date: Date): number {
  const jd = toJulianDate(date);
  const d = jd - J2000_JD;
  const t = d / DAYS_PER_CENTURY;

  const gmstDeg =
    280.46061837 +
    360.98564736629 * d +
    0.000387933 * t * t -
    (t * t * t) / 38710000.0;

  return normalizeRadians(degreesToRadians(gmstDeg));
}

/**
 * Convert a Julian Date from a UTC time. The GMST/IAU expression above is
 * only accurate to ~0.1 s for UTC≈UT1, far below the required accuracy for
 * pass prediction, so UTC is used directly.
 */
function toJulianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/**
 * Rotate a TemeECI vector into the ECEF frame by the Greenwich sidereal time.
 * ECEF is ECI rotated about the z-axis by GMST (positive eastward).
 */
export function eciToEcf(eci: EciVector, gmst: number): EcfVector {
  const cosG = Math.cos(gmst);
  const sinG = Math.sin(gmst);

  return {
    x: eci.x * cosG + eci.y * sinG,
    y: -eci.x * sinG + eci.y * cosG,
    z: eci.z,
  };
}

/**
 * The position of a satellite relative to the observer, as azimuth, elevation
 * and range. `observerEcf` and `satelliteEcf` are Earth-centred fixed vectors;
 * the ENU (east/north/up) basis is built from the observer's geodetic
 * latitude/longitude.
 */
export function calculateTopocentricPosition(
  observerLatitudeDeg: number,
  observerLongitudeDeg: number,
  observerEcf: EcfVector,
  satelliteEcf: EcfVector,
): TopocentricPosition {
  const lat = degreesToRadians(observerLatitudeDeg);
  const lon = degreesToRadians(observerLongitudeDeg);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);

  const rx = satelliteEcf.x - observerEcf.x;
  const ry = satelliteEcf.y - observerEcf.y;
  const rz = satelliteEcf.z - observerEcf.z;

  const range = Math.hypot(rx, ry, rz);

  const east = -sinLon * rx + cosLon * ry;
  const north =
    -sinLat * cosLon * rx - sinLat * sinLon * ry + cosLat * rz;
  const up =
    cosLat * cosLon * rx + cosLat * sinLon * ry + sinLat * rz;

  const elevation = Math.asin(up / range);
  const azimuth = normalizeRadians(Math.atan2(east, north));

  return {
    elevationDeg: radiansToDegrees(elevation),
    azimuthDeg: normalizeDegrees(radiansToDegrees(azimuth)),
    rangeKm: range,
  };
}

export interface TopocentricPosition {
  /** Degrees above the local horizon (−90…+90). Negative = below horizon. */
  elevationDeg: number;
  /** Degrees clockwise from true north (0…360). */
  azimuthDeg: number;
  /** Straight-line distance, kilometres. */
  rangeKm: number;
}
