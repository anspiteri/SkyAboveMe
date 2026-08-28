import { renderDashboard } from "../components/Dashboard.ts";
import type { AppState, SatelliteView } from "./state.ts";
import { createInitialState } from "./state.ts";
import { getCurrentLocation } from "../services/geolocation.ts";
import { fetchSatelliteData, type SatelliteDataError } from "../services/satellite-data.ts";
import { propagateSatellites } from "../services/satellite-propagation.ts";
import {
  computeObserverRelativePositions,
  filterAboveHorizon,
  rankByVisibility,
} from "../services/observer-relative.ts";

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
      view: state.view,
      selection: state.selection,
      onRetrySatellites: loadSatellites,
      onSelectSatellite: selectSatellite,
      onSetView: setView,
    });
  }

  async function loadSatellites(): Promise<void> {
    state.satellites = { kind: "loading" };
    render();

    const result = await fetchSatelliteData();
    if (result.ok) {
      // A successful but empty response means the proxy reachable but the
      // upstream source (CelesTrak) returned no data — treat it as a temporary
      // outage and show a clear info message rather than an empty sky.
      if (result.satellites.length === 0) {
        state.satellites = { kind: "empty" };
        render();
        return;
      }
      state.satellites = { kind: "loaded", satellites: result.satellites };
      computePositions(result.satellites);
      computeVisibility();
    } else {
      state.satellites = {
        kind: "error",
        message: satelliteDataMessage(result.error),
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
    const all = computeObserverRelativePositions(
      state.location.observer,
      okPositions,
    );
    // Keep only above-horizon results and order them by "most visible / closest
    // right now" so the Visible-now view needs no further sorting.
    state.observerRelative = {
      kind: "ready",
      results: rankByVisibility(filterAboveHorizon(all)),
      computedAt: now.getTime(),
    };
  }

  /**
   * Open (or close) a satellite's detail panel. Single-open: selecting a
   * different satellite collapses the previously expanded one, and tapping the
   * currently-selected satellite collapses it.
   */
  function selectSatellite(noradId: number | null): void {
    if (noradId === null) {
      state.selection = { kind: "none" };
    } else if (
      state.selection.kind === "selected" &&
      state.selection.noradId === noradId
    ) {
      state.selection = { kind: "none" };
    } else {
      state.selection = { kind: "selected", noradId };
    }
    render();
  }

  /** Switch between the "All tracked" and "Visible now" satellite views. */
  function setView(view: SatelliteView): void {
    state.view = view;
    render();
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

/**
 * A clear, human-facing message for a satellite-data fetch failure. Composed in
 * plain language (no error codes) and honest about the likely cause
 * (AGENTS.md §13, §17): the orbital data source is temporary unavailable.
 */
function satelliteDataMessage(error: SatelliteDataError): string {
  switch (error) {
    case "network":
      return "We couldn't reach the satellite data service. This is usually a short-lived network or server problem — try again in a moment.";
    case "server":
      return "The satellite data service hit a problem. This often means the orbital data source (CelesTrak) is temporarily unavailable — try again shortly.";
    case "malformed":
      return "The satellite data came back in an unexpected format, so we couldn't display it. Please try again in a moment.";
  }
}
