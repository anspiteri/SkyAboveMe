import { assertEquals } from "@std/assert";
import {
  buildManualObserver,
  isPlausibleLatitude,
  isPlausibleLongitude,
  parseCoordinate,
  resolveManualLocation,
} from "../../src/domain/location.ts";
import { findCity } from "../../src/data/cities.ts";

Deno.test("buildManualObserver accepts finite, in-range WGS-84 coordinates", () => {
  const at = new Date(1_700_000_000_000);
  const observer = buildManualObserver(51.5, -0.12, at);
  assertEquals(observer, {
    latitude: 51.5,
    longitude: -0.12,
    heightKm: 0,
    capturedAt: at,
    accuracyM: null,
  });
});

Deno.test("buildManualObserver rejects invalid inputs", () => {
  const at = new Date(0);
  const bad: Array<[unknown, unknown]> = [
    ["51", "-0.1"],
    [NaN, -0.1],
    [Infinity, -0.1],
    [91, 0],
    [-91, 0],
    [0, 181],
    [0, -181],
    [undefined, 0],
  ];
  for (const [lat, lon] of bad) {
    assertEquals(buildManualObserver(lat, lon, at), null);
  }
});

Deno.test("resolveManualLocation resolves a known city to coarse coordinates", () => {
  const at = new Date(0);
  const observer = resolveManualLocation({ kind: "city", name: "London" }, at);
  assertEquals(observer?.latitude, 51.5074);
  assertEquals(observer?.accuracyM, null);
});

Deno.test("resolveManualLocation returns null for an unknown city", () => {
  assertEquals(
    resolveManualLocation({ kind: "city", name: "Atlantis" }, new Date(0)),
    null,
  );
});

Deno.test("resolveManualLocation resolves typed coordinates", () => {
  const at = new Date(0);
  const observer = resolveManualLocation(
    { kind: "coordinates", latitude: 40.71, longitude: -74.0 },
    at,
  );
  assertEquals(observer?.latitude, 40.71);
  assertEquals(observer?.longitude, -74.0);
});

Deno.test("findCity matches case-insensitively", () => {
  assertEquals(findCity("LONDON")?.name, "London");
  assertEquals(findCity("são paulo")?.name, "São Paulo");
  assertEquals(findCity("nowhere"), null);
});

Deno.test("coordinate plausibility mirrors buildManualObserver bounds", () => {
  assertEquals(isPlausibleLatitude("51.5"), true);
  assertEquals(isPlausibleLatitude("91"), false);
  assertEquals(isPlausibleLatitude("abc"), false);
  assertEquals(isPlausibleLongitude("-0.12"), true);
  assertEquals(isPlausibleLongitude("-181"), false);
  assertEquals(parseCoordinate("40.5"), 40.5);
  assertEquals(parseCoordinate("nope"), null);
});
