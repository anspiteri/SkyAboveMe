import type { SatelliteDataState, PropagationState } from "../app/state.ts";
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
  /** Invoked when the user asks to retry loading satellite data. */
  onRetrySatellites: () => void;
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
    onRetry: props.onRetrySatellites,
  });

  container.append(header, status, list);
  root.append(container);
}
