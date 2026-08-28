import { renderDashboard } from "../components/Dashboard.ts";
import type { AppState } from "./state.ts";
import { createInitialState } from "./state.ts";
import { getCurrentLocation } from "../services/geolocation.ts";

/**
 * Boot the application into the given mount element.
 *
 * Requests the browser geolocation once and updates the dashboard with the
 * result. The precise position stays in the browser; only a status is rendered.
 */
export function bootApp(app: HTMLElement): void {
  const state: AppState = createInitialState();
  renderDashboard(app, { location: state.location });

  void getCurrentLocation().then((result) => {
    if (result.ok) {
      state.location = { kind: "acquired", observer: result.observer };
    } else {
      state.location = { kind: "error", error: result.error };
    }
    renderDashboard(app, { location: state.location });
  });
}
