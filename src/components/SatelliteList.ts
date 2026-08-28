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
      const count = document.createElement("p");
      count.className = "satellite-list__count";
      count.textContent =
        state.satellites.length === 1
          ? "1 satellite tracked"
          : `${state.satellites.length} satellites tracked`;

      const ul = document.createElement("ul");
      ul.className = "satellite-list__items";

      const positionsByNorad = positionsById(props.positions);
      const visibilityByNorad = visibilityById(props.visibility);

      for (const satellite of state.satellites) {
        ul.append(
          renderItem(satellite, positionsByNorad, visibilityByNorad),
        );
      }

      const wrap = document.createElement("div");
      wrap.append(count, ul);
      return wrap;
    }
  }
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

/** Index observer-relative results by NORAD catalogue number. */
function visibilityById(
  state: VisibilityState,
): Map<number, ObserverRelativeResult> {
  const byId = new Map<number, ObserverRelativeResult>();
  if (state.kind === "ready") {
    for (const result of state.results) {
      byId.set(result.noradId, result);
    }
  }
  return byId;
}

/**
 * Render one satellite row: its label plus its position. When observer-relative
 * results are available show azimuth/elevation/range; otherwise fall back to
 * the propagated ECI position.
 */
function renderItem(
  satellite: Satellite,
  positions: Map<number, PropagateResult>,
  visibility: Map<number, ObserverRelativeResult>,
): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "satellite-list__item";

  const name = document.createElement("span");
  name.className = "satellite-list__name";
  name.textContent = satellite.label;

  li.append(name);

  const observed = visibility.get(satellite.noradId);
  if (observed && observed.status === "ok") {
    const p = observed.position;
    const coord = document.createElement("span");
    coord.className = "satellite-list__position";
    coord.textContent =
      `${formatAzimuth(p.azimuthDeg)} · ${formatElevation(p.elevationDeg)} · ` +
      `${p.rangeKm.toFixed(0)} km`;
    li.append(coord);
    return li;
  }

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
