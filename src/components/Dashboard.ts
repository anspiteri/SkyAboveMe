import type {
  SatelliteDataState,
  PropagationState,
  VisibilityState,
  SatelliteView,
  SelectedSatellite,
  LocationEntryState,
  TonightState,
} from "../app/state.ts";
import type { LocationStatusState, PermissionState } from "./LocationStatus.ts";
import type { ManualLocationInput } from "../domain/location.ts";
import { renderLocationStatus } from "./LocationStatus.ts";
import { renderSatelliteList } from "./SatelliteList.ts";

/** Interval id backing the header's live system clock. Recreated on each render. */
let clockTimer: number | undefined;

function formatClock(date: Date): { utc: string; local: string } {
  const hh = (n: number) => String(n).padStart(2, "0");
  return {
    utc: `${hh(date.getUTCHours())}:${hh(date.getUTCMinutes())}:${hh(date.getUTCSeconds())}`,
    local: `${hh(date.getHours())}:${hh(date.getMinutes())}:${hh(date.getSeconds())}`,
  };
}

export interface DashboardProps {
  /** The current location status (optional until the user provides one). */
  location: LocationStatusState;
  /** Whether the manual "Enter location" form is open. */
  locationEntry: LocationEntryState;
  /** Browser-reported geolocation permission, if knowable. */
  permission: PermissionState;
  /** The fetched satellite data state. */
  satellites: SatelliteDataState;
  /** The computed SGP4 positions for the loaded satellites. */
  positions: PropagationState;
  /** The observer-relative (azimuth/elevation/range) results, when available. */
  visibility: VisibilityState;
  /** The VISIBLE TONIGHT pass prediction, when available. */
  tonight: TonightState;
  /** Which satellite view ("All tracked" or "VISIBLE TONIGHT") is active. */
  view: SatelliteView;
  /** The satellite (if any) whose detail panel is expanded. */
  selection: SelectedSatellite;
  /** Invoked when the user asks to retry loading satellite data. */
  onRetrySatellites: () => void;
  /** Invoked when a satellite row is tapped to expand/collapse its detail. */
  onSelectSatellite: (noradId: number | null) => void;
  /** Invoked when the user switches satellite view. */
  onSetView: (view: SatelliteView) => void;
  /** Use the browser's GPS position (only on explicit user action). */
  onUseGpsLocation: () => void;
  /** Set a manual (generic) location from a city or typed coordinates. */
  onSubmitLocation: (input: ManualLocationInput) => void;
  onOpenLocationEntry: () => void;
  onCloseLocationEntry: () => void;
  /** Clear the current location so a different one can be provided. */
  onChangeLocation: () => void;
}

/** The single scrollable dashboard shell. */
export function renderDashboard(root: HTMLElement, props: DashboardProps): void {
  if (clockTimer !== undefined) {
    clearInterval(clockTimer);
    clockTimer = undefined;
  }
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
  subtitle.textContent = "Local observation system";

  header.append(title, subtitle);

  const clock = document.createElement("p");
  clock.className = "dashboard__clock";
  const tick = (): void => {
    const { utc, local } = formatClock(new Date());
    clock.textContent = `✶ SYS ${utc} UTC · ${local} LOCAL`;
  };
  tick();
  clockTimer = setInterval(tick, 1000);
  header.append(clock);

  const status = document.createElement("div");
  status.className = "dashboard__status";
  renderLocationStatus(status, {
    location: props.location,
    entry: props.locationEntry,
    permission: props.permission,
    onUseGps: props.onUseGpsLocation,
    onSubmitLocation: props.onSubmitLocation,
    onOpenEntry: props.onOpenLocationEntry,
    onCloseEntry: props.onCloseLocationEntry,
    onChangeLocation: props.onChangeLocation,
  });

  const list = document.createElement("div");
  renderSatelliteList(list, {
    state: props.satellites,
    positions: props.positions,
    visibility: props.visibility,
    tonight: props.tonight,
    onRetry: props.onRetrySatellites,
    view: props.view,
    selection: props.selection,
    onSelect: props.onSelectSatellite,
    onSetView: props.onSetView,
    hasLocation: props.location.kind === "acquired",
  });

  container.append(header, status, list);
  root.append(container);
}
