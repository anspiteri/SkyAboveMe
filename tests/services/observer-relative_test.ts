import { assertEquals, assertAlmostEquals, assert } from "jsr:@std/assert";
import {
  computeObserverRelativePositions,
  filterAboveHorizon,
  rankByVisibility,
  type ObserverRelativeResult,
} from "../../src/services/observer-relative.ts";
import { isAboveHorizon } from "../../src/domain/visibility.ts";
import type { Observer } from "../../src/domain/observer.ts";
import type { SatellitePosition } from "../../src/domain/satellite.ts";

const observer: Observer = {
  latitude: 51.5074,
  longitude: -0.1278,
  heightKm: 0,
  capturedAt: new Date("2026-08-27T12:44:14Z"),
  accuracyM: 10,
};

const positions: SatellitePosition[] = [
  {
    noradId: 25544,
    timestamp: new Date("2026-08-27T12:44:14Z"),
    position: { x: 4087.6377567, y: -5429.90075546, z: -0.00137795387528 },
    velocity: { x: 3.79, y: 2.87, z: 6.01 },
  },
];

Deno.test("computeObserverRelativePositions: returns one ok per position", () => {
  const results = computeObserverRelativePositions(observer, positions);
  assertEquals(results.length, 1);
  assertEquals(results[0]?.status, "ok");
  assertEquals(results[0]?.noradId, 25544);
});

Deno.test("computeObserverRelativePositions: elevation/azimuth within bounds", () => {
  const results = computeObserverRelativePositions(observer, positions);
  const first = results[0];
  assertEquals(first?.status, "ok");
  if (first?.status !== "ok") return;
  const { elevationDeg, azimuthDeg, rangeKm } = first.position;
  assert(elevationDeg >= -90 && elevationDeg <= 90);
  assert(azimuthDeg >= 0 && azimuthDeg < 360);
  assert(rangeKm > 0);
});

Deno.test("computeObserverRelativePositions: empty positions yields empty results", () => {
  assertEquals(computeObserverRelativePositions(observer, []).length, 0);
});

Deno.test("computeObserverRelativePositions: range is a plausible LEO distance", () => {
  const results = computeObserverRelativePositions(observer, positions);
  const first = results[0];
  if (first?.status !== "ok") throw new Error("expected ok");
  const { rangeKm } = first.position;
  assert(rangeKm > 1000 && rangeKm < 50000);
  assert(rangeKm > 6300);
});

Deno.test("computeObserverRelativePositions: work for two satellites", () => {
  const second: SatellitePosition = {
    noradId: 48274,
    timestamp: new Date("2026-08-27T12:44:14Z"),
    position: { x: -4000, y: 5000, z: 2000 },
    velocity: { x: 0, y: 0, z: 0 },
  };
  const results = computeObserverRelativePositions(observer, [
    ...positions,
    second,
  ]);
  assertEquals(results.length, 2);
  assertEquals(results[0]?.noradId, 25544);
  assertEquals(results[1]?.noradId, 48274);
  assertAlmostEquals(results[1]?.status === "ok" ? 1 : 0, 1);
});

Deno.test("isAboveHorizon: true only when elevation is strictly positive", () => {
  assertEquals(isAboveHorizon(0.1), true);
  assertEquals(isAboveHorizon(89.9), true);
  // Exactly at the horizon is not yet "above".
  assertEquals(isAboveHorizon(0), false);
  // Below the horizon.
  assertEquals(isAboveHorizon(-0.1), false);
  assertEquals(isAboveHorizon(-45), false);
  // The zenith is well above the horizon.
  assertEquals(isAboveHorizon(90), true);
});

Deno.test("filterAboveHorizon: keeps only ok satellites above the horizon", () => {
  const above: ObserverRelativeResult = {
    status: "ok",
    noradId: 1,
    position: { elevationDeg: 45, azimuthDeg: 90, rangeKm: 800 },
  };
  const atHorizon: ObserverRelativeResult = {
    status: "ok",
    noradId: 2,
    position: { elevationDeg: 0, azimuthDeg: 180, rangeKm: 1500 },
  };
  const below: ObserverRelativeResult = {
    status: "ok",
    noradId: 3,
    position: { elevationDeg: -12, azimuthDeg: 270, rangeKm: 2200 },
  };
  const skip: ObserverRelativeResult = {
    status: "skip",
    noradId: 4,
    reason: "decayed",
  };

  const filtered = filterAboveHorizon([above, atHorizon, below, skip]);
  assertEquals(filtered.length, 1);
  assertEquals(filtered[0]?.noradId, 1);
});

Deno.test("filterAboveHorizon: preserves input order and handles empty input", () => {
  const a: ObserverRelativeResult = {
    status: "ok",
    noradId: 10,
    position: { elevationDeg: 30, azimuthDeg: 0, rangeKm: 900 },
  };
  const b: ObserverRelativeResult = {
    status: "ok",
    noradId: 11,
    position: { elevationDeg: 5, azimuthDeg: 120, rangeKm: 1100 },
  };
  assertEquals(filterAboveHorizon([a, b]).map((r) => r.noradId), [10, 11]);
  assertEquals(filterAboveHorizon([]).length, 0);
});

Deno.test("rankByVisibility: ranks by elevation descending", () => {
  const low: ObserverRelativeResult = {
    status: "ok",
    noradId: 1,
    position: { elevationDeg: 12, azimuthDeg: 0, rangeKm: 2000 },
  };
  const high: ObserverRelativeResult = {
    status: "ok",
    noradId: 2,
    position: { elevationDeg: 71, azimuthDeg: 90, rangeKm: 800 },
  };
  const mid: ObserverRelativeResult = {
    status: "ok",
    noradId: 3,
    position: { elevationDeg: 45, azimuthDeg: 180, rangeKm: 1200 },
  };
  assertEquals(rankByVisibility([low, high, mid]).map((r) => r.noradId), [
    2,
    3,
    1,
  ]);
});

Deno.test("rankByVisibility: ties on elevation are broken by closer range first", () => {
  const a: ObserverRelativeResult = {
    status: "ok",
    noradId: 1,
    position: { elevationDeg: 40, azimuthDeg: 0, rangeKm: 1500 },
  };
  const b: ObserverRelativeResult = {
    status: "ok",
    noradId: 2,
    position: { elevationDeg: 40, azimuthDeg: 90, rangeKm: 1000 },
  };
  assertEquals(rankByVisibility([a, b]).map((r) => r.noradId), [2, 1]);
});

Deno.test("rankByVisibility: drops skips, keeps stability on full ties, empty ok", () => {
  const a: ObserverRelativeResult = {
    status: "ok",
    noradId: 1,
    position: { elevationDeg: 30, azimuthDeg: 0, rangeKm: 900 },
  };
  const b: ObserverRelativeResult = {
    status: "ok",
    noradId: 2,
    position: { elevationDeg: 30, azimuthDeg: 0, rangeKm: 900 },
  };
  const skip: ObserverRelativeResult = {
    status: "skip",
    noradId: 3,
    reason: "decayed",
  };
  const ranked = rankByVisibility([skip, a, b]);
  assertEquals(ranked.length, 2);
  // Same elevation + range → stable input order preserved, skip excluded.
  assertEquals(ranked.map((r) => r.noradId), [1, 2]);
  assertEquals(rankByVisibility([]).length, 0);
});
