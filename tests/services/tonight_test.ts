import { assert, assertEquals } from "@std/assert";
import type { Observer } from "../../src/domain/observer.ts";
import type { Satellite } from "../../src/domain/satellite.ts";
import type { SatellitePass } from "../../src/domain/tonight.ts";
import {
  computeTonightSummary,
  deriveBestWindow,
  deriveNextEvents,
} from "../../src/services/tonight.ts";

/** The curated ISS (ZARYA, NORAD 25544) as a domain satellite for tests. */
const ISS: Satellite = {
  noradId: 25544,
  name: "ISS (ZARYA)",
  label: "ISS",
  description: "The International Space Station.",
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
};

const london: Observer = {
  latitude: 51.5074,
  longitude: -0.1278,
  heightKm: 0,
  capturedAt: new Date("2026-03-20T12:00:00Z"),
  accuracyM: 10,
};

function pass(
  noradId: number,
  rise: string,
  culmination: string,
  set: string,
  maxElevationDeg: number,
  culminationAzimuthDeg: number,
): SatellitePass {
  return {
    noradId,
    riseUtc: new Date(rise),
    culminationUtc: new Date(culmination),
    setUtc: new Date(set),
    maxElevationDeg,
    culminationAzimuthDeg,
  };
}

Deno.test("deriveBestWindow: null when there are no passes", () => {
  assertEquals(deriveBestWindow([]), null);
});

Deno.test("deriveBestWindow: single pass → peak 1, spanning that pass", () => {
  const best = deriveBestWindow([
    pass(1, "2026-03-20T20:00:00Z", "2026-03-20T20:05:00Z", "2026-03-20T20:10:00Z", 40, 180),
  ]);
  assert(best !== null);
  if (best === null) return;
  assertEquals(best.peakSatellites, 1);
  assertEquals(best.startUtc.toISOString(), "2026-03-20T20:00:00.000Z");
  assertEquals(best.endUtc.toISOString(), "2026-03-20T20:10:00.000Z");
});

Deno.test("deriveBestWindow: chooses the span with peak concurrency", () => {
  // Passes A and B overlap around 21:00; pass C is isolated later.
  const passes = [
    pass(1, "2026-03-20T20:30:00Z", "2026-03-20T20:40:00Z", "2026-03-20T20:50:00Z", 30, 90),
    pass(2, "2026-03-20T20:45:00Z", "2026-03-20T21:00:00Z", "2026-03-20T21:15:00Z", 45, 270),
    pass(3, "2026-03-20T22:00:00Z", "2026-03-20T22:06:00Z", "2026-03-20T22:12:00Z", 55, 0),
  ];
  const best = deriveBestWindow(passes);
  assert(best !== null);
  if (best === null) return;
  // Peak of 2 during the overlapping A+B region.
  assertEquals(best.peakSatellites, 2);
  assert(best.startUtc.getTime() >= new Date("2026-03-20T20:30:00Z").getTime());
  assert(best.endUtc.getTime() <= new Date("2026-03-20T21:15:00Z").getTime());
});

Deno.test("deriveNextEvents: filters to >= now and sorts chronologically", () => {
  const passes = [
    pass(
      25544,
      "2026-03-20T19:00:00Z",
      "2026-03-20T19:05:00Z",
      "2026-03-20T19:10:00Z",
      60,
      160,
    ),
    pass(
      25544,
      "2026-03-20T20:30:00Z",
      "2026-03-20T20:36:00Z",
      "2026-03-20T20:42:00Z",
      25,
      200,
    ),
  ];
  const now = new Date("2026-03-20T19:20:00Z");
  const events = deriveNextEvents(passes, now);
  // First pass's events are before `now` → dropped; only the second pass remains.
  assertEquals(events.length, 3);
  assertEquals(events.map((e) => e.kind), ["rise", "culmination", "set"]);
  for (let i = 1; i < events.length; i++) {
    assert(events[i]!.timeUtc.getTime() >= events[i - 1]!.timeUtc.getTime());
  }
  assert(events[0]!.noradId === 25544);
});

Deno.test("deriveNextEvents: returns [] when nothing is upcoming", () => {
  const now = new Date("2026-03-20T23:00:00Z");
  const events = deriveNextEvents(
    [pass(5, "2026-03-20T20:00:00Z", "2026-03-20T20:05:00Z", "2026-03-20T20:10:00Z", 30, 0)],
    now,
  );
  assertEquals(events.length, 0);
});

Deno.test("computeTonightSummary: returns null at a polar no-night location", () => {
  const polarNight = computeTonightSummary(
    [ISS],
    { ...london, latitude: 78.2, longitude: 15.6 },
    new Date("2026-06-21T12:00:00Z"),
  );
  assertEquals(polarNight, null);
});

Deno.test("computeTonightSummary: structural invariants for ISS over London", () => {
  const summary = computeTonightSummary([ISS], london, new Date("2026-03-20T12:00:00Z"));
  assert(summary !== null);
  if (summary === null) return;

  // Window ordering.
  assert(summary.window.startUtc.getTime() < summary.window.endUtc.getTime());

  // Every pass must sit inside the night window with sane geometry.
  const winStart = summary.window.startUtc.getTime();
  const winEnd = summary.window.endUtc.getTime();
  for (const p of summary.passes) {
    assert(p.riseUtc.getTime() >= winStart, "rise after window start");
    assert(p.setUtc.getTime() <= winEnd, "set before window end");
    assert(p.riseUtc.getTime() < p.setUtc.getTime(), "rise before set");
    assert(p.culminationUtc.getTime() >= p.riseUtc.getTime());
    assert(p.culminationUtc.getTime() <= p.setUtc.getTime());
    assert(p.maxElevationDeg > 0 && p.maxElevationDeg <= 90, "peak elevation in (0, 90]");
    assert(p.culminationAzimuthDeg >= 0 && p.culminationAzimuthDeg < 360);
  }

  // Passes sorted by rise time.
  for (let i = 1; i < summary.passes.length; i++) {
    assert(summary.passes[i]!.riseUtc.getTime() >= summary.passes[i - 1]!.riseUtc.getTime());
  }

  // Best window presence tracks passes.
  assertEquals(summary.bestWindow !== null, summary.passes.length > 0);

  // Next events are chronological and at/after the reference time.
  for (let i = 1; i < summary.nextEvents.length; i++) {
    assert(summary.nextEvents[i]!.timeUtc.getTime() >= summary.nextEvents[i - 1]!.timeUtc.getTime());
  }
  for (const e of summary.nextEvents) {
    assert(e.timeUtc.getTime() >= summary.computedAt.getTime(), "next events after computedAt");
  }
});
