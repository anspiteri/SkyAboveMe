import { assertEquals, assertObjectMatch } from "@std/assert";
import { fetchSatelliteData } from "../../src/services/satellite-data.ts";

/**
 * Exercises the client fetch service by stubbing `globalThis.fetch`, since the
 * service performs a real network request in normal operation.
 */

const REAL_FETCH = globalThis.fetch;

function setFetch(stub: typeof fetch): void {
  globalThis.fetch = stub;
}

function restoreFetch(): void {
  globalThis.fetch = REAL_FETCH;
}

const SAMPLE_PAYLOAD = [
  {
    noradId: 25544,
    name: "ISS (ZARYA)",
    label: "ISS",
    description: "The ISS.",
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
  },
];

Deno.test("fetchSatelliteData returns satellites on a well-formed response", async () => {
  setFetch(async () =>
    new Response(JSON.stringify(SAMPLE_PAYLOAD), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );

  const result = await fetchSatelliteData();
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.satellites.length, 1);
    const [sat] = result.satellites;
    assertObjectMatch(sat ?? {}, { noradId: 25544, label: "ISS" });
    assertEquals(sat?.elements.inclinationDeg, 51.6325);
  }
  restoreFetch();
});

Deno.test("fetchSatelliteData reports server on a non-2xx response", async () => {
  setFetch(async () => new Response("{}", { status: 502 }));
  const result = await fetchSatelliteData();
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "server");
  restoreFetch();
});

Deno.test("fetchSatelliteData reports network on a thrown fetch", async () => {
  setFetch(async () => {
    throw new TypeError("Network down");
  });
  const result = await fetchSatelliteData();
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "network");
  restoreFetch();
});

Deno.test("fetchSatelliteData reports malformed on a non-array body", async () => {
  setFetch(async () => new Response("{}", { status: 200 }));
  const result = await fetchSatelliteData();
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "malformed");
  restoreFetch();
});

Deno.test("fetchSatelliteData filters malformed records and keeps valid ones", async () => {
  const payload = [
    SAMPLE_PAYLOAD[0],
    { noradId: "not-a-number", elements: {} },
    null,
  ];
  setFetch(async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );

  const result = await fetchSatelliteData();
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.satellites.length, 1);
  restoreFetch();
});
