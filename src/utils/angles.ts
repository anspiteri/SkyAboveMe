/**
 * Small angle helpers for astronomical calculations.
 *
 * Angles crossing a full circle (e.g. azimuths and longitudes) are normalised
 * so callers never have to deal with out-of-range or negative values.
 */

/** Degrees → radians. */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Radians → degrees. */
export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Normalise an angle in degrees into the range [0, 360). */
export function normalizeDegrees(degrees: number): number {
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Normalise an angle in radians into the range [0, 2π). */
export function normalizeRadians(radians: number): number {
  const wrapped = radians % (2 * Math.PI);
  return wrapped < 0 ? wrapped + 2 * Math.PI : wrapped;
}
