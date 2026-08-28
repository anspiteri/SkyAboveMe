import type { Observer } from "../domain/observer.ts";
import type { LocationError } from "../services/geolocation.ts";
import {
  type LocationSource,
  type ManualLocationInput,
} from "../domain/location.ts";
import { CITIES } from "../data/cities.ts";
import { isPlausibleLatitude, isPlausibleLongitude } from "../domain/location.ts";

/**
 * Location state for the dashboard. `idle` is the default: location is optional
 * and is only requested when the user explicitly asks (AGENTS.md §12). `acquired`
 * records how the location was provided (GPS precise vs manual coarse).
 */
export type LocationStatusState =
  | { kind: "idle" }
  | { kind: "acquiring" }
  | {
      kind: "acquired";
      observer: Observer;
      source: LocationSource;
    }
  | { kind: "error"; error: LocationError };

/** The browser's actual geolocation permission state, if knowable. */
export type PermissionState = "granted" | "prompt" | "denied" | null;

export interface LocationStatusProps {
  location: LocationStatusState;
  /** Whether the manual "Enter location" form is open. */
  entry: { kind: "closed" } | { kind: "choosing" };
  /** Browser-reported geolocation permission (Permissions API), if any. */
  permission: PermissionState;
  /** No location known yet. */
  onUseGps: () => void;
  onOpenEntry: () => void;
  onCloseEntry: () => void;
  onSubmitLocation: (input: ManualLocationInput) => void;
  /** Location is already set; switch to a different location. */
  onChangeLocation: () => void;
}

/**
 * Renders the location area. In the default (`idle`) state it's a compact,
 * non-intrusive card explaining that location is optional and offering the two
 * ways to provide it (GPS or manual entry). Once set, it shows a coarse
 * recognition with a "Change" affordance.
 */
export function renderLocationStatus(
  root: HTMLElement,
  props: LocationStatusProps,
): void {
  const { location } = props;

  const container = document.createElement("section");
  container.className = "location-status";
  container.dataset.state = location.kind;

  if (props.entry.kind === "choosing") {
    container.dataset.state = "choosing";
  }

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
  container.append(actionsFor(props));
  root.append(container);
}

function actionsFor(props: LocationStatusProps): HTMLElement {
  const { location, entry } = props;

  if (entry.kind === "choosing") {
    return renderEntryForm(props);
  }

  switch (location.kind) {
    case "idle": {
      const actions = document.createElement("div");
      actions.className = "location-status__actions";

      const gps = button("Use my location", "primary", props.onUseGps);
      const manual = button("Enter location", "secondary", props.onOpenEntry);

      actions.append(gps, manual);

      const permission = permissionLine(props.permission);
      const wrap = document.createElement("div");
      wrap.className = "location-status__idle";
      wrap.append(actions);
      if (permission) wrap.append(permission);
      return wrap;
    }
    case "acquiring": {
      const wait = document.createElement("p");
      wait.className = "location-status__body";
      wait.textContent = "This asks your browser for permission, so you may see a prompt.";
      return wait;
    }
    case "acquired": {
      const actions = document.createElement("div");
      actions.className = "location-status__actions";
      actions.append(button("Change", "secondary", props.onChangeLocation));
      return actions;
    }
    case "error": {
      const actions = document.createElement("div");
      actions.className = "location-status__actions";
      actions.append(
        button("Try again", "primary", props.onUseGps),
        button("Enter location", "secondary", props.onOpenEntry),
      );
      return actions;
    }
  }
}

/** The manual-entry form: pick a city, or type coordinates directly. */
function renderEntryForm(props: LocationStatusProps): HTMLFormElement {
  const form = document.createElement("form");
  form.className = "location-status__entry";
  form.noValidate = true;

  const cityLabel = labelFor("Location city", "city");
  const select = document.createElement("select");
  select.id = "city";
  select.name = "city";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a city…";
  select.append(placeholder);
  for (const city of CITIES) {
    const option = document.createElement("option");
    option.value = city.name;
    option.textContent = city.name;
    select.append(option);
  }

  form.append(cityLabel, select);

  const or = document.createElement("p");
  or.className = "location-status__or";
  or.textContent = "or enter coordinates";
  form.append(or);

  const coords = document.createElement("div");
  coords.className = "location-status__coords";

  const latWrap = coordField("Latitude", "lat", "-90 to 90");
  const lonWrap = coordField("Longitude", "lon", "-180 to 180");
  coords.append(latWrap, lonWrap);
  form.append(coords);

  const error = document.createElement("p");
  error.className = "location-status__entry-error";
  error.textContent = "";
  form.append(error);

  const actions = document.createElement("div");
  actions.className = "location-status__actions";
  actions.append(
    button("Cancel", "secondary", props.onCloseEntry, "button"),
  );

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "location-status__btn location-status__btn--primary";
  submit.textContent = "Set location";
  actions.append(submit);

  form.append(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const latInput = form.elements.namedItem("lat");
    const lonInput = form.elements.namedItem("lon");
    const cityInput = form.elements.namedItem("city") as HTMLSelectElement;

    const latValue = inputValue(latInput);
    const lonValue = inputValue(lonInput);

    // A chosen city takes precedence; otherwise use typed coordinates.
    if (cityInput && cityInput.value) {
      error.textContent = "";
      props.onSubmitLocation({ kind: "city", name: cityInput.value });
      return;
    }
    if (latValue !== "" || lonValue !== "") {
      const latOk = isPlausibleLatitude(latValue);
      const lonOk = isPlausibleLongitude(lonValue);
      if (!latOk || !lonOk) {
        error.textContent =
          "Please enter a latitude between -90 and 90 and a longitude between -180 and 180.";
        return;
      }
      error.textContent = "";
      props.onSubmitLocation({
        kind: "coordinates",
        latitude: Number(latValue),
        longitude: Number(lonValue),
      });
      return;
    }
    error.textContent = "Choose a city or enter coordinates.";
  });

  return form;
}

function coordField(label: string, name: string, placeholder: string): HTMLLabelElement {
  const wrap = document.createElement("label");
  wrap.className = "location-status__field";
  wrap.textContent = label;
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.name = name;
  input.placeholder = placeholder;
  wrap.append(input);
  return wrap;
}

function labelFor(text: string, htmlFor: string): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "location-status__label";
  label.htmlFor = htmlFor;
  label.textContent = text;
  return label;
}

function inputValue(el: Element | RadioNodeList | null): string {
  if (el instanceof HTMLInputElement) return el.value.trim();
  return "";
}

function button(
  label: string,
  variant: "primary" | "secondary",
  onClick: () => void,
  type: "submit" | "button" = "button",
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = type;
  b.className = `location-status__btn location-status__btn--${variant}`;
  b.textContent = label;
  if (type === "button") b.addEventListener("click", onClick);
  return b;
}

/** A short honest note about the browser's saved permission, if knowable. */
function permissionLine(state: PermissionState): HTMLElement | null {
  if (state === null) return null;
  const p = document.createElement("p");
  p.className = "location-status__permission";
  p.textContent =
    state === "granted"
      ? "Your browser has already saved location permission for this site."
      : state === "prompt"
      ? "Your browser hasn't stored a location permission for this site yet."
      : "Your browser has blocked location for this site — you can change it in your browser settings.";
  return p;
}

function titleFor(location: LocationStatusState): string {
  switch (location.kind) {
    case "idle":
      return "Location (optional)";
    case "acquiring":
      return "Finding your location";
    case "acquired":
      return "Location set";
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
    case "idle":
      return "Not needed to browse — set it to see what's above you.";
    case "acquiring":
      return "Requesting permission to see what's above you.";
    case "acquired":
      return `${sourceLabel(location.source)} at ${coarseLabel(location.observer)}.`;
    case "error":
      switch (location.error) {
        case "permission-denied":
          return "Your precise position stays on your device. You can change the permission in your browser settings, or enter a location instead.";
        case "unsupported":
          return "Your browser doesn't support geolocation, so enter a location instead.";
        case "timeout":
          return "The request took too long. Try again, or enter a location.";
        case "position-unavailable":
          return "We couldn't determine a position. Check that location services are on, or enter a location.";
        default:
          return "An unknown error occurred while finding your location.";
      }
  }
}

function sourceLabel(source: LocationSource): string {
  return source === "gps" ? "Using your location" : "Using the location you entered";
}

/** A coarse human label for a location, keeping the position deliberately approximate. */
function coarseLabel(observer: Observer): string {
  const lat = observer.latitude.toFixed(1);
  const lon = observer.longitude.toFixed(1);
  return `${lat}°, ${lon}°`;
}
