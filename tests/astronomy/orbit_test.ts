import { assertEquals, assertAlmostEquals } from "@std/assert";
import {
  altitudeKm,
  orbitalPeriodMinutes,
} from "../../src/astronomy/orbit.ts";
import { WGS84_A } from "../../src/astronomy/observer.ts";

Deno.test("orbitalPeriodMinutes: from mean motion", () => {
  // LEO ~15.5 rev/day → ~93 minutes, matching a typical ISS period.
  assertEquals(orbitalPeriodMinutes(15.49656235).toFixed(1), "92.9");
  // GEO ~1 rev/day → 1440 minutes.
  assertEquals(orbitalPeriodMinutes(1), 1440);
});

Deno.test("orbitalPeriodMinutes: guards nonsensical input", () => {
  assertEquals(orbitalPeriodMinutes(0), 0);
  assertEquals(orbitalPeriodMinutes(-2), 0);
  assertEquals(orbitalPeriodMinutes(Number.NaN), 0);
});

Deno.test("altitudeKm: mean-radius reference", () => {
  // A position exactly one mean Earth radius away is on the ground.
  assertEquals(altitudeKm({ x: WGS84_A, y: 0, z: 0 }), 0);
  // ISS ~420 km above the surface.
  const r = 420 + WGS84_A;
  const alt = altitudeKm({ x: r, y: 0, z: 0 });
  assertAlmostEquals(alt, 420, 1e-6);
});

Deno.test("altitudeKm: guards nonsensical input", () => {
  assertEquals(altitudeKm({ x: Number.NaN, y: 0, z: 0 }), 0);
});
