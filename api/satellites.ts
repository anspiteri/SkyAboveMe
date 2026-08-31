import { getCuratedSatellite, CURATED_NORAD_IDS } from "../src/data/curated-catalog.ts";
import { FALLBACK_SATELLITES } from "../src/data/satellite-snapshot.ts";
import { parseOmmRecord } from "../src/services/parse-omm.ts";
import { classify, probe } from "../src/services/celestrak-probe.ts";
import type { Satellite } from "../src/domain/satellite.ts";
import { openSatelliteCache, type Cache } from "./cache.ts";

/**
 * Serverless function that proxies public satellite orbital data.
 *
 * The browser cannot always call CelesTrak directly (CORS, rate limits), so
 * this function fetches the curated satellites on the user's behalf and returns
 * ready-to-use domain `Satellite[]` objects. It is stateless and receives NO
 * user location: the observer's precise coordinates never leave the browser
 * (AGENTS.md §4, §20).
 *
 * CelesTrak throttles/blocks client IPs after bursts of requests (surfacing as
 * TCP-level hangs/timeouts, per their usage policy). Orbital elements update on
 * CelesTrak's ~2h cycle but we cache for 6h (fewer requests = good for them),
 * and the real-time part of tracking (client SGP4 propagation) is unaffected,
 * so this proxy:
 *   - caches the upstream element set for hours in Deno KV,
 *   - coalesces concurrent misses and paces upstream requests,
 *   - stops immediately on ANY non-200 response per CelesTrak's usage policy
 *     (no retries — repeating 403/404 is what lands an IP in the firewall),
 *   - opens a durable "breaker" that stops hitting CelesTrak entirely for a
 *     cooldown period after consecutive failed refresh attempts (so we can
 *     never be the actor that gets the shared IP permanently firewalled),
 *   - ALWAYS serves something: live data → fresh cache → stale cache → the
 *     bundled snapshot fallback, flagging the source via response headers.
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
/** How long an in-flight ("coalesced") share of an upstream fetch is valid. */
const INFLIGHT_MAX_AGE_MS = HANDLER_DEADLINE_MS;
/** How long the circuit breaker stays open once tripped. Aligned to CelesTrak's
 * stated ~2 h window for temporary blocks to auto-clear, so once throttled we
 * stop touching upstream through the full recovery period instead of re-pinging
 * mid-throttle on every fresh deploy/request. */
const COOLDOWN_MS = 2 * 60 * 60 * 1000;
/** Consecutive failed refresh batches that trip the breaker. */
const BREAKER_FAILURE_THRESHOLD = 2;
/** Hard expiry for the breaker entry (outlives any cooldown). */
const BREAKER_KEEP_FOR_MS = 3 * 60 * 60 * 1000;

const CACHE_KEY = "curated-satellites";
const BREAKER_KEY = "celestrak-breaker";

type UpstreamParseFn = (
  noradId: number,
  records: unknown[],
) => Satellite | null;

/** Where served data came from. "fallback" = the bundled frozen snapshot. */
export type DataSource = "celestrak" | "cache" | "fallback";

/** Result of resolving the satellite set, with an explicit provenance flag. */
export interface SatellitesResult {
  satellites: Satellite[];
  source: DataSource;
  /** True when the data is older than the upstream TTL (stale cache or
   * snapshot). */
  stale: boolean;
}

interface BreakerState {
  openUntil: number;
  failures: number;
}

interface UpstreamTelemetry {
  errors: number;
  successes: number;
}

export interface SatelliteFetchDeps {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  cache?: Cache<unknown>;
  concurrency?: number;
  upstreamTtlMs?: number;
  keepForMs?: number;
  rateLimitIntervalMs?: number;
  handlerDeadlineMs?: number;
  cooldownMs?: number;
  breakerFailureThreshold?: number;
  /** Override the upstream CelesTrak URL (tests). */
  baseUrl?: string;
  /** Override how an OMM array becomes a Satellite (tests). */
  enrich?: UpstreamParseFn;
}

interface InFlight {
  promise: Promise<SatellitesResult | null>;
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
    const result = await fetchCuratedSatellites({ cache });
    const headers: Record<string, string> = {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
      "X-Satellite-Data-Source": result.source,
    };
    if (result.stale) headers["X-Satellite-Data-Stale"] = "true";
    return jsonResponse(result.satellites, 200, headers);
  } catch (error) {
    console.error("Failed to retrieve satellite data", error);
    return jsonResponse({ error: "Failed to retrieve satellite data" }, 502);
  }
}

/**
 * Resolve the curated satellite set. Always returns SOMETHING: fresh/stale
 * cache when available, otherwise the bundled snapshot (flagged as fallback).
 * Only throws on a total failure to even read state.
 */
export async function fetchCuratedSatellites(
  deps: SatelliteFetchDeps = {},
): Promise<SatellitesResult> {
  const now = deps.now ?? Date.now;
  const ttlMs = deps.upstreamTtlMs ?? UPSTREAM_TTL_MS;
  const cache = deps.cache ?? await getSharedCache();
  const cooldownMs = deps.cooldownMs ?? COOLDOWN_MS;
  const threshold = deps.breakerFailureThreshold ?? BREAKER_FAILURE_THRESHOLD;

  const breaker = await readBreaker(cache);

  // Breaker open: stop touching upstream entirely (we must not be the process
  // that shoves the shared egress IP further into CelesTrak's firewall). Serve
  // whatever we have, oldest-first.
  if (now() < breaker.openUntil) {
    return serveFromCacheOrSnapshot(cache, now(), ttlMs);
  }

  // 1. Fresh cache.
  const entry = await cache.get(CACHE_KEY);
  if (entry && now() - entry.storedAt < ttlMs) {
    return { satellites: entry.value as Satellite[], source: "cache", stale: false };
  }
  // 2. Cache stale/absent: try to refresh. On upstream failure, fall back to
  //    stale cache or the bundled snapshot.
  const fresh = await tryRefresh(entry?.value as Satellite[] | undefined, deps, {
    cache,
    now,
    ttlMs,
    cooldownMs,
    threshold,
  });
  if (fresh !== null) return fresh;
  return serveFromCacheOrSnapshot(cache, now(), ttlMs);
}

/** Serve the oldest data we have: any cached entry, else the bundled snapshot. */
async function serveFromCacheOrSnapshot(
  cache: Cache<unknown>,
  now: number,
  ttlMs: number,
): Promise<SatellitesResult> {
  const entry = await cache.get(CACHE_KEY);
  if (entry) {
    return {
      satellites: entry.value as Satellite[],
      source: "cache",
      stale: now - entry.storedAt > ttlMs,
    };
  }
  return { satellites: [...FALLBACK_SATELLITES], source: "fallback", stale: true };
}

interface RefreshContext {
  cache: Cache<unknown>;
  now: () => number;
  ttlMs: number;
  cooldownMs: number;
  threshold: number;
}

/**
 * Attempt an upstream fetch; on failure, record a breaker failure. Concurrent
 * misses are coalesced onto a single refresh, so exactly one caller owns the
 * cache write and breaker bookkeeping while the rest wait on the same result.
 */
async function tryRefresh(
  stale: Satellite[] | undefined,
  deps: SatelliteFetchDeps,
  ctx: RefreshContext,
): Promise<SatellitesResult | null> {
  // Coalesce: if a refresh is already in flight, share its outcome.
  if (inflight && ctx.now() - inflight.startedAt < INFLIGHT_MAX_AGE_MS) {
    return inflight.promise;
  }

  const keepForMs = deps.keepForMs ?? KEEP_FOR_MS;
  const deadlineMs = deps.handlerDeadlineMs ?? HANDLER_DEADLINE_MS;

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), deadlineMs);

  const promise: Promise<SatellitesResult | null> = (async () => {
    try {
      const telemetry: UpstreamTelemetry = { errors: 0, successes: 0 };
      const result = await runUpstream(deps, controller.signal, telemetry);

      if (result !== null && result.length > 0) {
        await ctx.cache.set(CACHE_KEY, result, keepForMs);
        await resetBreaker(ctx.cache);
        return { satellites: result, source: "celestrak", stale: false };
      }

      // Nothing usable came back upstream; count it against the breaker so we
      // back off across isolates instead of retrying on every request.
      console.warn(
        `CelesTrak refresh failed (errors=${telemetry.errors}, successes=${telemetry.successes}); ` +
          "recorded a breaker failure.",
      );
      await recordBreakerFailure(ctx.cache, ctx.cooldownMs, ctx.threshold);

      if (stale && stale.length > 0) {
        return { satellites: stale, source: "cache", stale: true };
      }
      return null;
    } finally {
      clearTimeout(deadline);
    }
  })();

  inflight = { promise, startedAt: ctx.now() };
  try {
    return await promise;
  } finally {
    if (inflight?.promise === promise) inflight = null;
  }
}

async function runUpstream(
  deps: SatelliteFetchDeps,
  signal: AbortSignal,
  telemetry: UpstreamTelemetry,
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
        telemetry,
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
  telemetry: UpstreamTelemetry;
}

/**
 * Fetch, parse and enrich one satellite.
 *
 * Retry policy follows CelesTrak's usage policy verbatim: M2M software should
 * stop querying immediately on ANY non-HTTP-200 response and report it to a
 * human. Repeating 403/404 is exactly what lands an IP in the firewall, and
 * 50x means the server is struggling and needs to recover. So there is NO
 * retry here — a single non-200 returns null and counts toward the breaker.
 */
async function fetchSatellite(cfg: FetchSatelliteDeps): Promise<Satellite | null> {
  const { noradId, deps, fetchFn, signal, pace, telemetry } = cfg;
  const baseUrl = deps.baseUrl ?? CELESTRAK_BASE;
  const url = `${baseUrl}?CATNR=${noradId}&FORMAT=JSON`;
  const enrichFn = deps.enrich ?? enrich;

  await pace.wait();
  try {
    const response = await fetchFn(url, { signal });
    if (response.ok) {
      telemetry.successes++;
      const records = (await response.json()) as unknown[];
      return enrichFn(noradId, records);
    }
    telemetry.errors++;
    console.error(
      `CelesTrak returned non-200 (${response.status}) for NORAD ${noradId}; ` +
        "stopping (no retry per CelesTrak usage policy).",
    );
    return null;
  } catch (error) {
    if (signal.aborted) throw error;
    telemetry.errors++;
    console.error(`Failed to fetch orbital data for NORAD ${noradId}`, error);
    return null;
  }
}

// --- Circuit breaker (durable: stored in the shared cache) ---------------

async function readBreaker(cache: Cache<unknown>): Promise<BreakerState> {
  const entry = await cache.get(BREAKER_KEY);
  const value = entry?.value as BreakerState | undefined;
  return value ?? { openUntil: 0, failures: 0 };
}

async function resetBreaker(cache: Cache<unknown>): Promise<void> {
  await cache.set(
    BREAKER_KEY,
    { openUntil: 0, failures: 0 } satisfies BreakerState,
    BREAKER_KEEP_FOR_MS,
  );
}

/** Count a failed refresh; open the breaker once the threshold is reached. */
async function recordBreakerFailure(
  cache: Cache<unknown>,
  cooldownMs: number,
  threshold: number,
): Promise<void> {
  const now = Date.now();
  const current = await readBreaker(cache);
  if (now < current.openUntil) return;
  const failures = current.failures + 1;
  if (failures >= threshold) {
    const openUntil = now + cooldownMs;
    await cache.set(
      BREAKER_KEY,
      { openUntil, failures: 0 } satisfies BreakerState,
      BREAKER_KEEP_FOR_MS,
    );
    console.warn(
      `CelesTrak circuit breaker OPEN until ${new Date(openUntil).toISOString()} ` +
        `(${threshold} consecutive failed refreshes)`,
    );
  } else {
    await cache.set(
      BREAKER_KEY,
      { openUntil: 0, failures } satisfies BreakerState,
      BREAKER_KEEP_FOR_MS,
    );
  }
}

// --- Diagnostic probe -----------------------------------------------------

/**
 * Probe CelesTrak with a SINGLE request from this process's egress IP, so we can
 * tell throttling (hang / 503) apart from a hard firewall block (custom 403)
 * from the exact IP the app actually uses. Exposed at GET /api/_celestrak-check
 * (see main.ts). Intentionally separate from the main proxy path.
 */
export async function celestrakDiagnostic(
  deps: Pick<SatelliteFetchDeps, "fetch" | "baseUrl"> & { timeoutMs?: number } = {},
): Promise<Response> {
  const target = `${deps.baseUrl ?? CELESTRAK_BASE}?CATNR=25544&FORMAT=JSON`;
  const timeoutMs = deps.timeoutMs ?? 10_000;

  const probeResult = await probe(target, timeoutMs, deps.fetch ?? globalThis.fetch);

  return jsonResponse({
    at: new Date().toISOString(),
    target,
    ...probeResult,
    verdict: classify(probeResult),
  }, 200);
}

// --- OMM parsing / enrichment --------------------------------------------

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