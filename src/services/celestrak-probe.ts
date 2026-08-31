/**
 * CelesTrak reachability probe shared by the local CLI checker
 * (scripts/check-celestrak.ts) and the deployed diagnostic endpoint
 * (api/satellites.ts → /api/_celestrak-check).
 *
 * Classifies a single CelesTrak interaction so an operator can tell throttling
 * apart from a hard firewall block:
 *
 *   - REACHABLE : HTTP 200/2xx.
 *   - THROTTLED : HTTP 429/503, or an immediate connection failure / hang close
 *                 to the timeout — the "temporary, clears in ~2h" bucket.
 *   - BLOCKED   : CelesTrak's custom firewall page (403 with the permanent-ban
 *                 wording) or repeated hard 403s — needs manual review.
 */

/** Whether CelesTrak is generally reachable from this IP (2xx). */
const CELESTRAK_BANNED_MARKERS = [
  "ip is permanently banned",
  "has been permanently banned",
  "firewall",
];

export type ProbeKind = "REACHABLE" | "THROTTLED" | "BLOCKED";

export interface ProbeResult {
  ok: boolean;
  status: number | null;
  statusText: string;
  retryAfter: string | null;
  bodySnippet: string;
  latencyMs: number;
}

/** Run a single probe against `url`, returning latency and a body snippet. */
export async function probe(
  url: string,
  timeoutMs: number,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<ProbeResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, { signal: controller.signal });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      retryAfter: response.headers.get("Retry-After"),
      bodySnippet: text.slice(0, 200),
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      statusText:
        controller.signal.aborted
          ? `timeout after ${timeoutMs}ms`
          : error instanceof Error ? error.message : String(error),
      retryAfter: null,
      bodySnippet: "",
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Classify a single probe result into an action/recovery bucket. */
export function classify(result: ProbeResult): ProbeKind {
  if (result.ok) return "REACHABLE";

  if (result.status === 403 || isBlockedWording(result.bodySnippet)) {
    return "BLOCKED";
  }

  // 429 / 503, an immediate refusal (no response / no status), or a hang that
  // hit the timeout all read as temporary throttling.
  return "THROTTLED";
}

function isBlockedWording(snippet: string): boolean {
  const lower = snippet.toLowerCase();
  return CELESTRAK_BANNED_MARKERS.some((marker) => lower.includes(marker));
}