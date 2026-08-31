import type { Satellite } from "../domain/satellite.ts";
import type {
  PropagationState,
  VisibilityState,
  SatelliteView,
  SelectedSatellite,
  TonightState,
} from "../app/state.ts";
import type { SatelliteDataSource } from "../services/satellite-data.ts";
import type { PropagateResult } from "../services/satellite-propagation.ts";
import type { ObserverRelativePosition } from "../domain/visibility.ts";
import type { EciVector } from "../domain/satellite.ts";
import type { NextEvent, SatellitePass, BestObservingWindow } from "../domain/tonight.ts";
import { altitudeKm, orbitalPeriodMinutes } from "../astronomy/orbit.ts";

export type SatelliteListState =
  | { kind: "loading" }
  | { kind: "loaded"; satellites: Satellite[]; source: SatelliteDataSource; stale: boolean }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export interface SatelliteListProps {
  state: SatelliteListState;
  /** The computed SGP4 positions; `idle` before the loaded satellites propagate. */
  positions: PropagationState;
  /** Observer-relative azimuth/elevation/range, shown once both are ready. */
  visibility: VisibilityState;
  /** The VISIBLE TONIGHT pass prediction, when available. */
  tonight: TonightState;
  /** Which satellite view ("All tracked" or "VISIBLE TONIGHT") is active. */
  view: SatelliteView;
  /** Whether the user has provided a location. */
  hasLocation: boolean;
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
 * "All tracked" browses the full curated set; "VISIBLE TONIGHT" predicts what
 * will pass above the horizon during the night (sunset → next sunrise), with a
 * best observing window and next-events list.
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
      return loadedBody(props, state.satellites, state.source, state.stale);
    }
  }
}

function loadedBody(
  props: SatelliteListProps,
  satellites: Satellite[],
  source: SatelliteDataSource,
  stale: boolean,
): HTMLDivElement {
  const wrap = document.createElement("div");

  const satellitesById = new Map<number, Satellite>();
  for (const satellite of satellites) {
    satellitesById.set(satellite.noradId, satellite);
  }

  const positionsById = byId(props.positions);
  const visibilityById = visibilityByIdMap(props.visibility);

  const provenance = renderProvenanceNotice(source, stale);
  if (provenance !== null) wrap.append(provenance);
  wrap.append(renderViewToggle(props.view, props.onSetView));

  if (props.view === "all") {
    wrap.append(renderAllView(props, satellites, positionsById, visibilityById));
  } else {
    wrap.append(renderTonightView(props, satellitesById, positionsById));
  }

  return wrap;
}

/** Segmented control switching between the two satellite views. */
function renderViewToggle(view: SatelliteView, onSetView: (v: SatelliteView) => void): HTMLDivElement {
  const toggle = document.createElement("div");
  toggle.className = "satellite-list__toggle";
  toggle.setAttribute("role", "tablist");

  const all = renderToggleButton("All tracked", "all", view === "all", onSetView);
  const visible = renderToggleButton("VISIBLE TONIGHT", "tonight", view === "tonight", onSetView);

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

/**
 * "VISIBLE TONIGHT": a prediction page for the coming night — a live "above
 * you right now" snapshot, the best observing window, a next-events timeline and
 * the per-satellite pass list. All numbers come from the computed summary
 * (AGENTS.md §13, §19b); nothing is fabricated.
 */
function renderTonightView(
  props: SatelliteListProps,
  satellitesById: Map<number, Satellite>,
  positionsById: Map<number, PropagateResult>,
): HTMLDivElement {
  const wrap = document.createElement("div");

  // Live right-now snapshot from the already-computed visibility results.
  const live = props.visibility.kind === "ready" ? props.visibility.results.length : 0;
  wrap.append(renderLiveNow(live, props.hasLocation));

  if (props.tonight.kind === "idle") {
    if (!props.hasLocation) {
      wrap.append(notice("No location set — set a location at the top to predict tonight's passes."));
    } else {
      wrap.append(notice("Calculating tonight's passes…"));
    }
    return wrap;
  }

  if (props.tonight.kind === "no-night") {
    wrap.append(notice("There's no distinct night at this location tonight (polar day/night)."));
    return wrap;
  }

  const { summary } = props.tonight;

  wrap.append(renderWindowBar(summary.window, summary.bestWindow));

  const upcoming = summary.nextEvents;
  if (upcoming.length === 0) {
    wrap.append(notice("No satellite passes are predicted for the rest of tonight."));
  } else {
    wrap.append(renderNextEvents(upcoming, satellitesById));
  }

  wrap.append(
    renderPassList(summary.passes, satellitesById, props.selection, props.onSelect, positionsById),
  );

  return wrap;
}

/** A compact "right now" snapshot shown above the prediction content. */
function renderLiveNow(aboveCount: number, hasLocation: boolean): HTMLDivElement {
  const box = document.createElement("div");
  box.className = "tonight__live";

  const label = document.createElement("span");
  label.className = "tonight__live-label";
  label.textContent = "Right now";

  const value = document.createElement("span");
  value.className = "tonight__live-value";
  value.textContent = !hasLocation
    ? "no location set"
    : aboveCount === 1
      ? "1 satellite above the horizon"
      : `${aboveCount} above the horizon`;

  box.append(label, value);
  return box;
}

/** The night window + best observing window (a suggested time to go outside). */
function renderWindowBar(
  window: { startUtc: Date; endUtc: Date },
  best: BestObservingWindow | null,
): HTMLDivElement {
  const box = document.createElement("div");
  box.className = "tonight__window";

  const night = document.createElement("p");
  night.className = "tonight__window-night";
  night.textContent =
    `NIGHT · ${formatTime(window.startUtc)} – ${formatTime(window.endUtc)}`;

  box.append(night);

  if (best) {
    const bestLine = document.createElement("p");
    bestLine.className = "tonight__window-best";
    bestLine.textContent =
      `Best observing window · ${formatTime(best.startUtc)} – ${formatTime(best.endUtc)} ` +
      `(up to ${best.peakSatellites} satellites at once)`;
    box.append(bestLine);
  }

  return box;
}

/** The chronological next-events list for the rest of the night. */
function renderNextEvents(
  events: NextEvent[],
  satellitesById: Map<number, Satellite>,
): HTMLDivElement {
  const heading = document.createElement("h3");
  heading.className = "tonight__subheading";
  heading.textContent = "Next events";

  const ul = document.createElement("ul");
  ul.className = "tonight__events";

  for (const event of events) {
    const satellite = satellitesById.get(event.noradId);
    const name = satellite ? satellite.label : `#${event.noradId}`;

    const li = document.createElement("li");
    li.className = "tonight__event";

    const time = document.createElement("span");
    time.className = "tonight__event-time";
    time.textContent = formatTime(event.timeUtc);

    const kind = document.createElement("span");
    kind.className = "tonight__event-kind";
    kind.textContent = eventKindLabel(event);

    const sat = document.createElement("span");
    sat.className = "tonight__event-sat";
    sat.textContent = name;

    li.append(time, kind, sat);
    ul.append(li);
  }

  const wrap = document.createElement("div");
  wrap.append(heading, ul);
  return wrap;
}

/** The full list of predicted passes, grouped per morning event for readability. */
function renderPassList(
  passes: SatellitePass[],
  satellitesById: Map<number, Satellite>,
  selection: SelectedSatellite,
  onSelect: (noradId: number | null) => void,
  positionsById: Map<number, PropagateResult>,
): HTMLDivElement {
  const wrap = document.createElement("div");

  const heading = document.createElement("h3");
  heading.className = "tonight__subheading";
  heading.textContent = "Passes";

  const ul = document.createElement("ul");
  ul.className = "satellite-list__items";

  for (const pass of passes) {
    const satellite = satellitesById.get(pass.noradId);
    if (!satellite) continue;
    // Reuse the tap-to-expand row so a pass can open the satellite's detail.
    const live = new Map<number, ObserverRelativePosition>();
    const li = renderSatellitePassRow(
      selection,
      onSelect,
      satellite,
      pass,
      positionsById,
      live,
    );
    ul.append(li);
  }

  wrap.append(heading, ul);
  return wrap;
}

/** One pass rendered as a labelled row; tapping it expands the satellite detail. */
function renderSatellitePassRow(
  selection: SelectedSatellite,
  onSelect: (noradId: number | null) => void,
  satellite: Satellite,
  pass: SatellitePass,
  positionsById: Map<number, PropagateResult>,
  live: Map<number, ObserverRelativePosition>,
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

  const subtitle = document.createElement("span");
  subtitle.className = "satellite-list__sub";
  subtitle.textContent =
    `RISE ${formatTime(pass.riseUtc)} · PEAK ${formatElevation(pass.maxElevationDeg)} at ` +
    `${formatTime(pass.culminationUtc)} · SET ${formatTime(pass.setUtc)}`;

  const chevron = document.createElement("span");
  chevron.className = "satellite-list__chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = selected ? "▾" : "▸";

  const nameCol = document.createElement("span");
  nameCol.className = "satellite-list__name-col";
  const nameCell = document.createElement("span");
  nameCell.className = "satellite-list__name";
  nameCell.textContent = satellite.label;
  nameCol.append(nameCell, subtitle);

  button.append(nameCol, chevron);
  li.append(button);

  if (selected) {
    const position = positionsById.get(satellite.noradId);
    const eci = position && position.status === "ok" ? position.position.position : null;
    li.append(renderDetail(satellite, live.get(satellite.noradId) ?? null, eci));
  }

  return li;
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

  const position = visibilityById.get(satellite.noradId);

  const nameCol = document.createElement("span");
  nameCol.className = "satellite-list__name-col";
  const nameCell = document.createElement("span");
  nameCell.className = "satellite-list__name";
  nameCell.textContent = satellite.label;
  nameCol.append(nameCell);

  const chevron = document.createElement("span");
  chevron.className = "satellite-list__chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = selected ? "▾" : "▸";

  if (position) {
    const valCol = document.createElement("span");
    valCol.className = "satellite-list__val-col";
    const live = document.createElement("span");
    live.className = "satellite-list__live";
    live.textContent =
      `${formatAzimuth(position.azimuthDeg)} · ${Math.round(position.elevationDeg)}° · ` +
      `${position.rangeKm.toFixed(0)} km`;
    valCol.append(live);
    button.append(nameCol, valCol, chevron);
  } else {
    button.append(nameCol, chevron);
  }

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

/**
 * A message shown whenever the displayed positions are NOT derived from current,
 * live orbital elements — so the sky is never silently presented as live when it
 * isn't (AGENTS.md §13, §17). Two tiers:
 *   - fallback snapshot: prominent banner — the data is bundled placeholder, not
 *     live or even fresh-cached, so positions should be treated as approximate.
 *   - stale cache: a slim one-line notice — the data is real but older than the
 *     freshness window, so it may be slightly out of date.
 */
function renderProvenanceNotice(
  source: SatelliteDataSource,
  stale: boolean,
): HTMLElement | null {
  if (source === "fallback") {
    const wrap = document.createElement("div");
    wrap.className = "satellite-list__banner";

    const title = document.createElement("p");
    title.className = "satellite-list__banner-title";
    title.textContent = "Showing placeholder satellite data";

    const body = document.createElement("p");
    body.className = "satellite-list__banner-body";
    body.textContent =
      "We can't reach the live orbital data source right now, so this is a saved " +
      "placeholder — not real live data. Positions are an approximation until live " +
      "data is available again.";

    wrap.append(title, body);
    return wrap;
  }

  if (source === "cache" && stale) {
    return notice(
      "Showing cached orbital data — the live source is unavailable, so positions may be out of date.",
    );
  }

  return null;
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

/** A short present-tense label for a next-event kind. */
function eventKindLabel(event: NextEvent): string {
  switch (event.kind) {
    case "rise":
      return "rise";
    case "set":
      return "set";
    case "culmination":
      return event.maxElevationDeg !== undefined
        ? `peak ${Math.round(event.maxElevationDeg)}°`
        : "peak";
  }
}

/** Format a date as a short local time, e.g. "21:42". */
function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
