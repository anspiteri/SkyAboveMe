/**
 * Parsed satellite orbital elements and display metadata.
 *
 * These are the domain's representation of a tracked object, produced by
 * converting raw CelesTrak OMM records at the service boundary (AGENTS.md §9).
 * The propagation layer later reconstructs the OMM shape needed by the SGP4
 * library from `elements`.
 */

/** Keplerian orbital elements (as published in the OMM record). */
export interface SatelliteElements {
  /** Ephemeris (orbital element set) epoch, ISO 8601 UTC. */
  epoch: string;
  /** Mean motion, revolutions per day. */
  meanMotionRevPerDay: number;
  /** Eccentricity, dimensionless. */
  eccentricity: number;
  /** Inclination, degrees. */
  inclinationDeg: number;
  /** Right ascension of the ascending node, degrees. */
  raOfAscNodeDeg: number;
  /** Argument of perigee, degrees. */
  argOfPericenterDeg: number;
  /** Mean anomaly, degrees. */
  meanAnomalyDeg: number;
  /** BSTAR drag coefficient, 1/Earth radii. */
  bstar: number;
  /** First derivative of mean motion, rev/day^2. */
  meanMotionDot: number;
  /** Second derivative of mean motion, rev/day^3. */
  meanMotionDdot: number;
}

/** A tracked satellite ready for propagation and presentation. */
export interface Satellite {
  /** NORAD catalogue number (SATCAT). */
  noradId: number;
  /** Full catalogue name from the OMM record, e.g. "ISS (ZARYA)". */
  name: string;
  /** Short, friendly label for the dashboard, e.g. "ISS". */
  label: string;
  /** One-line description, when we have one. */
  description: string | null;
  /** Orbital elements used for propagation. */
  elements: SatelliteElements;
}

/** A vector in an Earth-centred inertial (ECI) frame, kilometres. */
export interface EciVector {
  x: number;
  y: number;
  z: number;
}

/**
 * A satellite's propagated state at a single instant.
 *
 * `position` and `velocity` are TEME-ECI (an Earth-centred inertial frame tied
 * to the true equator and mean equinox of date). They are the raw SGP4 output;
 * later phases convert them to observer-relative altitude/azimuth/distance.
 */
export interface SatellitePosition {
  /** NORAD catalogue number tying this back to a {@link Satellite}. */
  noradId: number;
  /** The instant the state was propagated for (UTC). */
  timestamp: Date;
  /** Inertial position, kilometres. */
  position: EciVector;
  /** Inertial velocity, kilometres per second. */
  velocity: EciVector;
}
