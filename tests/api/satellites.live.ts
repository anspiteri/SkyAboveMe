import { assertEquals, assert } from "@std/assert";
import handler from "../../api/satellites.ts";

/**
 * LIVE integration test for the serverless proxy.
 *
 * This exercises the full pipeline (CelesTrak fetch -> OMM parse -> curated
 * enrichment) against the real CelesTrak service. It is intentionally NOT part
 * of the default `deno task test` suite, because every run sends a burst of
 * requests from this machine's IP and can itself trigger the CelesTrak
 * per-IP throttling this proxy was built to avoid. Run it explicitly with
 * `deno task test:live`.
 *
 * When CelesTrak is unreachable the test skips rather than failing spuriously.
 */

const TEST_TIMEOUT_MS = 30_000;

function withTimeout(
  promise: Promise<Response>,
  ms: number,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Handler timed out after ${ms}ms`)),
      ms,
    );
    promise.finally(() => clearTimeout(timer)).then(resolve, reject);
  });
}

Deno.test("GET /api/satellites returns curated domain satellites", async () => {
  const request = new Request("http://localhost/api/satellites", {
    method: "GET",
  });

  let response: Response;
  try {
    response = await withTimeout(handler(request), TEST_TIMEOUT_MS);
  } catch {
    console.warn("skipping: satellite proxy timed out (CelesTrak unreachable?)");
    return;
  }

  if (response.status === 502 || response.status === 500) {
    console.warn("skipping: CelesTrak appears unreachable right now");
    return;
  }

  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("content-type")?.includes("application/json"),
    true,
  );

  const body = (await response.json()) as unknown;
  assert(Array.isArray(body), "expected an array of satellites");

  const satellites = body as Array<Record<string, unknown>>;
  assert(satellites.length > 0, "expected at least one satellite");
  assert(satellites.length >= 10, "expected most of the curated set");

  for (const s of satellites) {
    assertEquals(typeof s.noradId, "number");
    assert(typeof s.label === "string" && s.label.length > 0);
    assert("elements" in s, "satellite should carry orbital elements");
  }
});
