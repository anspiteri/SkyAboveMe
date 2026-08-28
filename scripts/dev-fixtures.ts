/**
 * Static satellite fixtures for offline development.
 *
 * CelesTrak is occasionally unreachable, which makes the live `/api/satellites`
 * proxy return nothing and the app show only outage banners — hard to develop
 * against. This module provides a ready-made, deterministic set of domain
 * `Satellite` objects with the exact same shape the browser validator expects
 * (`fetchSatelliteData` → `parseSatelliteList`), so the mock proxy can serve it
 * directly and the app renders a full sky with no network access.
 *
 * IMPORTANT (AGENTS.md §13): these are DEVELOPMENT FIXTURES, not live data. The
 * orbital elements are realistic but frozen historical examples — fine for
 * building/testing the UI, never a substitute for real CelesTrak data in
 * production. The curated label/description metadata is reused from
 * `src/data/curated-catalog.ts` so the mock looks and behaves like the real app.
 */

import { CURATED_CATALOG } from "../src/data/curated-catalog.ts";
import type { Satellite } from "../src/domain/satellite.ts";

/** A shared, plausible epoch so all fixtures propagate sensibly. */
const EPOCH = "2026-08-27T12:00:00.000000";

interface OrbitTemplate {
  meanMotionRevPerDay: number;
  eccentricity: number;
  inclinationDeg: number;
  raOfAscNodeDeg: number;
  argOfPericenterDeg: number;
  meanAnomalyDeg: number;
}

/**
 * Physically plausible elements per satellite, keyed by NORAD ID. Values are
 * representative of each object's real orbit (LEO periods, sun-sync
 * inclinations for the weather/EO birds); they are fixtures, not live TLEs.
 */
const ORBITS: Record<number, OrbitTemplate> = {
  25544: { meanMotionRevPerDay: 15.4966, eccentricity: 0.000772, inclinationDeg: 51.6325, raOfAscNodeDeg: 306.9725, argOfPericenterDeg: 89.1136, meanAnomalyDeg: 271.0737 }, // ISS
  48274: { meanMotionRevPerDay: 15.5720, eccentricity: 0.000950, inclinationDeg: 41.4700, raOfAscNodeDeg: 12.0000, argOfPericenterDeg: 2.5000, meanAnomalyDeg: 340.0000 }, // Tiangong
  20580: { meanMotionRevPerDay: 15.0840, eccentricity: 0.000260, inclinationDeg: 28.4700, raOfAscNodeDeg: 194.0000, argOfPericenterDeg: 80.0000, meanAnomalyDeg: 250.0000 }, // Hubble
  25994: { meanMotionRevPerDay: 14.5711, eccentricity: 0.000150, inclinationDeg: 98.2080, raOfAscNodeDeg: 295.0000, argOfPericenterDeg: 90.0000, meanAnomalyDeg: 120.0000 }, // Terra
  27424: { meanMotionRevPerDay: 14.5712, eccentricity: 0.000100, inclinationDeg: 98.2000, raOfAscNodeDeg: 295.5000, argOfPericenterDeg: 88.0000, meanAnomalyDeg: 200.0000 }, // Aqua
  27386: { meanMotionRevPerDay: 14.3150, eccentricity: 0.002000, inclinationDeg: 98.3000, raOfAscNodeDeg: 80.0000, argOfPericenterDeg: 90.0000, meanAnomalyDeg: 90.0000 }, // Envisat
  43013: { meanMotionRevPerDay: 14.1950, eccentricity: 0.000120, inclinationDeg: 98.7000, raOfAscNodeDeg: 4.0000, argOfPericenterDeg: 90.0000, meanAnomalyDeg: 300.0000 }, // NOAA-20
  33591: { meanMotionRevPerDay: 14.1650, eccentricity: 0.001100, inclinationDeg: 98.7300, raOfAscNodeDeg: 210.0000, argOfPericenterDeg: 0.0000, meanAnomalyDeg: 150.0000 }, // NOAA-19
  37849: { meanMotionRevPerDay: 14.1950, eccentricity: 0.000150, inclinationDeg: 98.7000, raOfAscNodeDeg: 255.0000, argOfPericenterDeg: 0.0000, meanAnomalyDeg: 260.0000 }, // Suomi NPP
  39084: { meanMotionRevPerDay: 14.5712, eccentricity: 0.000110, inclinationDeg: 98.2200, raOfAscNodeDeg: 145.0000, argOfPericenterDeg: 90.0000, meanAnomalyDeg: 30.0000 }, // Landsat 8
  49260: { meanMotionRevPerDay: 14.5712, eccentricity: 0.000100, inclinationDeg: 98.2200, raOfAscNodeDeg: 148.0000, argOfPericenterDeg: 90.0000, meanAnomalyDeg: 310.0000 }, // Landsat 9
  38771: { meanMotionRevPerDay: 14.2000, eccentricity: 0.000900, inclinationDeg: 98.7000, raOfAscNodeDeg: 20.0000, argOfPericenterDeg: 90.0000, meanAnomalyDeg: 180.0000 }, // MetOp-B
};

/** The fixture catalogue: one domain Satellite per curated entry. */
export const MOCK_SATELLITES: Satellite[] = CURATED_CATALOG.map((curated) => {
  const orbit = ORBITS[curated.noradId];
  if (orbit === undefined) {
    throw new Error(`Missing orbit template for NORAD ${curated.noradId}`);
  }
  return {
    noradId: curated.noradId,
    name: curated.description.split("—")[0]?.trim() ?? curated.label,
    label: curated.label,
    description: curated.description,
    elements: {
      epoch: EPOCH,
      meanMotionRevPerDay: orbit.meanMotionRevPerDay,
      eccentricity: orbit.eccentricity,
      inclinationDeg: orbit.inclinationDeg,
      raOfAscNodeDeg: orbit.raOfAscNodeDeg,
      argOfPericenterDeg: orbit.argOfPericenterDeg,
      meanAnomalyDeg: orbit.meanAnomalyDeg,
      bstar: 2.0e-4,
      meanMotionDot: 8.0e-5,
      meanMotionDdot: 0,
    },
  };
});
