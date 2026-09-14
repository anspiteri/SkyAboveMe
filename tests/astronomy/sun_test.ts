import { assert, assertEquals } from "@std/assert";
import {
  sunriseUtc,
  sunsetUtc,
  tonightWindow,
  type NightWindow,
} from "../../src/astronomy/sun.ts";

/** Recall: the NOAA algorithm is approximate (± a few minutes). */
function assertWithinMinutes(actual: Date | null, expectedUtc: string, minutes: number): void {
  assert(actual !== null, `expected a time, got null`);
  if (actual === null) return;
  const diffMs = Math.abs(actual.getTime() - new Date(expectedUtc).getTime());
  assert(diffMs <= minutes * 60000, `within ${minutes} min of ${expectedUtc}; got ${actual.toISOString()}`);
}

Deno.test("sunriseUtc/sunsetUtc: equator near the equinox → ~06:00 / ~18:00 UTC", () => {
  // Roughly the March equinox at 0° longitude, 0° latitude. The NOAA mean-anomaly
  // approximation carries ~15 min of drift for a 2026 date, so allow a wide but
  // meaningful band — the key claim is "morning vs evening, ~6h apart".
  const eq = new Date(Date.UTC(2026, 2, 20));
  assertWithinMinutes(sunriseUtc(eq, 0, 0), "2026-03-20T06:00:00Z", 15);
  assertWithinMinutes(sunsetUtc(eq, 0, 0), "2026-03-20T18:00:00Z", 15);
  const rise = sunriseUtc(eq, 0, 0)?.getTime() ?? 0;
  const set = sunsetUtc(eq, 0, 0)?.getTime() ?? 0;
  const sepHours = (set - rise) / 3600000;
  assert(sepHours > 10 && sepHours < 14, `sunrise→sunset ≈ 12h, got ${sepHours.toFixed(1)}h`);
});

Deno.test("sunsetUtc is after sunriseUtc on the same date", () => {
  const date = new Date(Date.UTC(2026, 5, 21)); // June solstice-ish
  const rise = sunriseUtc(date, 51.5, -0.12);
  const set = sunsetUtc(date, 51.5, -0.12);
  assert(rise !== null && set !== null);
  if (rise !== null && set !== null) {
    assert(set.getTime() > rise.getTime());
  }
});

Deno.test("night is longer in northern winter than summer (mid-latitude)", () => {
  const summer = tonightWindow(new Date(Date.UTC(2026, 5, 21, 12)), 51.5, -0.12);
  const winter = tonightWindow(new Date(Date.UTC(2026, 11, 21, 12)), 51.5, -0.12);
  assert(summer !== null && winter !== null);
  if (summer !== null && winter !== null) {
    const summerNight = summer.end.getTime() - summer.start.getTime();
    const winterNight = winter.end.getTime() - winter.start.getTime();
    assert(winterNight > summerNight, "winter nights are longer than summer nights");
  }
});

Deno.test("tonightWindow: well-formed ordering and sensible bounds", () => {
  const noon = new Date(Date.UTC(2026, 2, 20, 12));
  const night = tonightWindow(noon, 40.7, -74.0);
  assert(night !== null);
  if (night !== null) {
    assert(night.start.getTime() < night.end.getTime());
    // Night spans sunset→sunrise across midnight; total < ~16h for mid-latitude.
    const hours = (night.end.getTime() - night.start.getTime()) / 3600000;
    assert(hours > 0 && hours < 16, `night between 0 and 16h, got ${hours.toFixed(1)}h`);
  }
});

Deno.test("tonightWindow: a mid-night reference sits inside tonight's window (regression)", () => {
  // Regression: the window used to anchor on the UTC calendar date, so a +X
  // timezone user well into the local night (still the same UTC calendar day)
  // would get a window a night AHEAD — VISIBLE TONIGHT showed tomorrow's
  // passes instead of the rest of tonight. The observer is placed on the
  // host's civil meridian so the host clock doubles as the observer clock,
  // keeping the test independent of where CI runs.
  const hostOffsetH = -new Date().getTimezoneOffset() / 60;
  const evening = new Date();
  evening.setHours(23, 30, 0, 0); // 23:30 local, mid-night at the host meridian
  const night = tonightWindow(evening, 40.7, hostOffsetH * 15);
  assert(night !== null, "expected a night at 23:30 local");
  if (night !== null) {
    assert(
      night.start.getTime() < evening.getTime() && evening.getTime() < night.end.getTime(),
      `23:30 local must sit inside the returned window ` +
        `${night.start.toISOString()} → ${night.end.toISOString()}`,
    );
  }
});

Deno.test("tonightWindow: during daylight the next night is ahead of the reference", () => {
  const hostOffsetH = -new Date().getTimezoneOffset() / 60;
  const afternoon = new Date();
  afternoon.setHours(14, 0, 0, 0); // 14:00 local, mid-afternoon at the host meridian
  const night = tonightWindow(afternoon, 40.7, hostOffsetH * 15);
  assert(night !== null);
  if (night !== null) {
    assert(
      night.start.getTime() > afternoon.getTime(),
      `the next night should begin after the reference instant`,
    );
  }
});

Deno.test("sunsetUtc: an east-Asian sunset stays on its local calendar day", () => {
  // Pin the NOAA grounding for a far-east longitude: Hong Kong's 2026-09-14
  // evening (~18:2x local, HKT) must land at ~10:2xZ on the SAME calendar day,
  // never on the next local evening.
  const set = sunsetUtc(new Date(Date.UTC(2026, 8, 14)), 22.3, 114.2);
  assertWithinMinutes(set, "2026-09-14T10:28:00Z", 5);
});

Deno.test("tonightWindow: a north-polar summer has no distinct night", () => {
  // Longyearbyen-ish latitude in mid-June → midnight sun → no distinct night.
  const night = tonightWindow(new Date(Date.UTC(2026, 5, 21, 12)), 78.2, 15.6);
  assertEquals(night, null);
});

Deno.test("tonightWindow: given the night window, sunrise ends it", () => {
  const noon = new Date(Date.UTC(2026, 2, 20, 12));
  const night: NightWindow | null = tonightWindow(noon, 40.7, -74.0);
  assert(night !== null);
  if (night === null) return;
  // The end of the window equals today's or the next day's sunrise.
  const todaySunrise = sunriseUtc(noon, 40.7, -74.0);
  const nextSunrise = sunriseUtc(new Date(Date.UTC(2026, 2, 21)), 40.7, -74.0);
  assert(
    night.end.getTime() === todaySunrise?.getTime() ||
      night.end.getTime() === nextSunrise?.getTime(),
    "window end matches a computed sunrise",
  );
});
