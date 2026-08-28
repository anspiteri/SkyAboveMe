import type { Satellite } from "../domain/satellite.ts";
import type {
  PropagationState,
  VisibilityState,
  SatelliteView,
  SelectedSatellite,
} from "../app/state.ts";
import type { PropagateResult } from "../services/satellite-propagation.ts";
import type { ObserverRelativePosition } from "../domain/visibility.ts";
import type { EciVector } from "../domain/satellite.ts";
import { altitudeKm, orbitalPeriodMinutes } from "../astronomy/orbit.ts";

export type SatelliteListState =
  | { kind: "loading" }
  | { kind: "loaded"; satellites: Satellite[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export interface SatelliteListProps {
  state: SatelliteListState;
  /** The computed SGP4 positions; `idle` before the loaded satellites propagate. */
  positions: PropagationState;
  /** Observer-relative azimuth/elevation/range, shown once both are ready. */
  visibility: VisibilityState;
  /** Which satellite view ("All tracked" or "Visible now") is active. */
  view: SatelliteView;
  /** The satellite (if any) whose detail panel is expanded. */
  selection: SelectedSatellite;
  onRetry: () => void;
  /** Open/close a satellite's detail panel (tap on a row). */
  onSelect: (noradId: number | null) => void;
  /** Switch between the two satellite views. */
  onSetView: (view: SatelliteView) => void;
}

/**
 * Shows the tracked satellites. Two views share the same tap-to-expand detail:
 * "All tracked" browses the full curated set; "Visible now" shows only satellites
 * above the horizon, ranked by how visible / how close they are right now.
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
      return notice("Loading satellite data…");
    }
    case "error": {
      return renderInfoBanner({
        title: "Couldn't load satellite data",
        body: state.message,
        onRetry: props.onRetry,
      });
    }
    case "empty": {
      return renderInfoBanner({
        title: "Orbital data is temporarily unavailable",
        body:
          "The satellite data service responded but returned no satellites, which " +
          "usually means the orbital data source (CelesTrak) is unreachable right " +
          "now. Try again shortly.",
        onRetry: props.onRetry,
      });
    }
    case "loaded": {
      return loadedBody(props, state.satellites);
    }
  }
}

function loadedBody(
  props: SatelliteListProps,
  satellites: Satellite[],
): HTMLDivElement {
  const wrap = document.createElement("div");

  const satellitesById = new Map<number, Satellite>();
  for (const satellite of satellites) {
    satellitesById.set(satellite.noradId, satellite);
  }

  const positionsById = byId(props.positions);
  const visibilityById = visibilityByIdMap(props.visibility);

  wrap.append(renderViewToggle(props.view, props.onSetView));

  if (props.view === "all") {
    wrap.append(renderAllView(props, satellites, positionsById, visibilityById));
  } else {
    wrap.append(renderVisibleView(props, satellitesById, positionsById));
  }

  return wrap;
}

/** Segmented control switching between the two satellite views. */
function renderViewToggle(view: SatelliteView, onSetView: (v: SatelliteView) => void): HTMLDivElement {
  const toggle = document.createElement("div");
  toggle.className = "satellite-list__toggle";
  toggle.setAttribute("role", "tablist");

  const all = renderToggleButton("All tracked", "all", view === "all", onSetView);
  const visible = renderToggleButton("Visible now", "visible", view === "visible", onSetView);

  toggle.append(all, visible);
  return toggle;
}

function renderToggleButton(
  label: string,
  value: SatelliteView,
  active: boolean,
  onSetView: (v: SatelliteView) => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "satellite-list__toggle-btn";
  button.textContent = label;
  button.setAttribute("role", "tab");
  button.setAttribute("aria-selected", active ? "true" : "false");
  if (active) button.dataset.active = "true";
  button.addEventListener("click", () => onSetView(value));
  return button;
}

/** "All tracked": browse the full curated set with tap-to-expand detail. */
function renderAllView(
  props: SatelliteListProps,
  satellites: Satellite[],
  positionsById: Map<number, PropagateResult>,
  visibilityById: Map<number, ObserverRelativePosition>,
): HTMLDivElement {
  const wrap = document.createElement("div");

  const count = document.createElement("p");
  count.className = "satellite-list__count";
  count.textContent =
    satellites.length === 1
      ? "1 satellite tracked"
      : `${satellites.length} satellites tracked`;

  const ul = document.createElement("ul");
  ul.className = "satellite-list__items";

  for (const satellite of satellites) {
    ul.append(
      renderRow(props.selection, props.onSelect, satellite, positionsById, visibilityById),
    );
  }

  wrap.append(count, ul);
  return wrap;
}

/** "Visible now": only above-horizon results, ranked by visibility, with detail. */
function renderVisibleView(
  props: SatelliteListProps,
  satellitesById: Map<number, Satellite>,
  positionsById: Map<number, PropagateResult>,
): HTMLDivElement {
  const wrap = document.createElement("div");

  if (props.visibility.kind !== "ready") {
    wrap.append(notice("Calculating what's visible right now…"));
    return wrap;
  }

  const results = props.visibility.results;
  if (results.length === 0) {
    wrap.append(notice("Nothing above the horizon right now."));
    return wrap;
  }

  const count = document.createElement("p");
  count.className = "satellite-list__count";
  count.textContent =
    results.length === 1
      ? "1 satellite above the horizon"
      : `${results.length} satellites above the horizon`;

  const ul = document.createElement("ul");
  ul.className = "satellite-list__items";

  for (const result of results) {
    if (result.status !== "ok") continue;
    const satellite = satellitesById.get(result.noradId);
    if (!satellite) continue;
    // The result's own position is the live above-horizon position.
    const live = new Map<number, ObserverRelativePosition>([
      [result.noradId, result.position],
    ]);
    ul.append(
      renderRow(props.selection, props.onSelect, satellite, positionsById, live),
    );
  }

  wrap.append(count, ul);
  return wrap;
}

/** Render one tappable satellite row (with chevron), plus its detail when open. */
function renderRow(
  selection: SelectedSatellite,
  onSelect: (noradId: number | null) => void,
  satellite: Satellite,
  positionsById: Map<number, PropagateResult>,
  visibilityById: Map<number, ObserverRelativePosition>,
): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "satellite-list__item";

  const selected = selection.kind === "selected" && selection.noradId === satellite.noradId;
  if (selected) li.dataset.expanded = "true";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "satellite-list__tap";
  button.setAttribute("aria-expanded", selected ? "true" : "false");
  button.addEventListener("click", () =>
    onSelect(selected ? null : satellite.noradId));

  const name = document.createElement("span");
  name.className = "satellite-list__name";
  name.textContent = satellite.label;

  const position = visibilityById.get(satellite.noradId);
  const subtitle = document.createElement("span");
  subtitle.className = "satellite-list__sub";
  if (position) {
    subtitle.textContent =
      `${formatAzimuth(position.azimuthDeg)} · ${formatElevation(position.elevationDeg)} · ` +
      `${position.rangeKm.toFixed(0)} km`;
  }

  const chevron = document.createElement("span");
  chevron.className = "satellite-list__chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = selected ? "▾" : "▸";

  const textWrap = document.createElement("span");
  textWrap.className = "satellite-list__text";
  textWrap.append(name);
  if (position) textWrap.append(subtitle);

  button.append(textWrap, chevron);
  li.append(button);

  if (selected) {
    const position = positionsById.get(satellite.noradId);
    const eci = position && position.status === "ok" ? position.position.position : null;
    li.append(
      renderDetail(
        satellite,
        visibilityById.get(satellite.noradId) ?? null,
        eci,
      ),
    );
  }

  return li;
}

/** The expanded detail panel: identity, curated description and orbit facts. */
function renderDetail(
  satellite: Satellite,
  live: ObserverRelativePosition | null,
  eci: EciVector | null,
): HTMLDivElement {
  const detail = document.createElement("div");
  detail.className = "satellite-list__detail";

  const fullName = document.createElement("p");
  fullName.className = "satellite-list__detail-name";
  fullName.textContent = satellite.name;

  detail.append(fullName);

  if (satellite.description) {
    const desc = document.createElement("p");
    desc.className = "satellite-list__detail-desc";
    desc.textContent = satellite.description;
    detail.append(desc);
  }

  const list = document.createElement("dl");
  list.className = "satellite-list__facts";

  addFact(list, "Altitude", eci !== null ? `${altitudeKm(eci).toFixed(0)} km` : "—");
  addFact(list, "Period", `${orbitalPeriodMinutes(satellite.elements.meanMotionRevPerDay).toFixed(1)} min`);
  addFact(list, "Inclination", `${satellite.elements.inclinationDeg.toFixed(1)}°`);
  addFact(list, "NORAD", `#${satellite.noradId}`);

  if (live) {
    addFact(list, "Azimuth", formatAzimuth(live.azimuthDeg));
    addFact(list, "Elevation", formatElevation(live.elevationDeg));
    addFact(list, "Range", `${live.rangeKm.toFixed(0)} km`);
  }

  detail.append(list);
  return detail;
}

function addFact(dl: HTMLDListElement, term: string, value: string): void {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.textContent = value;
  dl.append(dt, dd);
}

/** Short helper for the various muted one-line notices. */
function notice(text: string): HTMLParagraphElement {
  const p = document.createElement("p");
  p.className = "satellite-list__notice";
  p.textContent = text;
  return p;
}

/** Index propagation results by NORAD catalogue number. */
function byId(state: PropagationState): Map<number, PropagateResult> {
  const map = new Map<number, PropagateResult>();
  if (state.kind === "ready") {
    for (const result of state.results) {
      map.set(
        result.status === "ok" ? result.position.noradId : result.noradId,
        result,
      );
    }
  }
  return map;
}

/** Index above-horizon visibility positions by NORAD catalogue number. */
function visibilityByIdMap(state: VisibilityState): Map<number, ObserverRelativePosition> {
  const map = new Map<number, ObserverRelativePosition>();
  if (state.kind === "ready") {
    for (const result of state.results) {
      if (result.status === "ok") map.set(result.noradId, result.position);
    }
  }
  return map;
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

interface InfoBannerProps {
  title: string;
  body: string;
  onRetry: () => void;
}

/**
 * A clear, self-explanatory info/outage banner with a title, a plain-language
 * explanation and a retry action. Used for both hard fetch errors and the
 * "no data returned" (upstream outage) case so the user always sees why the
 * sky is empty and how to try again (AGENTS.md §13, §17).
 */
function renderInfoBanner(props: InfoBannerProps): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "satellite-list__banner";

  const title = document.createElement("p");
  title.className = "satellite-list__banner-title";
  title.textContent = props.title;

  const body = document.createElement("p");
  body.className = "satellite-list__banner-body";
  body.textContent = props.body;

  const retry = document.createElement("button");
  retry.className = "satellite-list__retry";
  retry.type = "button";
  retry.textContent = "Try again";
  retry.addEventListener("click", props.onRetry);

  wrap.append(title, body, retry);
  return wrap;
}
