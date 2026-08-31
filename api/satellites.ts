import { getCuratedSatellite, CURATED_NORAD_IDS } from "../src/data/curated-catalog.ts";
import { parseOmmRecord } from "../src/services/parse-omm.ts";
import type { Satellite } from "../src/domain/satellite.ts";
import { openSatelliteCache, type Cache } from "./cache.ts";

/**
 * Serverless function that proxies public satellite orbital data.
 *
 * The browser cannot always call CelesTrak directly (CORS, rate limits), so
 * this function fetches the curated satellites on the user's behalf and returns
 * ready-to-use domain `Satellite[]` objects.
 *
 * It is stateless and receives NO user location: the observer's precise
 * coordinates never leave the browser (AGENTS.md §4, §20).
 *
 * CelesTrak throttles/blocks a client IP after a burst of requests (which
 * surfaces as a hang that looks like an outage). Orbital elements only change
 * ~once a day, and the *real-time* part of tracking — the SGP4 propagation of
 * those elements against the current clock — happens client-side per render and
 * is never cached. So this proxy caches the upstream element set for a few
 * hours (where "fresh" is derived from `storedAt`, not the cache expiry),
 * coalesces concurrent misses, rate-limits and backs off on the way up, and
 * falls back to stale data when CelesTrak is throttled — keeping us far below
 * the per-IP request limit without sacrificing live positions.
 */

const CELESTRAK_BASE = "https://celestrak.org/NORAD/elements/gp.php";
/** Requests made to CelesTrak concurrently, to stay polite to the service. */
const CONCURRENCY = 2;
/** Hard cap on total proxy time so an outage fails fast instead of ~24 s. */
const HANDLER_DEADLINE_MS = 5_000;
/** How fresh cached orbital elements must be to avoid an upstream fetch. */
const UPSTREAM_TTL_MS = 6 * 60 * 60 * 1000; // 6 h
/** Hard expiry for cached entries: long enough to still serve stale data. */
const KEEP_FOR_MS = 10 * 60 * 60 * 1000; // 10 h
/** Minimum spacing between successive upstream requests (polite pacing). */
const RATE_LIMIT_INTERVAL_MS = 250;
/** Jittered backoff base for across-the-line errors (429/5xx). */
const BACKOFF_BASE_MS = 300;
/** How long an in-flight ("coalesced") share of an upstream fetch is valid. */
const CACHE_KEY = "curated-satellites";
const INFLIGHT_MAX_AGE_MS = HANDLER_DEADLINE_MS;

type UpstreamParseFn = (
  noradId: number,
  records: unknown[],
) => Satellite | null;

export interface SatelliteFetchDeps {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  cache?: Cache<unknown>;
  concurrency?: number;
  upstreamTtlMs?: number;
  keepForMs?: number;
  rateLimitIntervalMs?: number;
  handlerDeadlineMs?: number;
  /** Override the upstream CelesTrak URL (tests). */
  baseUrl?: string;
  /** Override how an OMM array becomes a Satellite (tests). */
  enrich?: UpstreamParseFn;
}

interface InFlight {
  promise: Promise<Satellite[] | null>;
  startedAt: number;
}

/** Module-level coalescing: concurrent misses share one upstream fetch. */
let inflight: InFlight | null = null;

/** Process-wide lazy cache handle, reused across requests (avoid re-opening
 * Deno KV per request). Falls back to memory when KV is unavailable. */
let sharedCachePromise: Promise<Cache<unknown>> | null = null;
function getSharedCache(): Promise<Cache<unknown>> {
  sharedCachePromise ??= openSatelliteCache();
  return sharedCachePromise;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const cache = await getSharedCache();
    const satellites = await fetchCuratedSatellites({ cache });
    if (satellites === null) {
      return jsonResponse({ error: "Failed to retrieve satellite data" }, 502);
    }
    return jsonResponse(satellites, 200, {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
    });
  } catch (error) {
    console.error("Failed to retrieve satellite data", error);
    return jsonResponse({ error: "Failed to retrieve satellite data" }, 502);
  }
}

/**
 * Resolve the curated satellite set, serving from cache when fresh and falling
 * back to stale cache or a fresh upstream fetch when needed.
 *
 * Returns the satellites to serve, or `null` when no data can be produced.
 */
export async function fetchCuratedSatellites(
  deps: SatelliteFetchDeps = {},
): Promise<Satellite[] | null> {
  const now = deps.now ?? Date.now;
  const ttlMs = deps.upstreamTtlMs ?? UPSTREAM_TTL_MS;
  const cache = deps.cache ?? await getSharedCache();

  // Coalesce: if another request is already fetching upstream, share it.
  if (inflight && now() - inflight.startedAt < INFLIGHT_MAX_AGE_MS) {
    return inflight.promise;
  }

  // 1. Try a fresh read from cache.
  const entry = await cache.get(CACHE_KEY);
  if (entry && now() - entry.storedAt < ttlMs) {
    return entry.value as Satellite[];
  }
  // 2. Cache exists but is stale (or absent): try to refresh; on upstream
  //    failure, fall back to stale data when there's any.
  const fresh = await tryRefresh(entry?.value as Satellite[] | undefined, deps);
  if (fresh !== null) return fresh;
  if (entry) return entry.value as Satellite[];
  return null;
}

/** Attempt an upstream fetch; on throttling/errors, serve stale if provided. */
async function tryRefresh(
  stale: Satellite[] | undefined,
  deps: SatelliteFetchDeps,
): Promise<Satellite[] | null> {
  const now = deps.now ?? Date.now;
  const keepForMs = deps.keepForMs ?? KEEP_FOR_MS;
  const cache = deps.cache;
  const deadlineMs = deps.handlerDeadlineMs ?? HANDLER_DEADLINE_MS;

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), deadlineMs);
  let result: Satellite[] | null;
  let fetchError: unknown;

  // Coalesce: if another request is already fetching upstream, share it. This
  // check must happen *after* the cache miss (concurrent misses both reach here
  // before either has started fetching), so a burst of misses triggers only one
  // upstream batch.
  if (inflight && now() - inflight.startedAt < INFLIGHT_MAX_AGE_MS) {
    return inflight.promise;
  }

  const promise = runUpstream(deps, controller.signal);
  inflight = { promise, startedAt: now() };
  try {
    result = await promise;
  } catch (error) {
    fetchError = error;
    result = null;
  } finally {
    inflight = null;
    clearTimeout(deadline);
  }

  if (result !== null && result.length > 0) {
    if (cache) await cache.set(CACHE_KEY, result, keepForMs);
    return result;
  }

  if (stale && stale.length > 0) {
    console.warn(
      "CelesTrak fetch failed; serving stale satellite data",
      fetchError,
    );
    return stale;
  }

  return null;
}

async function runUpstream(
  deps: SatelliteFetchDeps,
  signal: AbortSignal,
): Promise<Satellite[] | null> {
  const concurrency = deps.concurrency ?? CONCURRENCY;
  const now = deps.now ?? Date.now;
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const pace = new Pacing(deps.rateLimitIntervalMs ?? RATE_LIMIT_INTERVAL_MS, now);

  const results = await runBatched(
    CURATED_NORAD_IDS,
    concurrency,
    (noradId) =>
      fetchSatellite({
        noradId,
        deps,
        fetchFn,
        signal,
        pace,
      }),
    signal,
  );
  const satellites = results.filter(
    (sat): sat is Satellite =>
      sat !== null && sat !== undefined,
  );
  return satellites.length > 0 ? satellites : null;
}

/** Simple upstream request pacing: at least `intervalMs` between uses. */
class Pacing {
  readonly #intervalMs: number;
  readonly #now: () => number;
  #last = 0;

  constructor(intervalMs: number, now: () => number) {
    this.#intervalMs = intervalMs;
    this.#now = now;
  }

  async wait(): Promise<void> {
    const now = this.#now();
    const elapsed = now - this.#last;
    const delay = this.#intervalMs - elapsed;
    this.#last = now;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

interface FetchSatelliteDeps {
  noradId: number;
  deps: SatelliteFetchDeps;
  fetchFn: typeof globalThis.fetch;
  signal: AbortSignal;
  pace: Pacing;
}

/** Fetch, parse and enrich one satellite, retrying throttled errors. */
async function fetchSatellite(cfg: FetchSatelliteDeps): Promise<Satellite | null> {
  const { noradId, deps, fetchFn, signal, pace } = cfg;
  const baseUrl = deps.baseUrl ?? CELESTRAK_BASE;
  const url = `${baseUrl}?CATNR=${noradId}&FORMAT=JSON`;
  const enrichFn = deps.enrich ?? enrich;
  const attempts = 2;

  for (let attempt = 0; attempt < attempts; attempt++) {
    await pace.wait();
    try {
      const response = await fetchFn(url, { signal });
      if (response.ok) {
        const records = (await response.json()) as unknown[];
        return enrichFn(noradId, records);
      }
      if (response.status === 429 || response.status >= 500) {
        // Throttled or server error: back off (with jitter) and retry once,
        // honouring Retry-After when present.
        const retryAfter = parseRetryAfter(response);
        const delay =
          retryAfter ?? BACKOFF_BASE_MS * (1 + Math.random());
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      console.error(`CelesTrak returned ${response.status} for NORAD ${noradId}`);
      return null;
    } catch (error) {
      // Aborted by the shared deadline: stop, let the batch fail fast.
      if (signal.aborted) throw error;
      console.error(`Failed to fetch orbital data for NORAD ${noradId}`, error);
      return null;
    }
  }
  return null;
}

function parseRetryAfter(response: Response): number | null {
  const value = response.headers.get("Retry-After");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

/**
 * Parse the OMM array returned for this NORAD ID, attach curated display
 * metadata, and return a domain Satellite (or null if unusable).
 */
export function enrich(noradId: number, records: unknown[]): Satellite | null {
  const record = records[0];
  const parsed = parseOmmRecord(record);
  if (parsed === null) {
    console.error(`No parseable OMM record for NORAD ${noradId}`);
    return null;
  }

  const curated = getCuratedSatellite(parsed.noradId);

  return {
    ...parsed,
    label: curated?.label ?? fallbackLabel(parsed.name),
    description: curated?.description ?? null,
  };
}

/** Best-effort short label when a curated label is missing. */
function fallbackLabel(name: string): string {
  return name || "Unknown";
}

/** Run `task` over `items`, at most `limit` tasks at a time, until aborted. */
async function runBatched<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
  signal: AbortSignal,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const worker = async () => {
    while (!signal.aborted) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await task(items[index] as T);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

/** Build a JSON response with permissive CORS (public data only). */
function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extraHeaders,
  };
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Test-only hook to clear the module-level coalescing state between tests.
 * Not part of the public API.
 */
export function _resetInflightForTests(): void {
  inflight = null;
}
