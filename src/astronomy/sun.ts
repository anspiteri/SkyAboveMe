/**
 * Sunrise / sunset and the "tonight" observation window (AGENTS.md §10, §23).
 *
 * Pure, browser-free functions using the standard NOAA solar-position
 * algorithm (mean anomaly → ecliptic longitude → right ascension → hour angle).
 * The observer's latitude/longitude and a UTC date determine when the Sun
 * crosses the horizon, and the app derives the VISIBLE TONIGHT pass-prediction
 * window from the resulting sunset→next-sunrise span.
 *
 * All times are returned as UTC instants so the rest of the pipeline has an
 * unambiguous representation (AGENTS.md §11).
 */

import { degreesToRadians } from "../utils/angles.ts";

/** Apparent solar altitude at sunrise/sunset: 0.833° = refraction + half the
 *  solar disc, so "sunrise" is when the upper limb clears the horizon. */
const ZENITH_DEG = 90.833;

export interface NightWindow {
  /** First instant of night (tonight's sunset), UTC. */
  start: Date;
  /** End of night (next sunrise), UTC. */
  end: Date;
}

/**
 * NOAA sunrise/sunset. `date` is a UTC date (year/month/day used; the time-of-day
 * field is ignored); the algorithm returns the UTC instant of the event on that
 * calendar date, or null where the Sun never rises above / sets below the
 * apparent horizon at this latitude.
 *
 * `wantRise` selects sunrise vs sunset; the NOAA `t` bias (6h for sunrise, 18h
 * for sunset) encodes when the Sun is at the horizon within the day.
 */
function crossingUtc(
  date: Date,
  latDeg: number,
  lonDeg: number,
  wantRise: boolean,
): Date | null {
  const n = dayOfYear(date);
  const lngHour = lonDeg / 15;

  const t = wantRise ? n + (6 - lngHour) / 24 : n + (18 - lngHour) / 24;

  // Mean anomaly (degrees) and ecliptic longitude.
  const mDeg = 0.9856 * t - 3.289;
  const mRad = degreesToRadians(mDeg);
  const lDeg = mDeg + 1.916 * Math.sin(mRad) + 0.020 * Math.sin(2 * mRad) + 282.634;

  // Right ascension, with quadrant adjustment to match the ecliptic longitude.
  let raDeg = (Math.atan(0.91764 * Math.tan(degreesToRadians(lDeg))) * 180) / Math.PI;
  const lQuadrant = Math.floor(lDeg / 90) * 90;
  const raQuadrant = Math.floor(raDeg / 90) * 90;
  raDeg = raDeg + (lQuadrant - raQuadrant);
  raDeg /= 15; // hours

  // Declination and the local hour angle of the event.
  const sinDec = 0.39782 * Math.sin(degreesToRadians(lDeg));
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH =
    (Math.cos(degreesToRadians(ZENITH_DEG)) - sinDec * Math.sin(degreesToRadians(latDeg))) /
    (cosDec * Math.cos(degreesToRadians(latDeg)));

  if (cosH > 1) return null; // Sun never rises above the horizon (polar night).
  if (cosH < -1) return null; // Sun never sets below the horizon (polar day).

  let hDeg = (Math.acos(cosH) * 180) / Math.PI;
  hDeg = wantRise ? 360 - hDeg : hDeg;
  hDeg /= 15; // hours

  // Local mean time of the event, converted to UTC.
  let utHours = hDeg + raDeg - 0.06571 * t - 6.622;
  utHours = ((utHours - lngHour) % 24 + 24) % 24;

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) + utHours * 3600000);
}

/**
 * Sunrise (UTC) on the given calendar date, or null in polar night/day.
 */
export function sunriseUtc(date: Date, latDeg: number, lonDeg: number): Date | null {
  return crossingUtc(date, latDeg, lonDeg, true);
}

/**
 * Sunset (UTC) on the given calendar date, or null in polar night/day.
 */
export function sunsetUtc(date: Date, latDeg: number, lonDeg: number): Date | null {
  return crossingUtc(date, latDeg, lonDeg, false);
}

/**
 * The "tonight" window for the observer at `date`: tonight's sunset → the next
 * sunrise. Handles three cases:
 *   1. still before tonight's sunset → sunset today → sunrise after it;
 *   2. already past tonight's sunset → sunset tomorrow → the sunrise after that;
 *   3. polar day/night → no distinct night → null (the caller shows an honest
 *      "no distinct night" state instead of guessing).
 */
export function tonightWindow(
  date: Date,
  latDeg: number,
  lonDeg: number,
): NightWindow | null {
  const today = dateAt(date);
  const todaySunset = sunsetUtc(today, latDeg, lonDeg);

  // Choose the appropriate sunset.
  const sunset =
    todaySunset !== null && todaySunset.getTime() > date.getTime()
      ? todaySunset
      : sunsetUtc(addDays(today, 1), latDeg, lonDeg);
  if (sunset === null) return null;

  // The sunrise ending this night is on the same calendar date as the sunset
  // (a UT day always spans night→dawn→...→sunset; the next sunrise after that
  // evening's sunset is the following dawn on the sunset's date).
  let end = sunriseUtc(sunset, latDeg, lonDeg);
  if (end === null) return null;
  if (end.getTime() <= sunset.getTime()) {
    // Defensive: never produce a degenerate/backwards window.
    end = sunriseUtc(addDays(sunset, 1), latDeg, lonDeg);
    if (end === null) return null;
  }

  if (sunset.getTime() >= end.getTime()) return null;
  return { start: sunset, end };
}

function addDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );
}

function dateAt(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Day of year (1-based). */
function dayOfYear(date: Date): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const start = Date.UTC(y, 0, 1);
  const now = Date.UTC(y, m, d);
  return Math.floor((now - start) / 86400000) + 1;
}
