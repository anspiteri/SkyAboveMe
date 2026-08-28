/**
 * A small, hand-curated list of major cities for the manual "Enter location"
 * flow.
 *
 * These provide deliberately *generic* (city-level) coordinates so a user can
 * see what's above a broad region without sharing their precise GPS position.
 * Choosing a city never requires a network call, keeps the location in the
 * browser, and avoids sending a typed query string anywhere (AGENTS.md §18).
 *
 * Free-text place search is a V2 idea (see agents/v2.md).
 */

export interface City {
  /** Display name, e.g. "New York". */
  name: string;
  /** Coarse geodetic latitude, degrees north positive. */
  latitude: number;
  /** Coarse geodetic longitude, degrees east positive. */
  longitude: number;
}

export const CITIES: readonly City[] = [
  { name: "New York", latitude: 40.7128, longitude: -74.006 },
  { name: "London", latitude: 51.5074, longitude: -0.1278 },
  { name: "Paris", latitude: 48.8566, longitude: 2.3522 },
  { name: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
  { name: "Sydney", latitude: -33.8688, longitude: 151.2093 },
  { name: "São Paulo", latitude: -23.5505, longitude: -46.6333 },
  { name: "Cape Town", latitude: -33.9249, longitude: 18.4241 },
  { name: "Moscow", latitude: 55.7558, longitude: 37.6173 },
  { name: "Beijing", latitude: 39.9042, longitude: 116.4074 },
  { name: "Los Angeles", latitude: 34.0522, longitude: -118.2437 },
  { name: "Delhi", latitude: 28.6139, longitude: 77.209 },
  { name: "Nairobi", latitude: -1.2921, longitude: 36.8219 },
];

/** Look up a city by name (case-insensitive). */
export function findCity(name: string): City | null {
  const needle = name.trim().toLowerCase();
  return CITIES.find((city) => city.name.toLowerCase() === needle) ?? null;
}
