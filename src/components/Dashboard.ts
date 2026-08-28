export interface DashboardProps {
  /** The user's current location, or null until geolocation resolves. */
  locationLabel: string | null;
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
  subtitle.textContent =
    props.locationLabel === null
      ? "Finding your location…"
      : `Above ${props.locationLabel}`;

  header.append(title, subtitle);
  container.append(header);
  root.append(container);
}
