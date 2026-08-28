/**
 * Where the observer is standing. A pure data structure; depends on no DOM.
 *
 * Coordinates are geodetic (WGS84) latitude/longitude in degrees plus height
 * above the ellipsoid in kilometres, matching the convention used by the
 * satellite propagation library. V1 uses a height of 0 (sea level) as the
 * observer is assumed to be on the ground.
 */

export interface Observer {
  /** Geodetic latitude in degrees, north positive. */
  latitude: number;
  /** Geodetic longitude in degrees, east positive. */
  longitude: number;
  /** Height above the WGS84 ellipsoid in kilometres. */
  heightKm: number;
  /** When this position was captured (browser-provided clock). */
  capturedAt: Date;
  /** Positional accuracy reported by the browser in metres, if available. */
  accuracyM: number | null;
}
