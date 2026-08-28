import type {
  SatelliteDataState,
  PropagationState,
  VisibilityState,
  SatelliteView,
  SelectedSatellite,
} from "../app/state.ts";
import type { LocationStatusState } from "./LocationStatus.ts";
import { renderLocationStatus } from "./LocationStatus.ts";
import { renderSatelliteList } from "./SatelliteList.ts";

export interface DashboardProps {
  /** The current location-acquisition status. */
  location: LocationStatusState;
  /** The fetched satellite data state. */
  satellites: SatelliteDataState;
  /** The computed SGP4 positions for the loaded satellites. */
  positions: PropagationState;
  /** The observer-relative (azimuth/elevation/range) results, when available. */
  visibility: VisibilityState;
  /** Which satellite view ("All tracked" or "Visible now") is active. */
  view: SatelliteView;
  /** The satellite (if any) whose detail panel is expanded. */
  selection: SelectedSatellite;
  /** Invoked when the user asks to retry loading satellite data. */
  onRetrySatellites: () => void;
  /** Invoked when a satellite row is tapped to expand/collapse its detail. */
  onSelectSatellite: (noradId: number | null) => void;
  /** Invoked when the user switches satellite view. */
  onSetView: (view: SatelliteView) => void;
}

/** The single scrollable dashboard shell. */
export function renderDashboard(root: HTMLElement, props: DashboardProps): void {
  root.textContent = "";

  const container = document.createElement("main");
  container.className = "dashboard";

  const header = document.createElement("header");
  header.className = "dashboard__header";

  const title = document.createElement("h1");
  title.className = "dashboard__title";
  title.textContent = "Sky Above Me";

  const subtitle = document.createElement("p");
  subtitle.className = "dashboard__subtitle";
  subtitle.textContent = "What's above you right now?";

  header.append(title, subtitle);

  const status = document.createElement("div");
  status.className = "dashboard__status";
  renderLocationStatus(status, { location: props.location });

  const list = document.createElement("div");
  renderSatelliteList(list, {
    state: props.satellites,
    positions: props.positions,
    visibility: props.visibility,
    onRetry: props.onRetrySatellites,
    view: props.view,
    selection: props.selection,
    onSelect: props.onSelectSatellite,
    onSetView: props.onSetView,
  });

  container.append(header, status, list);
  root.append(container);
}
