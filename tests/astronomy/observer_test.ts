import { assertEquals, assertAlmostEquals } from "jsr:@std/assert";
import { geodeticToEcf } from "satellite.js";
import {
  geodeticToEcf as localGeodeticToEcf,
  WGS84_A,
  WGS84_E2,
} from "../../src/astronomy/observer.ts";
import { degreesToRadians } from "../../src/utils/angles.ts";

Deno.test("geodeticToEcf: equator, prime meridian, sea level", () => {
  const p = localGeodeticToEcf(0, 0, 0);
  assertAlmostEquals(p.x, WGS84_A, 1e-6);
  assertAlmostEquals(p.y, 0, 1e-6);
  assertAlmostEquals(p.z, 0, 1e-6);
});

Deno.test("geodeticToEcf: equator, 90°E, sea level", () => {
  const p = localGeodeticToEcf(0, 90, 0);
  assertAlmostEquals(p.x, 0, 1e-6);
  assertAlmostEquals(p.y, WGS84_A, 1e-6);
  assertAlmostEquals(p.z, 0, 1e-6);
});

Deno.test("geodeticToEcf: north pole sits on the polar axis", () => {
  const p = localGeodeticToEcf(90, 0, 0);
  assertAlmostEquals(p.x, 0, 1e-6);
  assertAlmostEquals(p.y, 0, 1e-6);
  // At the pole N = a, so z = a·√(1 − e²) = a(1 − f). Check the polar radius.
  const expectedZ = WGS84_A * Math.sqrt(1 - WGS84_E2);
  assertAlmostEquals(p.z, expectedZ, 1e-6);
});

Deno.test("geodeticToEcf: matches satellite.js for a real observer", () => {
  const lat = 41.9028;
  const lon = 12.4964;
  const h = 0.15;
  const local = localGeodeticToEcf(lat, lon, h);
  // satellite.js's geodeticToEcf expects latitude/longitude in radians.
  const ref = geodeticToEcf({
    latitude: degreesToRadians(lat),
    longitude: degreesToRadians(lon),
    height: h,
  });
  assertAlmostEquals(local.x, ref.x, 1e-6);
  assertAlmostEquals(local.y, ref.y, 1e-6);
  assertAlmostEquals(local.z, ref.z, 1e-6);
});

Deno.test("geodeticToEcf: height raises the point radially off the surface", () => {
  const p0 = localGeodeticToEcf(10, 20, 0);
  const p1 = localGeodeticToEcf(10, 20, 50);
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dz = p1.z - p0.z;
  assertEquals(true, Math.hypot(dx, dy, dz) > 49.5);
});
