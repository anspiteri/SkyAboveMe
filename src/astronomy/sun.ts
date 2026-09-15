/**
 * Sunrise / sunset and the "tonight" observation window (AGENTS.md §10, §23).
 *
 * Pure, browser-free functions using the standard NOAA solar-position
 * algorithm (mean anomaly → ecliptic longitude → right ascension → hour angle).
 * The observer's latitude/longitude and the observer's LOCAL calendar date
 * (passed as UTC-encoded components) determine when the Sun crosses the
 * horizon — the NOAA `-lngHour` term converts the local-mean-time event back
 * to a UTC instant — and the app derives the VISIBLE TONIGHT pass-prediction
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
 * NOAA sunrise/sunset. `date`'s UTC year/month/day name the OBSERVER'S LOCAL
 * calendar date (the time-of-day field is ignored); e.g. request the event for
 * local 2026-03-20 with `new Date(Date.UTC(2026, 2, 20))`. Returns the UTC
 * instant of the event on that calendar date, or null where the Sun never
 * rises above / sets below the apparent horizon at this latitude.
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
 * The "tonight" window for the observer at `date`: the night that contains
 * `date`, or — once that night has ended — the next night ahead (sunset →
 * next sunrise). A night is a civil concept anchored on the observer's LOCAL
 * calendar date, so a +X timezone user well into their evening — or between
 * local midnight and dawn — still gets the CURRENT night:
 *   1. inside the night begun by the MOST RECENT local sunset (the current
 *      night, however far past local midnight it is, or however far west) →
 *      that night; completed passes are filtered out by the caller;
 *   2. otherwise → the upcoming night's sunset (before sunset, or the
 *      partially-past night after it);
 *   3. polar day/night → no distinct night → null (the caller shows an honest
 *      "no distinct night" state instead of guessing).
 *
 * `timeZoneOffsetMinutes` is the observer's civil offset from UTC (device tz
 * by default, which for a phone is the observer's; explicit here so tests can
 * simulate any timezone on any host deterministically).
 */
export function tonightWindow(
  date: Date,
  latDeg: number,
  lonDeg: number,
  timeZoneOffsetMinutes?: number,
): NightWindow | null {
  const offsetMinutes = timeZoneOffsetMinutes ?? -date.getTimezoneOffset();
  const today = dateAt(date, offsetMinutes);
  const nowMs = date.getTime();

  // The night in progress is the one begun by the most recent local sunset:
  // yesterday's if we are past local midnight but still before dawn.
  const previousSunset = sunsetUtc(addDays(today, -1), latDeg, lonDeg);
  const inPreviousNight =
    previousSunset !== null && nowMs >= previousSunset.getTime() &&
    nowMs < (nightEnd(previousSunset, latDeg, lonDeg)?.getTime() ?? Infinity);

  let sunset: Date | null;
  if (inPreviousNight) {
    sunset = previousSunset;
  } else {
    const todaySunset = sunsetUtc(today, latDeg, lonDeg);
    if (todaySunset === null) {
      // No sunset on the local date (midnight sun / polar night) → no night.
      return null;
    }
    sunset = todaySunset;
  }
  if (sunset === null) return null;

  const end = nightEnd(sunset, latDeg, lonDeg);
  if (end === null || sunset.getTime() >= end.getTime()) return null;
  return { start: sunset, end };
}

/** The sunrise (UTC) that ENDS the night begun by `sunset`. For eastern
 *  longitudes that dawn shares the sunset's UTC calendar date, but for western
 *  longitudes it falls on the next one — so guard against picking the dawn that
 *  PRECEDES the sunset (which raw `sunriseUtc(sunset)` returns in that case). */
function nightEnd(sunset: Date, latDeg: number, lonDeg: number): Date | null {
  let end = sunriseUtc(sunset, latDeg, lonDeg);
  if (end === null) return null;
  if (end.getTime() <= sunset.getTime()) {
    end = sunriseUtc(addDays(sunset, 1), latDeg, lonDeg);
    if (end === null) return null;
  }
  return end;
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

/** The observer's LOCAL calendar date of `date`, encoded into UTC components so
 *  crossingUtc can read them with its `getUTC*` helpers. For a phone app the
 *  device's local date is the observer's local date (the default offset). */
function dateAt(date: Date, offsetMinutes: number): Date {
  const civil = new Date(date.getTime() + offsetMinutes * 60_000);
  return new Date(
    Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth(), civil.getUTCDate()),
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
