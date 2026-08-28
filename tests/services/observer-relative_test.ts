import { assertEquals, assertAlmostEquals, assert } from "jsr:@std/assert";
import { computeObserverRelativePositions } from "../../src/services/observer-relative.ts";
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
