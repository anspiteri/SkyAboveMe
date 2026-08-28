import { renderDashboard } from "../components/Dashboard.ts";

/**
 * Boot the application into the given mount element.
 *
 * The skeleton phase renders a static dashboard shell. Later phases wire in
 * geolocation, satellite data, propagation and the satellite list.
 */
export function bootApp(app: HTMLElement): void {
  renderDashboard(app, { locationLabel: null });
}
