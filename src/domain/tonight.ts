/**
 * Domain types for the VISIBLE TONIGHT feature (AGENTS.md §7, §19b).
 *
 * A "pass" is one continuous span during which a single satellite is above the
 * observer's horizon, derived from propagating the satellite across the night
 * window and detecting horizon crossings. From the set of passes we derive the
 * best observing window (densest span of activity) and a next-events timeline.
 *
 * All times are UTC instants.
 */

/** One continuous above-horizon span for a single satellite during the night. */
export interface SatellitePass {
  /** NORAD catalogue number tying this pass to a {@link Satellite}. */
  noradId: number;
  /** When the satellite rises clear of the horizon, UTC. */
  riseUtc: Date;
  /** When it sets below the horizon again, UTC. */
  setUtc: Date;
  /** When it reaches its highest point, UTC. */
  culminationUtc: Date;
  /** Peak elevation reached, degrees (0..90). */
  maxElevationDeg: number;
  /** Compass azimuth at culmination, degrees (0..360). */
  culminationAzimuthDeg: number;
}

/**
 * A span of the night with the most overlapping satellite activity, used as a
 * "best observing window" recommendation.
 */
export interface BestObservingWindow {
  /** Window start, UTC. */
  startUtc: Date;
  /** Window end, UTC. */
  endUtc: Date;
  /** Peak number of satellites simultaneously above the horizon in this window. */
  peakSatellites: number;
}

/** A single entry on the "next events" chronological list. */
export interface NextEvent {
  /** When this event happens, UTC. */
  timeUtc: Date;
  /** NORAD catalogue number of the satellite involved. */
  noradId: number;
  /** The kind of event for presentation. */
  kind: "rise" | "culmination" | "set";
  /** Max elevation for a culmination event (else undefined). */
  maxElevationDeg?: number;
  /** Azimuth for a culmination event (else undefined). */
  azimuthDeg?: number;
}

/** The computed result of the VISIBLE TONIGHT feature. */
export interface TonightSummary {
  /** The night window analysed (sunset → next sunrise), UTC. */
  window: { startUtc: Date; endUtc: Date };
  /** Every detected pass across the night. */
  passes: SatellitePass[];
  /** The recommended best observing window, if any passes exist. */
  bestWindow: BestObservingWindow | null;
  /** Upcoming events from the reference time, chronological. */
  nextEvents: NextEvent[];
  /** Reference time the computation is anchored to, UTC. */
  computedAt: Date;
}
