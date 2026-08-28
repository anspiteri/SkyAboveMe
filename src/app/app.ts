import { renderDashboard } from "../components/Dashboard.ts";
import type { AppState } from "./state.ts";
import { createInitialState } from "./state.ts";
import { getCurrentLocation } from "../services/geolocation.ts";
import { fetchSatelliteData } from "../services/satellite-data.ts";
import { propagateSatellites } from "../services/satellite-propagation.ts";
import { computeObserverRelativePositions } from "../services/observer-relative.ts";

/**
 * Boot the application into the given mount element.
 *
 * Requests the browser geolocation once, fetches the curated satellite data,
 * then propagates the satellites to the current instant with SGP4, re-rendering
 * the dashboard as each stage resolves. The precise position stays in the
 * browser; only a status is rendered. Failures degrade gracefully (retry for
 * data, per-satellite skips for propagation).
 */
export function bootApp(app: HTMLElement): void {
  const state: AppState = createInitialState();

  function render(): void {
    renderDashboard(app, {
      location: state.location,
      satellites: state.satellites,
      positions: state.positions,
      visibility: state.observerRelative,
      onRetrySatellites: loadSatellites,
    });
  }

  async function loadSatellites(): Promise<void> {
    state.satellites = { kind: "loading" };
    render();

    const result = await fetchSatelliteData();
    if (result.ok) {
      state.satellites = { kind: "loaded", satellites: result.satellites };
      computePositions(result.satellites);
      computeVisibility();
    } else {
      state.satellites = {
        kind: "error",
        message: `Couldn't load satellite data (${result.error}).`,
      };
    }
    render();
  }

  function computePositions(satellites: NonNullable<
    Extract<AppState["satellites"], { kind: "loaded" }>["satellites"]
  >): void {
    const now = new Date();
    const results = propagateSatellites(satellites, now);
    state.positions = {
      kind: "ready",
      results,
      computedAt: now.getTime(),
    };
  }

  /**
   * Turn the propagated ECI positions into observer-relative azimuth/elevation/
   * range results. Does nothing until the observer location has been acquired
   * and the satellites have propagated.
   */
  function computeVisibility(): void {
    if (state.location.kind !== "acquired") return;
    if (state.positions.kind !== "ready") return;

    const okPositions = state.positions.results
      .filter((r): r is Extract<typeof r, { status: "ok" }> => r.status === "ok")
      .map((r) => r.position);

    const now = new Date();
    state.observerRelative = {
      kind: "ready",
      results: computeObserverRelativePositions(
        state.location.observer,
        okPositions,
      ),
      computedAt: now.getTime(),
    };
  }

  void getCurrentLocation().then((result) => {
    state.location = result.ok
      ? { kind: "acquired", observer: result.observer }
      : { kind: "error", error: result.error };
    computeVisibility();
    render();
  });

  void loadSatellites();
}
