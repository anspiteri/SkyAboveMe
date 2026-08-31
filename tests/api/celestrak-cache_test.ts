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

    assert(result, "expected satellites");
    assertEquals(result.length, 1);
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

    assert(result, "expected satellites");
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
    assert(again, "expected satellites on second call");
    assertEquals(again.length, CURATED_NORAD_IDS.length);
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

    assert(a, "expected satellites");
    assert(b, "expected satellites");
    // One shared batch only, even though two requests missed the cache.
    assertEquals(calls, CURATED_NORAD_IDS.length);
  } finally {
    afterEach();
  }
});

Deno.test("serves stale data when upstream fails", async () => {
  try {
    let t = 0;
    const cache = createMemoryCache<unknown>(() => t);
    const seeded: Satellite[] = [fakeSatellite(25544)];
    await cache.set("curated-satellites", seeded, 10 * 3600 * 1000);
    t = 7 * 3600 * 1000; // advance beyond the 6h freshness window

    const fetch = () => {
      throw new Error("CelesTrak unreachable");
    };

    const result = await fetchCuratedSatellites({
      cache,
      fetch,
      now: () => t,
      upstreamTtlMs: 6 * 3600 * 1000,
      ...FAST_DEPS,
    });

    assert(result, "expected stale satellites");
    assertEquals(result.length, 1);
    assertEquals(result[0]?.noradId, 25544);
  } finally {
    afterEach();
  }
});

Deno.test("returns null when there is no data and upstream fails", async () => {
  try {
    const t = 0;
    const cache = createMemoryCache<unknown>(() => t);
    const fetch = () => {
      throw new Error("CelesTrak unreachable");
    };

    const result = await fetchCuratedSatellites({
      cache,
      fetch,
      now: () => t,
      upstreamTtlMs: 6 * 3600 * 1000,
      ...FAST_DEPS,
    });

    assertEquals(result, null);
  } finally {
    afterEach();
  }
});

Deno.test("retries once on 429 then succeeds", async () => {
  try {
    const t = 0;
    const cache = createMemoryCache<unknown>(() => t);
    const perNorad: Record<number, number> = {};
    let calls = 0;

    const fetch = (_url: string | URL | Request) => {
      calls++;
      const norad =
        Number(new URL(String(_url)).searchParams.get("CATNR")) || 1;
      perNorad[norad] = (perNorad[norad] ?? 0) + 1;
      // First attempt is throttled, second succeeds.
      if (perNorad[norad] === 1) {
        return Promise.resolve(
          new Response("rate limited", { status: 429, headers: { "Retry-After": "0" } }),
        );
      }
      return Promise.resolve(ommResponse(norad));
    };

    const result = await fetchCuratedSatellites({
      cache,
      fetch,
      now: () => t,
      upstreamTtlMs: 6 * 3600 * 1000,
      ...FAST_DEPS,
    });

    assert(result, "expected satellites after retry");
    assertEquals(result.length, CURATED_NORAD_IDS.length);
    assertEquals(calls, CURATED_NORAD_IDS.length * 2);
  } finally {
    afterEach();
  }
});