import type { LocationStatusState } from "./LocationStatus.ts";
import { renderLocationStatus } from "./LocationStatus.ts";

export interface DashboardProps {
  /** The current location-acquisition status. */
  location: LocationStatusState;
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

  container.append(header, status);
  root.append(container);
}
