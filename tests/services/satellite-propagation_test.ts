import { assertEquals } from "@std/assert";
import {
  buildOmm,
  buildSatRec,
  propagateSatellite,
  propagateSatellites,
  type PropagateResult,
} from "../../src/services/satellite-propagation.ts";
import type { Satellite } from "../../src/domain/satellite.ts";

/** The curated ISS (ZARYA, NORAD 25544) as a domain satellite for tests. */
const ISS: Satellite = {
  noradId: 25544,
  name: "ISS (ZARYA)",
  label: "ISS",
  description: "The International Space Station.",
  elements: {
    epoch: "2026-08-27T12:44:14.404128",
    meanMotionRevPerDay: 15.49656235,
    eccentricity: 0.000772,
    inclinationDeg: 51.6325,
    raOfAscNodeDeg: 306.9725,
    argOfPericenterDeg: 89.1136,
    meanAnomalyDeg: 271.0737,
    bstar: 1.6667e-4,
    meanMotionDot: 8.959e-5,
    meanMotionDdot: 0,
  },
};

Deno.test("buildOmm reconstructs the OMM shape SGP4 expects", () => {
  const omm = buildOmm(ISS);
  assertEquals(omm.NORAD_CAT_ID, 25544);
  assertEquals(omm.EPOCH, "2026-08-27T12:44:14.404128");
  assertEquals(omm.MEAN_MOTION, 15.49656235);
  assertEquals(omm.INCLINATION, 51.6325);
});

Deno.test("buildSatRec returns a usable SGP4 structure", () => {
  const satrec = buildSatRec(ISS);
  assertEquals(satrec === null, false);
  if (satrec !== null) {
    // Sanity: the structure carries the catalogue number used as its id.
    assertEquals(satrec.satnum, "25544");
  }
});

Deno.test("propagateSatellite returns the expected ECI position at the epoch", () => {
  const result = propagateSatellite(
    ISS,
    new Date("2026-08-27T12:44:14.404128Z"),
  );

  assertEquals(result.status, "ok");
  if (result.status !== "ok") return;

  const { position, velocity } = result.position;
  // Pinned SGP4 regression reference (satellite.js, WGS72). Across the
  // library these are stable; the tolerance guards against minor rounding.
  assertEquals(round(position.x, 3), 4087.638);
  assertEquals(round(position.y, 3), -5429.901);
  assertEquals(round(position.z, 3), -0.001);

  assertEquals(round(velocity.x, 3), 3.79);
  assertEquals(result.position.timestamp.toISOString(), "2026-08-27T12:44:14.404Z");
  assertEquals(result.position.noradId, 25544);
});

Deno.test("propagateSatellite yields a low-Earth-orbit range", () => {
  const result = propagateSatellite(
    ISS,
    new Date("2026-08-27T13:00:00.000Z"),
  );
  assertEquals(result.status, "ok");
  if (result.status !== "ok") return;
  const { position } = result.position;
  const mag = Math.hypot(position.x, position.y, position.z);
  // LEO altitudes sit well inside a 6800 km geocentric radius; a non-zero
  // value near Earth's radius confirms a physically sensible result.
  assertEquals(mag > 6500 && mag < 8000, true);
});

Deno.test("propagateSatellite is deterministic for the same elements and time", () => {
  const date = new Date("2026-08-27T13:00:00.000Z");
  const a = propagateSatellite(ISS, date);
  const b = propagateSatellite(ISS, date);
  assertEquals(a, b);
});

Deno.test("propagateSatellite skips unusable elements instead of throwing", () => {
  const broken: Satellite = {
    ...ISS,
    noradId: 99999,
    elements: {
      ...ISS.elements,
      // Eccentricity >= 1 is out of range for SGP4.
      eccentricity: 1.2,
    },
  };

  const result = propagateSatellite(broken, new Date("2026-08-27T13:00:00.000Z"));
  assertEquals(result.status, "skip");
  if (result.status === "skip") {
    assertEquals(result.noradId, 99999);
    assertEquals(typeof result.reason, "string");
  }
});

Deno.test("propagateSatellites returns one result per satellite", () => {
  const broken: Satellite = {
    ...ISS,
    noradId: 1,
    label: "Broken",
    elements: { ...ISS.elements, eccentricity: 2 },
  };
  const results = propagateSatellites(
    [ISS, broken],
    new Date("2026-08-27T13:00:00.000Z"),
  );
  assertEquals(results.length, 2);
  const ok = results.filter((r) => r.status === "ok") as Extract<
    PropagateResult,
    { status: "ok" }
  >[];
  const skipped = results.filter((r) => r.status === "skip");
  assertEquals(ok.length, 1);
  assertEquals(ok[0]?.position.noradId, 25544);
  assertEquals(skipped.length, 1);
});

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
