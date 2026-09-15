import { assert } from "@std/assert";
import type { Observer } from "../../src/domain/observer.ts";
import { computeTonightSummary } from "../../src/services/tonight.ts";
import { FALLBACK_SATELLITES } from "../../src/data/satellite-snapshot.ts";

/**
 * Time-phase matrix for VISIBLE TONIGHT using MOCKED satellite data
 * (FALLBACK_SATELLITES, the same deterministic snapshot the API serves when
 * live data is unavailable). Each phase simulates a check at a different point
 * of the observer's night, at an EXPLICIT civil offset from UTC, so the whole
 * matrix is reproducible no matter which host (or %TZ) the test runner is on.
 *
 * The invariant every phase enforces — VISIBLE TONIGHT only shows current and
 * future passes, never history — is the reported bug from production ("shows
 * previous times"). The pre-dawn phases additionally lock the regression where
 * the window jumped to TOMORROW's night between local midnight and dawn.
 */

interface Phase {
  name: string;
  /** Observer whose civil location matches `offsetMinutes`. */
  observer: Observer;
  /** The observer's civil offset from UTC at the checked instant. */
  offsetMinutes: number;
  /** Local date + time on the observer's clock. */
  localDate: string;
  localTime: string;
  /** Whether the checked instant must fall INSIDE the returned window. */
  containsNow: boolean;
  /** Whether the night must already have begun (start < now). */
  started: boolean;
}

const melbourne: Observer = {
  latitude: -37.8,
  longitude: 144.96,
  heightKm: 0,
  capturedAt: new Date("2026-09-14T00:00:00Z"),
  accuracyM: 1000,
};

const newYork: Observer = {
  latitude: 40.7,
  longitude: -74.0,
  heightKm: 0,
  capturedAt: new Date("2026-03-20T00:00:00Z"),
  accuracyM: 1000,
};

/** Sunset ≈ 18:09 local / dawn ≈ 06:23 local in Melbourne (late September). */
const PHASES: Phase[] = [
  {
    name: "pre-sunset afternoon",
    observer: melbourne,
    offsetMinutes: 600,
    localDate: "2026-09-14",
    localTime: "14:00",
    containsNow: false,
    started: false,
  },
  {
    name: "early evening after sunset",
    observer: melbourne,
    offsetMinutes: 600,
    localDate: "2026-09-14",
    localTime: "19:00",
    containsNow: true,
    started: true,
  },
  {
    name: "late night",
    observer: melbourne,
    offsetMinutes: 600,
    localDate: "2026-09-14",
    localTime: "23:30",
    containsNow: true,
    started: true,
  },
  {
    name: "pre-dawn (regression: current night, not tomorrow's)",
    observer: melbourne,
    offsetMinutes: 600,
    localDate: "2026-09-15",
    localTime: "02:30",
    containsNow: true,
    started: true,
  },
  {
    name: "pre-dawn western meridian (NYC, solar dawn ends on next UTC day)",
    observer: newYork,
    offsetMinutes: -240,
    localDate: "2026-03-20",
    localTime: "02:00",
    containsNow: true,
    started: true,
  },
  {
    name: "post-dawn morning (next night is upcoming)",
    observer: melbourne,
    offsetMinutes: 600,
    localDate: "2026-09-15",
    localTime: "08:00",
    containsNow: false,
    started: false,
  },
];

function atLocal(
  date: string,
  time: string,
  offsetMinutes: number,
): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(
    Date.UTC(year!, month! - 1, day!, hour!, minute ?? 0) - offsetMinutes * 60_000,
  );
}

Deno.test("computeTonightSummary: time-phase matrix with mocked data", () => {
  for (const phase of PHASES) {
    const now = atLocal(phase.localDate, phase.localTime, phase.offsetMinutes);
    const summary = computeTonightSummary(
      [...FALLBACK_SATELLITES],
      phase.observer,
      now,
      phase.offsetMinutes,
    );
    assert(summary !== null, `${phase.name}: expected a night window`);
    if (summary === null) continue;

    const { startUtc, endUtc } = summary.window;
    const startMs = startUtc.getTime();
    const endMs = endUtc.getTime();
    const nowMs = now.getTime();

    // One well-formed night, never a degenerate or multi-night span.
    assert(startMs < endMs, `${phase.name}: window is degenerate`);
    assert(
      endMs - startMs < 24 * 3600_000,
      `${phase.name}: window spans more than one night`,
    );

    if (phase.containsNow) {
      assert(
        startMs <= nowMs && nowMs < endMs,
        `${phase.name}: expected now inside the window ` +
          `${startUtc.toISOString()} → ${endUtc.toISOString()}`,
      );
    }
    if (phase.started) {
      assert(startMs < nowMs, `${phase.name}: expected the night to have begun`);
    } else {
      assert(startMs > nowMs, `${phase.name}: expected the night to be upcoming`);
    }

    // THE invariant: every listed pass is current or future — never history.
    for (const p of summary.passes) {
      assert(
        p.setUtc.getTime() >= nowMs,
        `${phase.name}: pass ${p.noradId} is history (setUtc ${p.setUtc.toISOString()} before now)`,
      );
    }
    for (const e of summary.nextEvents) {
      assert(
        e.timeUtc.getTime() >= nowMs,
        `${phase.name}: event ${e.kind} before now`,
      );
    }

    // Sanity so the matrix is not vacuously green: mocked data over a full dark
    // night at a mid-latitude observer produces activity to report.
    assert(
      summary.passes.length > 0,
      `${phase.name}: expected at least one pass in the night`,
    );
  }
});