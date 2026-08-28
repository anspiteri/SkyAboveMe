import { assertEquals, assert } from "@std/assert";
import { MOCK_SATELLITES } from "../scripts/dev-fixtures.ts";
import { buildSatRec } from "../src/services/satellite-propagation.ts";

/**
 * Guards the offline fixtures used by `deno task dev:mock`: they must stay a
 * valid, SGP4-usable set matching the shape the browser API validator accepts,
 * so the mock proxy keeps rendering a full sky with no CelesTrak access.
 */

Deno.test("dev fixtures: cover the curated catalogue with unique NORAD IDs", () => {
  const ids = MOCK_SATELLITES.map((s) => s.noradId);
  assertEquals(new Set(ids).size, ids.length, "NORAD IDs are unique");
  // The whole curated set is present.
  assertEquals(ids.length, 12);
});

Deno.test("dev fixtures: every entry carries the wire shape the browser parses", () => {
  for (const s of MOCK_SATELLITES) {
    assert(typeof s.noradId === "number");
    assert(typeof s.name === "string");
    assert(typeof s.label === "string");
    assert(typeof s.description === "string");
    assert(typeof s.elements.epoch === "string");
    assert(typeof s.elements.meanMotionRevPerDay === "number");
    assert(typeof s.elements.inclinationDeg === "number");
  }
});

Deno.test("dev fixtures: every entry builds a usable SGP4 SatRec", () => {
  for (const s of MOCK_SATELLITES) {
    assert(buildSatRec(s) !== null, `NORAD ${s.noradId} must propagate`);
  }
});

Deno.test("dev fixtures: survive a JSON round-trip (as served over the wire)", () => {
  // The browser receives JSON; re-parsing must keep all required elements.
  const decoded = JSON.parse(JSON.stringify(MOCK_SATELLITES)) as typeof MOCK_SATELLITES;
  assertEquals(decoded.length, MOCK_SATELLITES.length);
  for (const s of decoded) {
    assertEquals(typeof s.elements.bstar, "number");
    assertEquals(typeof s.elements.meanMotionDot, "number");
    assertEquals(typeof s.elements.meanMotionDdot, "number");
  }
});
