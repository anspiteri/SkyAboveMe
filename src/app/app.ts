import { renderDashboard } from "../components/Dashboard.ts";
import type {
  AppState,
  SatelliteView,
} from "./state.ts";
import { createInitialState } from "./state.ts";
import type { PermissionState } from "../components/LocationStatus.ts";
import { getCurrentLocation, queryGeolocationPermission } from "../services/geolocation.ts";
import { fetchSatelliteData, type SatelliteDataError } from "../services/satellite-data.ts";
import { propagateSatellites } from "../services/satellite-propagation.ts";
import {
  computeObserverRelativePositions,
  filterAboveHorizon,
  rankByVisibility,
} from "../services/observer-relative.ts";
import { computeTonightSummary } from "../services/tonight.ts";
import { resolveManualLocation, type ManualLocationInput } from "../domain/location.ts";

/**
 * Boot the application into the given mount element.
 *
 * Location is OPTIONAL and is never requested at boot: the app is fully usable in
 * the "All tracked" view without it. The user opts in when ready — via the browser
 * GPS prompt or by entering a (generic) location manually. The precise position is
 * fetched at most once and kept only in browser memory (AGENTS.md §4, §12, §18).
 * Satellite data is fetched independently of location.
 */
export function bootApp(app: HTMLElement): void {
  const state: AppState = createInitialState();
  // Browser-reported geolocation permission (inspect-only; never triggers a
  // prompt). Kept here rather than in AppState to avoid churn on every render.
  let permission: PermissionState = null;

  void queryGeolocationPermission().then((p) => {
    permission = p;
    render();
  });

  function render(): void {
    renderDashboard(app, {
      location: state.location,
      locationEntry: state.locationEntry,
      permission,
      satellites: state.satellites,
      positions: state.positions,
      visibility: state.observerRelative,
      tonight: state.tonight,
      view: state.view,
      selection: state.selection,
      onRetrySatellites: loadSatellites,
      onSelectSatellite: selectSatellite,
      onSetView: setView,
      onUseGpsLocation: useGpsLocation,
      onSubmitLocation: submitLocation,
      onOpenLocationEntry: openLocationEntry,
      onCloseLocationEntry: closeLocationEntry,
      onChangeLocation: changeLocation,
    });
  }

  /** Request the browser's GPS position, but only once per explicit action. */
  function useGpsLocation(): void {
    if (state.location.kind === "acquired" || state.location.kind === "acquiring") {
      return;
    }
    state.location = { kind: "acquiring" };
    render();

    void getCurrentLocation().then((result) => {
      state.location = result.ok
        ? { kind: "acquired", observer: result.observer, source: "gps" }
        : { kind: "error", error: result.error };
      computeVisibility();
      computeTonight();
      render();
    });
  }

  /** Set a manual (generic/coarse) location from a city or typed coordinates. */
  function submitLocation(input: ManualLocationInput): void {
    if (input.kind === "city" && input.name.trim() === "") return;
    const observer = resolveManualLocation(input, new Date());
    if (observer === null) return;
    state.location = { kind: "acquired", observer, source: "manual" };
    state.locationEntry = { kind: "closed" };
    computeVisibility();
    computeTonight();
    render();
  }

  function openLocationEntry(): void {
    state.locationEntry = { kind: "choosing" };
    render();
  }

  function closeLocationEntry(): void {
    state.locationEntry = { kind: "closed" };
    render();
  }

  /**
   * Clear a previously set location so the user can provide a different one.
   * Resets the visibility results so the "Visible now" view no longer claims a
   * position it no longer has.
   */
  function changeLocation(): void {
    state.location = { kind: "idle" };
    state.observerRelative = { kind: "idle" };
    state.tonight = { kind: "idle" };
    render();
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
      computeTonight();
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
   * Compute the VISIBLE TONIGHT pass prediction for the loaded satellites at
   * the current location. Runs once both are available; expensive (searches
   * time across the night) so it is only recomputed when location or the
   * satellite set changes, not on every render.
   */
  function computeTonight(): void {
    if (state.location.kind !== "acquired") return;
    if (state.satellites.kind !== "loaded") return;

    const summary = computeTonightSummary(
      state.satellites.satellites,
      state.location.observer,
      new Date(),
    );
    state.tonight =
      summary === null
        ? { kind: "no-night" }
        : { kind: "ready", summary };
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

  /** Switch between the "All tracked" and "VISIBLE TONIGHT" satellite views. */
  function setView(view: SatelliteView): void {
    state.view = view;
    render();
  }

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
      return "The orbital data source (CelesTrak) is busy or temporarily unavailable, so satellite data is paused for a few minutes. We cache data and back off automatically, so just try again shortly.";
    case "malformed":
      return "The satellite data came back in an unexpected format, so we couldn't display it. Please try again in a moment.";
  }
}
