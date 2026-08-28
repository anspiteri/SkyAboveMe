import type { Satellite } from "../domain/satellite.ts";
import type { PropagationState, VisibilityState } from "../app/state.ts";
import type { PropagateResult } from "../services/satellite-propagation.ts";
import type { ObserverRelativeResult } from "../services/observer-relative.ts";

export type SatelliteListState =
  | { kind: "loading" }
  | { kind: "loaded"; satellites: Satellite[] }
  | { kind: "error"; message: string };

export interface SatelliteListProps {
  state: SatelliteListState;
  /** The computed SGP4 positions; `idle` before the loaded satellites propagate. */
  positions: PropagationState;
  /** Observer-relative azimuth/elevation/range, shown once both are ready. */
  visibility: VisibilityState;
  onRetry: () => void;
}

/**
 * Shows the fetched satellites and their current position from the observer.
 * Once both the observer location and propagated positions are known, each
 * satellite row shows azimuth/elevation/range; until then it falls back to the
 * raw propagated ECI position.
 */
export function renderSatelliteList(
  root: HTMLElement,
  props: SatelliteListProps,
): void {
  root.textContent = "";

  const section = document.createElement("section");
  section.className = "satellite-list";

  const heading = document.createElement("h2");
  heading.className = "satellite-list__heading";
  heading.textContent = "Satellites";

  section.append(heading);
  section.append(bodyFor(props));
  root.append(section);
}

function bodyFor(props: SatelliteListProps): HTMLElement {
  const { state } = props;

  switch (state.kind) {
    case "loading": {
      const p = document.createElement("p");
      p.className = "satellite-list__notice";
      p.textContent = "Loading satellite data…";
      return p;
    }
    case "error": {
      const wrap = document.createElement("div");
      wrap.className = "satellite-list__notice";

      const p = document.createElement("p");
      p.textContent = state.message;

      const retry = document.createElement("button");
      retry.className = "satellite-list__retry";
      retry.type = "button";
      retry.textContent = "Try again";
      retry.addEventListener("click", props.onRetry);

      wrap.append(p, retry);
      return wrap;
    }
    case "loaded": {
      // Once the observer-relative results are ready they are the filtered,
      // above-horizon set: render exactly those in their computed order.
      if (props.visibility.kind === "ready") {
        return visibilityBody(props.visibility.results, state.satellites);
      }

      // Until then, fall back to the raw propagated ECI positions for all
      // satellites while the observer location resolves.
      const count = document.createElement("p");
      count.className = "satellite-list__count";
      count.textContent =
        state.satellites.length === 1
          ? "1 satellite tracked"
          : `${state.satellites.length} satellites tracked`;

      const ul = document.createElement("ul");
      ul.className = "satellite-list__items";

      const positionsByNorad = positionsById(props.positions);

      for (const satellite of state.satellites) {
        ul.append(renderEciItem(satellite, positionsByNorad));
      }

      const wrap = document.createElement("div");
      wrap.append(count, ul);
      return wrap;
    }
  }
}

/**
 * Render the filtered, above-horizon satellite list. Each result has
 * azimuth/elevation/range; if nothing is currently above the horizon an honest
 * empty state is shown rather than fabricated data.
 */
function visibilityBody(
  results: ObserverRelativeResult[],
  satellites: Satellite[],
): HTMLDivElement {
  const wrap = document.createElement("div");

  if (results.length === 0) {
    const p = document.createElement("p");
    p.className = "satellite-list__notice";
    p.textContent = "Nothing above the horizon right now.";
    wrap.append(p);
    return wrap;
  }

  const count = document.createElement("p");
  count.className = "satellite-list__count";
  count.textContent =
    results.length === 1
      ? "1 satellite above the horizon"
      : `${results.length} satellites above the horizon`;

  const satellitesById = new Map<number, Satellite>();
  for (const satellite of satellites) {
    satellitesById.set(satellite.noradId, satellite);
  }

  const ul = document.createElement("ul");
  ul.className = "satellite-list__items";

  for (const result of results) {
    if (result.status !== "ok") continue;
    const satellite = satellitesById.get(result.noradId);
    ul.append(renderVisibilityItem(satellite?.label ?? `#${result.noradId}`, result));
  }

  wrap.append(count, ul);
  return wrap;
}

/** Index successful/skipped propagation results by NORAD catalogue number. */
function positionsById(state: PropagationState): Map<number, PropagateResult> {
  const byId = new Map<number, PropagateResult>();
  if (state.kind === "ready") {
    for (const result of state.results) {
      byId.set(
        result.status === "ok" ? result.position.noradId : result.noradId,
        result,
      );
    }
  }
  return byId;
}

/** Render one ECI-fallback satellite row: label plus current ECI position. */
function renderEciItem(
  satellite: Satellite,
  positions: Map<number, PropagateResult>,
): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "satellite-list__item";

  const name = document.createElement("span");
  name.className = "satellite-list__name";
  name.textContent = satellite.label;

  li.append(name);

  const result = positions.get(satellite.noradId);
  if (result && result.status === "ok") {
    const p = result.position.position;
    const coord = document.createElement("span");
    coord.className = "satellite-list__position";
    coord.textContent = `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) km`;
    li.append(coord);
  }

  return li;
}

/** Render one above-horizon satellite row with az/elevation/range. */
function renderVisibilityItem(
  label: string,
  result: Extract<ObserverRelativeResult, { status: "ok" }>,
): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "satellite-list__item";

  const name = document.createElement("span");
  name.className = "satellite-list__name";
  name.textContent = label;

  const p = result.position;
  const coord = document.createElement("span");
  coord.className = "satellite-list__position";
  coord.textContent =
    `${formatAzimuth(p.azimuthDeg)} · ${formatElevation(p.elevationDeg)} · ` +
    `${p.rangeKm.toFixed(0)} km`;

  li.append(name, coord);
  return li;
}

/** Format a compass azimuth, e.g. "NE (48°)". */
function formatAzimuth(azimuthDeg: number): string {
  const cardinal = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index =
    Math.round(((azimuthDeg % 360 + 360) % 360) / 45) % 8;
  return `${cardinal[index]} ${Math.round(azimuthDeg)}°`;
}

/** Format an elevation as degrees above/below the horizon. */
function formatElevation(elevationDeg: number): string {
  const rounded = Math.round(Math.abs(elevationDeg));
  return elevationDeg < 0
    ? `${rounded}° below horizon`
    : `${rounded}° above horizon`;
}
