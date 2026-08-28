import { renderDashboard } from "../components/Dashboard.ts";
import type { AppState } from "./state.ts";
import { createInitialState } from "./state.ts";
import { getCurrentLocation } from "../services/geolocation.ts";
import { fetchSatelliteData } from "../services/satellite-data.ts";

/**
 * Boot the application into the given mount element.
 *
 * Requests the browser geolocation once and fetches the curated satellite data,
 * then re-renders the dashboard as each resolves. The precise position stays in
 * the browser; only a status is rendered. Satellite data failures surface a
 * retryable error rather than fake data.
 */
export function bootApp(app: HTMLElement): void {
  const state: AppState = createInitialState();

  function render(): void {
    renderDashboard(app, {
      location: state.location,
      satellites: state.satellites,
      onRetrySatellites: loadSatellites,
    });
  }

  async function loadSatellites(): Promise<void> {
    state.satellites = { kind: "loading" };
    render();

    const result = await fetchSatelliteData();
    if (result.ok) {
      state.satellites = { kind: "loaded", satellites: result.satellites };
    } else {
      state.satellites = {
        kind: "error",
        message: `Couldn't load satellite data (${result.error}).`,
      };
    }
    render();
  }

  void getCurrentLocation().then((result) => {
    state.location = result.ok
      ? { kind: "acquired", observer: result.observer }
      : { kind: "error", error: result.error };
    render();
  });

  void loadSatellites();
}
