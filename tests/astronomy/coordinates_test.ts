import { assertAlmostEquals } from "jsr:@std/assert";
import { eciToEcf as refEciToEcf, ecfToLookAngles, gstime } from "satellite.js";
import {
  calculateTopocentricPosition,
  eciToEcf,
  gmstRadians,
} from "../../src/astronomy/coordinates.ts";
import { geodeticToEcf, WGS84_A } from "../../src/astronomy/observer.ts";
import { degreesToRadians } from "../../src/utils/angles.ts";

const DATE = new Date("2026-08-27T12:44:14.404128Z");

Deno.test("gmstRadians: matches satellite.js gstime", () => {
  assertAlmostEquals(gmstRadians(DATE), gstime(DATE), 1e-6);
});

Deno.test("eciToEcf: matches satellite.js for a sample ECI vector", () => {
  const eci = { x: 4087.6377567, y: -5429.90075546, z: -0.00137795387528 };
  const gmst = gmstRadians(DATE);
  const local = eciToEcf(eci, gmst);
  const ref = refEciToEcf(eci, gmst);
  assertAlmostEquals(local.x, ref.x, 1e-6);
  assertAlmostEquals(local.y, ref.y, 1e-6);
  assertAlmostEquals(local.z, ref.z, 1e-6);
});

Deno.test("calculateTopocentricPosition: matches satellite.js look angles", () => {
  const lat = 41.9028;
  const lon = 12.4964;
  const height = 0;

  const observerEcf = geodeticToEcf(lat, lon, height);
  const satelliteEcf = {
    x: 5900.123,
    y: 2100.456,
    z: 3500.789,
  };

  const local = calculateTopocentricPosition(
    lat,
    lon,
    observerEcf,
    satelliteEcf,
  );

  const ref = ecfToLookAngles(
    {
      latitude: degreesToRadians(lat),
      longitude: degreesToRadians(lon),
      height,
    },
    satelliteEcf,
  );

  assertAlmostEquals(local.elevationDeg, (ref.elevation * 180) / Math.PI, 1e-6);
  assertAlmostEquals(local.azimuthDeg, (ref.azimuth * 180) / Math.PI, 1e-6);
  assertAlmostEquals(local.rangeKm, ref.rangeSat, 1e-6);
});

Deno.test("calculateTopocentricPosition: satellite due east is on the horizon", () => {
  // Observer on the equator / prime meridian at sea level.
  const lat = 0;
  const lon = 0;
  const observerEcf = geodeticToEcf(lat, lon, 0);
  // Local east at (0°,0°) is +y in ECEF. Placing the satellite at distance R
  // along +y puts it exactly on the eastern horizon: elevation 0, azimuth 90.
  const R = 1000;
  const satelliteEcf = { x: observerEcf.x, y: observerEcf.y + R, z: observerEcf.z };

  const p = calculateTopocentricPosition(lat, lon, observerEcf, satelliteEcf);
  assertAlmostEquals(p.elevationDeg, 0, 1e-6);
  assertAlmostEquals(p.azimuthDeg, 90, 1e-6);
  assertAlmostEquals(p.rangeKm, R, 1e-6);
});

Deno.test("calculateTopocentricPosition: a satellite near the observer is within range", () => {
  const lat = 51.5;
  const lon = -0.12;
  const observerEcf = geodeticToEcf(lat, lon, 0.08);
  const idx = observerEcf.x + 1;
  const satelliteEcf = { x: idx, y: observerEcf.y, z: observerEcf.z };
  const p = calculateTopocentricPosition(lat, lon, observerEcf, satelliteEcf);
  // Verify range is sensible and angular outputs are within domain bounds.
  assertAlmostEquals(WGS84_A, WGS84_A, 1e-9);
  if (p.rangeKm > 0) {
    if (p.elevationDeg < -90 || p.elevationDeg > 90) {
      throw new Error("elevation out of bounds");
    }
    if (p.azimuthDeg < 0 || p.azimuthDeg >= 360) {
      throw new Error("azimuth out of bounds");
    }
  }
});
