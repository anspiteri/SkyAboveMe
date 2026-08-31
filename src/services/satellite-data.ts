import type { Satellite, SatelliteElements } from "../domain/satellite.ts";

/**
 * Fetches satellite orbital data from the serverless proxy.
 *
 * The proxy (`/api/satellites`) returns ready-to-use domain `Satellite[]`
 * objects, so the browser never parses raw orbital data directly. This module
 * only retrieves and validates the response shape, and never sends the
 * observer's location anywhere (AGENTS.md §4).
 */

export type SatelliteDataError = "network" | "server" | "malformed";

export type SatelliteDataSource = "celestrak" | "cache" | "fallback";

export type SatelliteDataResult =
  | { ok: true; satellites: Satellite[]; source: SatelliteDataSource; stale: boolean }
  | { ok: false; error: SatelliteDataError };

const API_PATH = "/api/satellites";
/** How long the browser waits for the proxy before giving up. This bounds the
 * loading/banner delay even if the proxy or CelesTrak hangs, so an outage is
 * surfaced promptly (~7 s) instead of tying up the UI indefinitely. */
export const FETCH_TIMEOUT_MS = 7_000;

/**
 * Retrieve the curated satellite orbital data, if the proxy is reachable.
 * Never throws; returns a tagged result instead. An abort (timeout) is treated
 * as a network failure so the outage banner appears.
 */
export async function fetchSatelliteData(): Promise<SatelliteDataResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(API_PATH, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch {
    return { ok: false, error: "network" };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    return { ok: false, error: "server" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: "malformed" };
  }

  const satellites = parseSatelliteList(payload);
  if (satellites === null) {
    return { ok: false, error: "malformed" };
  }

  const source: SatelliteDataSource =
    (response.headers.get("X-Satellite-Data-Source") as SatelliteDataSource) ??
    "celestrak";
  const stale = response.headers.get("X-Satellite-Data-Stale") === "true";

  return { ok: true, satellites, source, stale };
}

/** Lightweight validator: any record missing a required field is discarded. */
function parseSatelliteList(payload: unknown): Satellite[] | null {
  if (!Array.isArray(payload)) return null;

  const satellites: Satellite[] = [];
  for (const item of payload) {
    const satellite = parseSatellite(item);
    if (satellite !== null) satellites.push(satellite);
  }
  return satellites;
}

function parseSatellite(value: unknown): Satellite | null {
  if (typeof value !== "object" || value === null) return null;
  const rec = value as Record<string, unknown>;

  const noradId = rec.noradId;
  const name = rec.name;
  const label = rec.label;
  const elements = rec.elements;

  if (
    typeof noradId !== "number" ||
    typeof name !== "string" ||
    typeof label !== "string" ||
    typeof elements !== "object" ||
    elements === null
  ) {
    return null;
  }

  const parsedElements = parseElements(elements as Record<string, unknown>);
  if (parsedElements === null) return null;

  return {
    noradId,
    name,
    label,
    description: typeof rec.description === "string" ? rec.description : null,
    elements: parsedElements,
  };
}

function parseElements(value: Record<string, unknown>): SatelliteElements | null {
  const required: Array<keyof SatelliteElements> = [
    "epoch",
    "meanMotionRevPerDay",
    "eccentricity",
    "inclinationDeg",
    "raOfAscNodeDeg",
    "argOfPericenterDeg",
    "meanAnomalyDeg",
  ];

  for (const key of required) {
    const v = value[key];
    if (typeof v !== "number" && !(key === "epoch" && typeof v === "string")) {
      return null;
    }
  }

  return {
    epoch: value.epoch as string,
    meanMotionRevPerDay: value.meanMotionRevPerDay as number,
    eccentricity: value.eccentricity as number,
    inclinationDeg: value.inclinationDeg as number,
    raOfAscNodeDeg: value.raOfAscNodeDeg as number,
    argOfPericenterDeg: value.argOfPericenterDeg as number,
    meanAnomalyDeg: value.meanAnomalyDeg as number,
    bstar: asNumber(value.bstar),
    meanMotionDot: asNumber(value.meanMotionDot),
    meanMotionDdot: asNumber(value.meanMotionDdot),
  };
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
