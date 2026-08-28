/**
 * VISIBLE TONIGHT pass prediction (AGENTS.md §10, §15, §19b).
 *
 * For each satellite this propagates SGP4 across the night window (sunset → next
 * sunrise) at a fixed step, converts each step to observer-relative elevation /
 * azimuth, and detects contiguous above-horizon spans to build passes. From the
 * passes it derives the best observing window (densest span of concurrent
 * activity) and a chronological next-events list.
 *
 * This is a heavier computation than the single-instant propagation because it
 * must search time; it runs once when location + satellites become available.
 * The numbers it reports (rise/set/culmination, peak elevation) are real,
 * computed values — never fabricated (AGENTS.md §13).
 */

import { propagate, type SatRec } from "satellite.js";
import type { Satellite } from "../domain/satellite.ts";
import type { Observer } from "../domain/observer.ts";
import type { TonightSummary, SatellitePass, NextEvent } from "../domain/tonight.ts";
import { tonightWindow } from "../astronomy/sun.ts";
import { getObserverPosition } from "../astronomy/observer.ts";
import { calculateTopocentricPosition, eciToEcf, gmstRadians } from "../astronomy/coordinates.ts";
import { buildSatRec } from "./satellite-propagation.ts";
import { isAboveHorizon } from "../domain/visibility.ts";

/** Sampling step: 60 seconds. Coarse enough to be fast, fine enough to catch
 *  LEO passes (several minutes long). */
const STEP_MS = 60_000;
/** Minimum pass length (minutes) to count as a real pass, filtering noise. */
const MIN_PASS_MINUTES = 1;
/** How many upcoming events to surface in the next-events list. */
const MAX_NEXT_EVENTS = 8;

/**
 * Compute the VISIBLE TONIGHT summary for the given satellites and observer at
 * the reference time `now`. Returns null when there is no distinct night at the
 * observer's latitude/date (polar day/night).
 */
export function computeTonightSummary(
  satellites: Satellite[],
  observer: Observer,
  now: Date,
): TonightSummary | null {
  const window = tonightWindow(now, observer.latitude, observer.longitude);
  if (window === null) return null;

  const observerEcf = getObserverPosition(observer);
  const passes: SatellitePass[] = [];

  for (const satellite of satellites) {
    const satrec = buildSatRec(satellite);
    if (satrec === null) continue;
    passes.push(
      ...passesForSatellite(
        satellite.noradId,
        satrec,
        observerEcf,
        observer,
        window.start,
        window.end,
      ),
    );
  }

  passes.sort((a, b) => a.riseUtc.getTime() - b.riseUtc.getTime());

  return {
    window: { startUtc: window.start, endUtc: window.end },
    passes,
    bestWindow: deriveBestWindow(passes),
    nextEvents: deriveNextEvents(passes, now, MAX_NEXT_EVENTS),
    computedAt: now,
  };
}

/** Sample one satellite's elevation/azimuth at a single instant. */
function stepLook(
  satrec: SatRec,
  observerEcf: ReturnType<typeof getObserverPosition>,
  observer: Pick<Observer, "latitude" | "longitude">,
  time: Date,
): { elevationDeg: number; azimuthDeg: number } {
  const pv = propagate(satrec, time, { communityDecayCheckEnabled: true });
  if (pv === null || pv.position === undefined) {
    // Propagation failed at this instant; treat as far below the horizon so the
    // satellite gracefully "disappears" rather than throwing (AGENTS §17).
    return { elevationDeg: -90, azimuthDeg: 0 };
  }
  const satelliteEcf = eciToEcf(pv.position as { x: number; y: number; z: number }, gmstRadians(time));
  const topo = calculateTopocentricPosition(
    observer.latitude,
    observer.longitude,
    observerEcf,
    satelliteEcf,
  );
  return { elevationDeg: topo.elevationDeg, azimuthDeg: topo.azimuthDeg };
}

/**
 * Detect all above-horizon passes for a single satellite across the night.
 * Samples elevation at a fixed step, groups contiguous above-horizon samples
 * into segments, interpolates the exact rise/set instants at segment edges, and
 * takes the peak sample of a segment as the culmination.
 */
function passesForSatellite(
  noradId: number,
  satrec: SatRec,
  observerEcf: ReturnType<typeof getObserverPosition>,
  observer: Pick<Observer, "latitude" | "longitude">,
  start: Date,
  end: Date,
): SatellitePass[] {
  const passes: SatellitePass[] = [];
  const startMs = start.getTime();
  const endMs = end.getTime();

  const samples: Array<{ tMs: number; elev: number; az: number }> = [];
  for (let tMs = startMs; tMs <= endMs; tMs += STEP_MS) {
    const { elevationDeg, azimuthDeg } = stepLook(satrec, observerEcf, observer, new Date(tMs));
    samples.push({ tMs, elev: elevationDeg, az: azimuthDeg });
  }

  let i = 0;
  while (i < samples.length) {
    if (!isAboveHorizon(samples[i]!.elev)) {
      i++;
      continue;
    }
    const segStart = i;
    let j = i;
    while (j < samples.length && isAboveHorizon(samples[j]!.elev)) j++;
    const segEnd = j - 1;
    i = j;

    const segStartSample = samples[segStart]!;
    const segEndSample = samples[segEnd]!;
    const durationMin = (segEndSample.tMs - segStartSample.tMs) / 60000;
    if (durationMin < MIN_PASS_MINUTES) continue;

    const riseMs = interpolateCrossing(samples, segStart, true);
    const setMs = interpolateCrossing(samples, segEnd, false);

    let peak = segStart;
    for (let k = segStart + 1; k <= segEnd; k++) {
      if (samples[k]!.elev > samples[peak]!.elev) peak = k;
    }

    const peakSample = samples[peak]!;
    passes.push({
      noradId,
      riseUtc: new Date(riseMs),
      setUtc: new Date(setMs),
      culminationUtc: new Date(peakSample.tMs),
      maxElevationDeg: peakSample.elev,
      culminationAzimuthDeg: peakSample.az,
    });
  }

  return passes;
}

/**
 * Linearily interpolate the horizon-crossing instant at the edge of a segment.
 * `edgeIndex` is the first above-horizon sample for a rise (`up=true`), or the
 * last above-horizon sample for a set (`up=false`); we interpolate with the
 * neighbouring below-horizon sample.
 */
function interpolateCrossing(
  samples: Array<{ tMs: number; elev: number }>,
  edgeIndex: number,
  up: boolean,
): number {
  const edge = samples[edgeIndex];
  const neighbour = samples[up ? edgeIndex - 1 : edgeIndex + 1];
  if (!edge || !neighbour || neighbour.elev === edge.elev) return edge?.tMs ?? 0;

  const frac = edge.elev / (edge.elev - neighbour.elev);
  return up
    ? edge.tMs - frac * (edge.tMs - neighbour.tMs)
    : edge.tMs + frac * (neighbour.tMs - edge.tMs);
}

/**
 * Best observing window: the contiguous span of the night where the number of
 * satellites simultaneously above the horizon is highest. A sweep over the
 * rise/set events splits the night into "runs" (periods of nonzero activity);
 * we return the longest run that reaches the maximum concurrency. Returns null
 * when there are no passes.
 */
export function deriveBestWindow(
  passes: SatellitePass[],
): TonightSummary["bestWindow"] {
  if (passes.length === 0) return null;

  const events: Array<{ tMs: number; delta: number }> = [];
  for (const pass of passes) {
    events.push({ tMs: pass.riseUtc.getTime(), delta: 1 });
    events.push({ tMs: pass.setUtc.getTime(), delta: -1 });
  }
  events.sort((a, b) => a.tMs - b.tMs);

  let active = 0;
  let runStart = -1;
  let peak = 0;

  let bestStart = 0;
  let bestEnd = 0;
  let bestActive = 0;

  for (const { tMs, delta } of events) {
    if (active === 0 && delta > 0) {
      runStart = tMs;
      peak = 0;
    }
    active += delta;
    if (active > peak) peak = active;

    if (active === 0) {
      // A run just closed at tMs; prefer the longest run at the max concurrency.
      const duration = tMs - runStart;
      if (peak > bestActive || (peak === bestActive && duration > bestEnd - bestStart)) {
        bestActive = peak;
        bestStart = runStart;
        bestEnd = tMs;
      }
    }
  }

  if (bestActive <= 0 || bestEnd <= bestStart) {
    return {
      startUtc: passes[0]!.riseUtc,
      endUtc: passes[passes.length - 1]!.setUtc,
      peakSatellites: passes.length > 0 ? 1 : 0,
    };
  }

  return {
    startUtc: new Date(bestStart),
    endUtc: new Date(bestEnd),
    peakSatellites: bestActive,
  };
}

/**
 * Next events: all rise/culmination/set events at or after `now`, chronological,
 * capped at MAX_NEXT_EVENTS.
 */
export function deriveNextEvents(
  passes: SatellitePass[],
  now: Date,
  max = MAX_NEXT_EVENTS,
): NextEvent[] {
  const events: NextEvent[] = [];
  for (const pass of passes) {
    events.push({ timeUtc: pass.riseUtc, noradId: pass.noradId, kind: "rise" });
    events.push({
      timeUtc: pass.culminationUtc,
      noradId: pass.noradId,
      kind: "culmination",
      maxElevationDeg: pass.maxElevationDeg,
      azimuthDeg: pass.culminationAzimuthDeg,
    });
    events.push({ timeUtc: pass.setUtc, noradId: pass.noradId, kind: "set" });
  }
  const nowMs = now.getTime();
  return events
    .filter((e) => e.timeUtc.getTime() >= nowMs)
    .sort((a, b) => a.timeUtc.getTime() - b.timeUtc.getTime())
    .slice(0, max);
}
