// Curated satellite catalog for Sky Above Me V1.
//
// The app answers "what's above me, and what's worth seeing?" It therefore
// tracks a small, hand-picked set of well-known satellites rather than the
// entire ~10k-object NORAD catalogue. This keeps V1 lightweight and keeps the
// dashboard focused on objects people have actually heard of.
//
// Each entry is identified by its NORAD catalogue number (SATCAT), which is
// the stable key used to fetch fresh orbital elements from CelesTrak:
//   https://celestrak.org/NORAD/elements/gp.php?CATNR=<id>&FORMAT=OMM
//
// The display name for a satellite comes from the live CelesTrak OMM data
// (OBJECT_NAME). `label` below is a short, human-friendly fallback used only
// where a friendlier name improves the UI; it must never be treated as the
// authoritative source of the object's identity.

export interface CuratedSatellite {
  /** NORAD catalogue number (SATCAT) used to query CelesTrak. */
  noradId: number;
  /** Short display label shown in the dashboard, e.g. "ISS". */
  label: string;
  /** One-line description shown when the satellite is selected. */
  description: string;
}

/** Hand-curated list of notable satellites worth surfacing in V1. */
export const CURATED_CATALOG: readonly CuratedSatellite[] = [
  {
    noradId: 25544,
    label: "ISS",
    description: "International Space Station — the brightest object in the night sky after the Moon.",
  },
  {
    noradId: 48274,
    label: "Tiangong",
    description: "China's CSS space station; the second-brightest station, faintly rivaling Jupiter.",
  },
  {
    noradId: 20580,
    label: "Hubble",
    description: "Hubble Space Telescope at ~540 km; visible to the naked eye from twilight skies.",
  },
  {
    noradId: 25994,
    label: "Terra",
    description: "Earth-observation mission; a steady point often seen in mid-morning twilight.",
  },
  {
    noradId: 27424,
    label: "Aqua",
    description: "NASA Earth-monitoring satellite flying in the same orbit family as Terra.",
  },
  {
    noradId: 27386,
    label: "Envisat",
    description: "Largest object of human debris; defunct but still tracked closely.",
  },
  {
    noradId: 43013,
    label: "NOAA-20",
    description: "JPSS weather satellite providing forecasts and environmental data.",
  },
  {
    noradId: 33591,
    label: "NOAA-19",
    description: "Polar-orbiting weather satellite returning high-res cloud imagery.",
  },
  {
    noradId: 37849,
    label: "Suomi NPP",
    description: "The satellite behind the famous 'Blue Marble' night-view imagery.",
  },
  {
    noradId: 39084,
    label: "Landsat 8",
    description: "USGS/NASA Earth-observation satellite monitoring land cover.",
  },
  {
    noradId: 49260,
    label: "Landsat 9",
    description: "Latest Landsat; continues the longest continuous Earth record.",
  },
  {
    noradId: 38771,
    label: "MetOp-B",
    description: "European polar-orbiting weather satellite for global forecasting.",
  },
];

/** Convenience lookup by NORAD catalogue number. */
export function getCuratedSatellite(noradId: number): CuratedSatellite | undefined {
  return CURATED_CATALOG.find((sat) => sat.noradId === noradId);
}

/** The NORAD catalogue numbers we need orbital data for. */
export const CURATED_NORAD_IDS: readonly number[] = CURATED_CATALOG.map(
  (sat) => sat.noradId,
);
