#!/usr/bin/env deno run --no-config
import { getCuratedSatellite, CURATED_NORAD_IDS } from "../src/data/curated-catalog.ts";
import { parseOmmRecord } from "../src/services/parse-omm.ts";
import type { Satellite } from "../src/domain/satellite.ts";

/**
 * Serverless function that proxies public satellite orbital data.
 *
 * The browser cannot always call CelesTrak directly (CORS, rate limits), so
 * this function fetches the curated satellites on the user's behalf and returns
 * ready-to-use domain `Satellite[]` objects.
 *
 * It is stateless and receives NO user location: the observer's precise
 * coordinates never leave the browser (AGENTS.md §4, §20).
 */

const CELESTRAK_BASE = "https://celestrak.org/NORAD/elements/gp.php";
/** Requests made to CelesTrak concurrently, to stay polite to the service. */
const CONCURRENCY = 4;
/** Hard cap on total proxy time so an outage fails fast instead of ~24 s. */
const HANDLER_DEADLINE_MS = 5_000;

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const satellites = await fetchCuratedSatellites();
    return jsonResponse(satellites, 200, {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
    });
  } catch (error) {
    console.error("Failed to retrieve satellite data", error);
    return jsonResponse(
      { error: "Failed to retrieve satellite data" },
      502,
    );
  }
}

/**
 * Fetch OMM records for every curated satellite and map them to domain types.
 *
 * All requests share a deadline-driven AbortSignal so that, during a CelesTrak
 * outage, the whole batch is aborted after ~HANDLER_DEADLINE_MS instead of
 * exhausting every per-request timeout (~24 s in the worst case).
 */
async function fetchCuratedSatellites(): Promise<Satellite[]> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), HANDLER_DEADLINE_MS);

  try {
    const results = await runBatched(
      CURATED_NORAD_IDS,
      CONCURRENCY,
      (noradId) => fetchSatellite(noradId, controller.signal),
      controller.signal,
    );
    return results.filter((sat): sat is Satellite => sat !== null);
  } finally {
    clearTimeout(deadline);
  }
}

/** Fetch, parse and enrich one satellite by NORAD catalogue number. */
async function fetchSatellite(
  noradId: number,
  signal: AbortSignal,
): Promise<Satellite | null> {
  const url = `${CELESTRAK_BASE}?CATNR=${noradId}&FORMAT=JSON`;

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      console.error(`CelesTrak returned ${response.status} for NORAD ${noradId}`);
      return null;
    }
    const records = (await response.json()) as unknown[];
    return enrich(noradId, records);
  } catch (error) {
    // Skip the failed satellite and keep processing the rest (AGENTS.md §17).
    console.error(`Failed to fetch orbital data for NORAD ${noradId}`, error);
    return null;
  }
}

/**
 * Parse the OMM array returned for this NORAD ID, attach curated display
 * metadata, and return a domain Satellite (or null if unusable).
 */
function enrich(noradId: number, records: unknown[]): Satellite | null {
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
