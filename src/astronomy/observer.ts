/**
 * Observer position in an Earth-centred Earth-fixed (ECEF) frame.
 *
 * ECEF has its origin at Earth's centre, the z-axis through the north pole,
 * and the x-axis through the Greenwich meridian / equator intersection, so it
 * rotates with the Earth. The observer's geodetic latitude/longitude/height
 * (WGS84) is converted into this frame once per location so later steps only
 * do vector arithmetic (AGENTS.md §10).
 */

import type { Observer } from "../domain/observer.ts";
import { degreesToRadians } from "../utils/angles.ts";

/** An Earth-centred Earth-fixed position, kilometres. */
export interface EcfVector {
  x: number;
  y: number;
  z: number;
}

/** WGS84 semi-major axis, kilometres. */
export const WGS84_A = 6378.137;
/** WGS84 flattening. */
export const WGS84_F = 1 / 298.257223563;
/** First eccentricity squared (derived from the flattening). */
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);

/**
 * Convert WGS84 geodetic latitude/longitude/height into ECEF.
 *
 * The geodetic-to-ECEF transform is the standard ellipsoid equations:
 *   N = a / √(1 − e² sin²φ)
 *   x = (N + h) cos φ cos λ
 *   y = (N + h) cos φ sin λ
 *   z = (N (1 − e²) + h) sin φ
 * where φ = latitude, λ = longitude, h = height, a = semi-major axis and
 * e² = first eccentricity squared.
 */
export function geodeticToEcf(
  latitudeDeg: number,
  longitudeDeg: number,
  heightKm: number,
): EcfVector {
  const lat = degreesToRadians(latitudeDeg);
  const lon = degreesToRadians(longitudeDeg);

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const cosLon = Math.cos(lon);
  const sinLon = Math.sin(lon);

  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const ground = n + heightKm;

  return {
    x: ground * cosLat * cosLon,
    y: ground * cosLat * sinLon,
    z: (n * (1 - WGS84_E2) + heightKm) * sinLat,
  };
}

/** The observer's geodetic position as an ECEF vector. */
export function getObserverPosition(observer: Observer): EcfVector {
  return geodeticToEcf(
    observer.latitude,
    observer.longitude,
    observer.heightKm,
  );
}
