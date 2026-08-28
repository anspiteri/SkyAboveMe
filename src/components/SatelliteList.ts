import type { Satellite } from "../domain/satellite.ts";

export type SatelliteListState =
  | { kind: "loading" }
  | { kind: "loaded"; satellites: Satellite[] }
  | { kind: "error"; message: string };

export interface SatelliteListProps {
  state: SatelliteListState;
  onRetry: () => void;
}

/**
 * Shows the fetched satellites. Phase 3 renders names/counts only; per-satellite
 * positions and ranking are added in later phases.
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

      for (const satellite of state.satellites) {
        const li = document.createElement("li");
        li.className = "satellite-list__item";
        li.textContent = satellite.label;
        ul.append(li);
      }

      const wrap = document.createElement("div");
      wrap.append(count, ul);
      return wrap;
    }
  }
}
