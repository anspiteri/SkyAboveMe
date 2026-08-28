import { assert, assertEquals, assertObjectMatch } from "@std/assert";
import {
  getCurrentLocation,
  isGeolocationSupported,
  queryGeolocationPermission,
} from "../../src/services/geolocation.ts";

/**
 * These tests exercise the geolocation adapter's failure handling by stubbing
 * `navigator.geolocation`, since real geolocation depends on browser
 * permissions and is not available headlessly.
 */

const ORIGINAL_GEOLOCATION = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation",
);
const ORIGINAL_PERMISSIONS = Object.getOwnPropertyDescriptor(
  navigator,
  "permissions",
);

function setGeolocation(stub: unknown): void {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: stub,
  });
}

function setPermissions(stub: unknown): void {
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: stub,
  });
}

function removePermissions(): void {
  Reflect.deleteProperty(navigator, "permissions");
}

function restorePermissions(): void {
  if (ORIGINAL_PERMISSIONS === undefined) {
    removePermissions();
  } else {
    Object.defineProperty(navigator, "permissions", ORIGINAL_PERMISSIONS);
  }
}

function removeGeolocation(): void {
  Reflect.deleteProperty(navigator, "geolocation");
}

function restoreGeolocation(): void {
  if (ORIGINAL_GEOLOCATION === undefined) {
    removeGeolocation();
  } else {
    Object.defineProperty(navigator, "geolocation", ORIGINAL_GEOLOCATION);
  }
}

Deno.test("isGeolocationSupported reflects presence of geolocation", () => {
  setGeolocation({});
  assertEquals(isGeolocationSupported(), true);
  restoreGeolocation();
});

Deno.test("getCurrentLocation resolves to unsupported when geolocation is absent", async () => {
  removeGeolocation();
  const result = await getCurrentLocation();
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "unsupported");
  restoreGeolocation();
});

Deno.test("getCurrentLocation maps success to an Observer", async () => {
  setGeolocation({
    getCurrentPosition: (
      success: (pos: {
        coords: { latitude: number; longitude: number; accuracy: number };
        timestamp: number;
      }) => void,
    ) => {
      success({
        coords: { latitude: 51.5, longitude: -0.12, accuracy: 30 },
        timestamp: 1_700_000_000_000,
      });
    },
  });

  const result = await getCurrentLocation();
  assert(result.ok);
  if (result.ok) {
    assertObjectMatch(result.observer, {
      latitude: 51.5,
      longitude: -0.12,
      heightKm: 0,
      accuracyM: 30,
    });
    assertEquals(result.observer.capturedAt.getTime(), 1_700_000_000_000);
  }
  restoreGeolocation();
});

Deno.test("getCurrentLocation maps geolocation error codes", async () => {
  const cases: Array<[number, string]> = [
    [1, "permission-denied"],
    [2, "position-unavailable"],
    [3, "timeout"],
    [99, "unknown"],
  ];

  for (const [code, expected] of cases) {
    setGeolocation({
      getCurrentPosition: (_success: unknown, error: (e: { code: number }) => void) => {
        error({ code });
      },
    });

    const result = await getCurrentLocation();
    assert(!result.ok);
    if (!result.ok) assertEquals(result.error, expected);
    restoreGeolocation();
  }
});

Deno.test("queryGeolocationPermission maps the Permissions API state", async () => {
  const cases: Array<["granted" | "prompt" | "denied", string]> = [
    ["granted", "granted"],
    ["prompt", "prompt"],
    ["denied", "denied"],
  ];

  for (const [state, expected] of cases) {
    setPermissions({
      query: async () => ({ state }),
    });
    assertEquals(await queryGeolocationPermission(), expected);
    restorePermissions();
  }
});

Deno.test("queryGeolocationPermission returns null without the Permissions API", async () => {
  removePermissions();
  assertEquals(await queryGeolocationPermission(), null);
  restorePermissions();
});

Deno.test("queryGeolocationPermission returns null when the query throws", async () => {
  setPermissions({
    query: async () => {
      throw new Error("unsupported");
    },
  });
  assertEquals(await queryGeolocationPermission(), null);
  restorePermissions();
});

