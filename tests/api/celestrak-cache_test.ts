import { assertEquals, assert } from "@std/assert";
import {
  fetchCuratedSatellites,
  _resetInflightForTests,
} from "../../api/satellites.ts";
import { createMemoryCache } from "../../api/cache.ts";
import type { Satellite } from "../../src/domain/satellite.ts";
import { CURATED_NORAD_IDS } from "../../src/data/curated-catalog.ts";

/**
 * Unit tests for the CelesTrak proxy's cache / coalescing / backoff behaviour.
 *
 * These run with heavy clock control and a stubbed upstream so they are
 * deterministic and NEVER contact CelesTrak (that live check lives in
 * tests/api/satellites.live.ts, run explicitly via `deno task test:live`).
 */

function fakeSatellite(noradId: number): Satellite {
  return {
    noradId,
    name: `Sat ${noradId}`,
    label: `S${noradId}`,
    description: null,
    elements: {
      epoch: "2026-01-01T00:00:00.000Z",
      meanMotionRevPerDay: 15.5,
      eccentricity: 0.001,
      inclinationDeg: 51.6,
      raOfAscNodeDeg: 10,
      argOfPericenterDeg: 20,
      meanAnomalyDeg: 30,
      bstar: 0.0001,
      meanMotionDot: 0.0,
      meanMotionDdot: 0.0,
    },
  };
}

function ommResponse(noradId: number): Response {
  return new Response(JSON.stringify([
    {
      OBJECT_NAME: `Sat ${noradId}`,
      OBJECT_ID: `2020-000${noradId}`,
      EPOCH: "2026-01-01T00:00:00.000Z",
      MEAN_MOTION: "15.5",
      ECCENTRICITY: "0.0010",
      INCLINATION: "51.6",
      RA_OF_ASC_NODE: "10",
      ARG_OF_PERICENTER: "20",
      MEAN_ANOMALY: "30",
      NORAD_CAT_ID: String(noradId),
      BSTAR: "0.0001",
    },
  ]), { status: 200 });
}

const FAST_DEPS = {
  rateLimitIntervalMs: 0,
  concurrency: CURATED_NORAD_IDS.length,
};

function failFetch() {
  return (_url: string | URL | Request) =>
    Promise.reject(new Error("CelesTrak unreachable"));
}

function afterEach(): void {
  _resetInflightForTests();
}

Deno.test("serves fresh cached data without touching upstream", async () => {
  try {
    const t = 0;
    const cache = createMemoryCache<unknown>(() => t);
    const seeded: Satellite[] = [fakeSatellite(25544)];
    await cache.set("curated-satellites", seeded, 10 * 3600 * 1000);

    let calls = 0;
    const fetch = () => {
      calls++;
      return Promise.resolve(ommResponse(1));
    };

    const result = await fetchCuratedSatellites({
      cache,
      fetch,
      now: () => t,
      upstreamTtlMs: 6 * 3600 * 1000,
      ...FAST_DEPS,
    });

    assert(result);
    assertEquals(result.satellites.length, 1);
    assertEquals(result.source, "cache");
    assertEquals(result.stale, false);
    assertEquals(calls, 0);
  } finally {
    afterEach();
  }
});

Deno.test("populates the cache on a cold miss", async () => {
  try {
    const t = 0;
    const cache = createMemoryCache<unknown>(() => t);
    let calls = 0;
    const fetch = () => {
      calls++;
      return Promise.resolve(ommResponse(calls));
    };

    const result = await fetchCuratedSatellites({
      cache,
      fetch,
      now: () => t,
      upstreamTtlMs: 6 * 3600 * 1000,
      ...FAST_DEPS,
    });

    assert(result);
    assertEquals(result.source, "celestrak");
    assertEquals(result.stale, false);
    assertEquals(calls, CURATED_NORAD_IDS.length);

    // A second call must now be served entirely from cache.
    const before = calls;
    const again = await fetchCuratedSatellites({
      cache,
      fetch,
      now: () => t,
      upstreamTtlMs: 6 * 3600 * 1000,
      ...FAST_DEPS,
    });
    assert(again);
    assertEquals(again.source, "cache");
    assertEquals(again.satellites.length, CURATED_NORAD_IDS.length);
    assertEquals(calls, before);
  } finally {
    afterEach();
  }
});

Deno.test("coalesces concurrent misses into one upstream batch", async () => {
  try {
    const t = 0;
    const cache = createMemoryCache<unknown>(() => t);
    let calls = 0;

    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetch = () => {
      calls++;
      return gate.then(() => ommResponse(calls));
    };

    const deps = {
      cache,
      fetch,
      now: () => t,
      upstreamTtlMs: 6 * 3600 * 1000,
      concurrency: 2,
      rateLimitIntervalMs: 0,
    };

    const first = fetchCuratedSatellites(deps);
    const second = fetchCuratedSatellites(deps);
    release();
    const [a, b] = await Promise.all([first, second]);

    assert(a);
    assert(b);
    assertEquals(a.source, "celestrak");
    assertEquals(b.source, "celestrak");
    // One shared batch only, even though two requests missed the cache.
    assertEquals(calls, CURATED_NORAD_IDS.length);
  } finally {
    afterEach();
  }
});

Deno.test("serves stale cached data when upstream fails", async () => {
  try {
    let t = 0;
    const cache = createMemoryCache<unknown>(() => t);
    const seeded: Satellite[] = [fakeSatellite(25544)];
    await cache.set("curated-satellites", seeded, 10 * 3600 * 1000);
    t = 7 * 3600 * 1000; // advance beyond the 6h freshness window

    const result = await fetchCuratedSatellites({
      cache,
      fetch: failFetch(),
      now: () => t,
      upstreamTtlMs: 6 * 3600 * 1000,
      ...FAST_DEPS,
    });

    assert(result);
    assertEquals(result.source, "cache");
    assertEquals(result.stale, true);
    assertEquals(result.satellites.length, 1);
    assertEquals(result.satellites[0]?.noradId, 25544);
  } finally {
    afterEach();
  }
});

Deno.test("serves bundled snapshot fallback when there is no data and upstream fails", async () => {
  try {
    const t = 0;
    const cache = createMemoryCache<unknown>(() => t);

    const result = await fetchCuratedSatellites({
      cache,
      fetch: failFetch(),
      now: () => t,
      upstreamTtlMs: 6 * 3600 * 1000,
      ...FAST_DEPS,
    });

    assert(result);
    assertEquals(result.source, "fallback");
    assertEquals(result.stale, true);
    assert(result.satellites.length > 0, "expected a non-empty snapshot");
    // The snapshot is one curated entry per NORAD ID.
    assertEquals(result.satellites.length, CURATED_NORAD_IDS.length);
  } finally {
    afterEach();
  }
});

Deno.test("stops on 429 without retrying (per CelesTrak policy)", async () => {
  try {
    const t = 0;
    const cache = createMemoryCache<unknown>(() => t);
    let calls = 0;
    const fetch = () => {
      calls++;
      return Promise.resolve(
        new Response("rate limited", { status: 429, headers: { "Retry-After": "0" } }),
      );
    };

    const result = await fetchCuratedSatellites({
      cache,
      fetch,
      now: () => t,
      upstreamTtlMs: 6 * 3600 * 1000,
      ...FAST_DEPS,
    });

    assert(result);
    // No upstream data; fall back to the snapshot.
    assertEquals(result.source, "fallback");
    // Exactly one attempt per satellite — no retry on 429.
    assertEquals(calls, CURATED_NORAD_IDS.length);
  } finally {
    afterEach();
  }
});

Deno.test("opens the circuit breaker after consecutive failed refreshes", async () => {
  try {
    // Use a fixed future timestamp so breaker cooldowns with cooldownMs=0 still
    // behave deterministically.
    const T0 = 1_000_000_000;
    const t = T0;
    const cache = createMemoryCache<unknown>(() => t);
    const deps = {
      cache,
      fetch: failFetch(),
      now: () => t,
      upstreamTtlMs: 6 * 3600 * 1000,
      cooldownMs: 0,
      breakerFailureThreshold: 2,
      ...FAST_DEPS,
    };

    // First failure: recorded, stays below threshold (cooldown 0 so not open).
    const one = await fetchCuratedSatellites(deps);
    assert(one);
    assertEquals(one.source, "fallback");

    const breakerAfterOne = await cache.get("celestrak-breaker");
    const stateOne = breakerAfterOne?.value as { openUntil: number; failures: number };
    assertEquals(stateOne.failures, 1);
    assertEquals(stateOne.openUntil, 0);

    // Second consecutive failure: trips the breaker open.
    const two = await fetchCuratedSatellites(deps);
    assert(two);
    assertEquals(two.source, "fallback");

    const breakerAfterTwo = await cache.get("celestrak-breaker");
    const stateTwo = breakerAfterTwo?.value as { openUntil: number; failures: number };
    assertEquals(stateTwo.failures, 0);
    assert(stateTwo.openUntil > T0, "breaker should be open");

    // While the breaker is open, upstream is NOT contacted at all.
    let upstreamCalls = 0;
    const spyFetch = () => {
      upstreamCalls++;
      return Promise.resolve(ommResponse(1));
    };
    const results = await Promise.all([
      fetchCuratedSatellites({ ...deps, fetch: spyFetch }),
      fetchCuratedSatellites({ ...deps, fetch: spyFetch }),
    ]);
    assert(results[0]);
    assert(results[1]);
    assertEquals(upstreamCalls, 0, "breaker open must not touch upstream");
  } finally {
    afterEach();
  }
});

Deno.test("does not retry on 5xx (per CelesTrak policy)", async () => {
  try {
    const t = 0;
    const cache = createMemoryCache<unknown>(() => t);
    let calls = 0;
    const fetch = () => {
      calls++;
      return Promise.resolve(
        new Response("server error", { status: 503 }),
      );
    };

    const result = await fetchCuratedSatellites({
      cache,
      fetch,
      now: () => t,
      upstreamTtlMs: 6 * 3600 * 1000,
      ...FAST_DEPS,
    });

    assert(result);
    assertEquals(result.source, "fallback");
    // One attempt per satellite, no retry on 5xx.
    assertEquals(calls, CURATED_NORAD_IDS.length);
  } finally {
    afterEach();
  }
});