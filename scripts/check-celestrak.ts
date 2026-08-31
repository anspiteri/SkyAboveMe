/**
 * Local CelesTrak connectivity checker.
 *
 * Diagnoses whether CelesTrak is reachable from YOUR IP, and classifies the
 * result into one of three buckets:
 *
 *   - REACHABLE  : got a usable HTTP 200 real fast.
 *   - THROTTLED  : temporary rate limiting (HTTP 429/503, or a hang close to
 *                  the timeout, or an immediate connection failure from a
 *                  shared egress that CelesTrak has throttled).
 *   - BLOCKED    : a hard firewall block — CelesTrak's custom 403 page with its
 *                  "ip is permanently banned" text, or repeated 403s.
 *
 * This runs from your local machine, NOT the Deno Deploy IP, so it answers
 * "is CelesTrak generally healthy?" — not "what to do about the Deploy IP".
 * For the Deploy egress IP's own status, hit the deployed diagnostic endpoint
 * (GET /api/_celestrak-check) instead.
 *
 * CelesTrak temp-throttles/auto-clears in ~2h; a real block needs a review and
 * infrastructure changes. 5xx means "stop querying immediately".
 *
 * Usage:  deno task check:celestrak
 */
import { classify, probe } from "../src/services/celestrak-probe.ts";

const TARGET = "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON";
const PROBES = 3;
const TIMEOUT_MS = 8_000;

console.log(`Probing CelesTrak ${PROBES}× (${TIMEOUT_MS}ms timeout) from local IP...`);
console.log(`Target: ${TARGET}\n`);

const results = [];
for (let i = 1; i <= PROBES; i++) {
  const r = await probe(TARGET, TIMEOUT_MS);
  results.push(r);
  const kind = classify(r);
  const latency = r.latencyMs >= 0 ? `${String(r.latencyMs).padStart(5)} ms` : "  n/a   ";
  console.log(
    `#${i}  ${kind.padEnd(10)} ${r.status ?? "no-resp".padEnd(7)} ${latency}` +
      (r.statusText ? `  ${r.statusText}` : "") +
      (r.retryAfter ? `  Retry-After: ${r.retryAfter}s` : ""),
  );
}

console.log("\n--- Summary ---");
const kinds = results.map((r) => classify(r));
if (kinds.every((k) => k === "REACHABLE")) {
  console.log("REACHABLE: CelesTrak answered from your IP. Any app outage is specific to the Deno Deploy egress IP — check /api/_celestrak-check on the deployment.");
} else if (kinds.includes("BLOCKED")) {
  console.log("BLOCKED: got a hard firewall response. This needs manual CelesTrak review / infrastructure change, not just patience — a temp throttle would show as 429/503 or hangs.");
} else if (kinds.every((k) => k === "THROTTLED")) {
  console.log("THROTTLED: temporary rate limiting or hangs. This should auto-clear in ~2h. Stop querying CelesTrak until it does.");
} else {
  console.log("MIXED: unstable connectivity (some reachable, some not). Likely transient throttling.");
}

const first = results[0];
if (first !== undefined && first.statusText) {
  console.log(`\nFirst-response detail: ${first.statusText}`);
}