/**
 * Visibility-related domain types (AGENTS.md §7).
 *
 * `ObserverRelativePosition` expresses where a satellite is from the observer's
 * vantage point: the compass direction (azimuth), the height above the horizon
 * (elevation/altitude), and straight-line distance. These are the values the
 * dashboard ultimately presents.
 *
 * Coordinate convention: azimuth is measured clockwise from true north
 * (0° = north, 90° = east, 180° = south, 270° = west); elevation is
 * degrees above the local horizon (negative = below the horizon); range is in
 * kilometres.
 */

export interface ObserverRelativePosition {
  /** Degrees above the local horizon (−90…+90). Negative = below horizon. */
  elevationDeg: number;
  /** Compass direction clockwise from north, in degrees (0…360). */
  azimuthDeg: number;
  /** Straight-line distance from the observer to the satellite, kilometres. */
  rangeKm: number;
}
