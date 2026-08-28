import type { Observer } from "../domain/observer.ts";
import type { LocationError } from "../services/geolocation.ts";

export type LocationStatusState =
  | { kind: "acquiring" }
  | { kind: "acquired"; observer: Observer }
  | { kind: "error"; error: LocationError };

export interface LocationStatusProps {
  location: LocationStatusState;
}

/** Renders the current location/status banner for the dashboard. */
export function renderLocationStatus(
  root: HTMLElement,
  props: LocationStatusProps,
): void {
  const { location } = props;

  const container = document.createElement("section");
  container.className = "location-status";
  container.dataset.state = location.kind;

  const icon = document.createElement("span");
  icon.className = "location-status__icon";
  icon.setAttribute("aria-hidden", "true");

  const text = document.createElement("div");
  text.className = "location-status__text";

  const title = document.createElement("p");
  title.className = "location-status__title";
  title.textContent = titleFor(location);

  const body = document.createElement("p");
  body.className = "location-status__body";
  body.textContent = bodyFor(location);

  text.append(title, body);
  container.append(icon, text);
  root.append(container);
}

function titleFor(location: LocationStatusState): string {
  switch (location.kind) {
    case "acquiring":
      return "Finding your location";
    case "acquired":
      return "Location acquired";
    case "error":
      switch (location.error) {
        case "permission-denied":
          return "Location permission denied";
        case "unsupported":
          return "Location not supported";
        case "timeout":
          return "Location request timed out";
        case "position-unavailable":
          return "Location unavailable";
        default:
          return "Something went wrong";
      }
  }
}

function bodyFor(location: LocationStatusState): string {
  switch (location.kind) {
    case "acquiring":
      return "Requesting permission to see what's above you.";
    case "acquired":
      return `Dividing the sky from ${coarseLabel(location.observer)}.`;
    case "error":
      switch (location.error) {
        case "permission-denied":
          return "Allow location access to see what's above you. Your precise position stays on your device.";
        case "unsupported":
          return "Your browser doesn't support geolocation, so we can't work out what's above you.";
        case "timeout":
          return "The request took too long. Try again in a moment.";
        case "position-unavailable":
          return "We couldn't determine a position. Check that location services are on.";
        default:
          return "An unknown error occurred while finding your location.";
      }
  }
}

/** A coarse human label for a location, keeping the position deliberately approximate. */
function coarseLabel(observer: Observer): string {
  const lat = observer.latitude.toFixed(1);
  const lon = observer.longitude.toFixed(1);
  return `${lat}°, ${lon}°`;
}
