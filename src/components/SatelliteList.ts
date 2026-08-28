import type { Satellite } from "../domain/satellite.ts";
import type { PropagationState } from "../app/state.ts";
import type { PropagateResult } from "../services/satellite-propagation.ts";

export type SatelliteListState =
  | { kind: "loading" }
  | { kind: "loaded"; satellites: Satellite[] }
  | { kind: "error"; message: string };

export interface SatelliteListProps {
  state: SatelliteListState;
  /** The computed SGP4 positions; `idle` before the loaded satellites propagate. */
  positions: PropagationState;
  onRetry: () => void;
}

/**
 * Shows the fetched satellites and, once propagated, each satellite's current
 * ECI position. Altitude/azimuth ranking replaces the raw coordinates in later
 * phases.
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

      for (const satellite of state.satellites) {
        ul.append(renderItem(satellite, positionsByNorad));
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

/** Render one satellite row: label plus its current ECI position when known. */
function renderItem(
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
