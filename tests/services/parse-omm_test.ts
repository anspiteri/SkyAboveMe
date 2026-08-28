import { assertEquals, assertNotEquals, assertObjectMatch } from "@std/assert";
import { parseOmmRecord } from "../../src/services/parse-omm.ts";

/** A realistic CelesTrak OMM JSON record (fields CelesTrak actually returns). */
const ISS_OMM = {
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: "2026-08-27T12:44:14.404128",
  MEAN_MOTION: 15.49656235,
  ECCENTRICITY: 0.000772,
  INCLINATION: 51.6325,
  RA_OF_ASC_NODE: 306.9725,
  ARG_OF_PERICENTER: 89.1136,
  MEAN_ANOMALY: 271.0737,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: "U",
  NORAD_CAT_ID: 25544,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 58281,
  BSTAR: 0.00016667,
  MEAN_MOTION_DOT: 8.959e-5,
  MEAN_MOTION_DDOT: 0,
};

Deno.test("parseOmmRecord parses a well-formed OMM record", () => {
  const sat = parseOmmRecord(ISS_OMM);
  assertNotEquals(sat, null, "expected record to parse");
  if (sat === null) return;

  assertEquals(sat.noradId, 25544);
  assertEquals(sat.name, "ISS (ZARYA)");

  assertObjectMatch(sat.elements, {
    epoch: "2026-08-27T12:44:14.404128",
    meanMotionRevPerDay: 15.49656235,
    eccentricity: 0.000772,
    inclinationDeg: 51.6325,
    raOfAscNodeDeg: 306.9725,
    argOfPericenterDeg: 89.1136,
    meanAnomalyDeg: 271.0737,
    bstar: 0.00016667,
    meanMotionDot: 8.959e-5,
    meanMotionDdot: 0,
  });
});

Deno.test("parseOmmRecord returns null for a non-object", () => {
  assertEquals(parseOmmRecord(null), null);
  assertEquals(parseOmmRecord("nope"), null);
  assertEquals(parseOmmRecord(42), null);
});

Deno.test("parseOmmRecord returns null when a required field is missing", () => {
  const { MEAN_MOTION: _drop, ...missingMeanMotion } = ISS_OMM;
  assertEquals(parseOmmRecord(missingMeanMotion), null);

  const { NORAD_CAT_ID: _drop2, ...missingNorad } = ISS_OMM;
  assertEquals(parseOmmRecord(missingNorad), null);
});

Deno.test("parseOmmRecord accepts string-typed numeric fields", () => {
  const strRec = {
    ...ISS_OMM,
    MEAN_MOTION: "15.49656235",
    INCLINATION: "51.6325",
    NORAD_CAT_ID: "25544",
  };
  const sat = parseOmmRecord(strRec);
  if (sat === null) throw new Error("expected parse");
  assertEquals(sat.noradId, 25544);
  assertEquals(sat.elements.meanMotionRevPerDay, 15.49656235);
  assertEquals(sat.elements.inclinationDeg, 51.6325);
});

Deno.test("parseOmmRecord treats a non-numeric required field as null", () => {
  const bad = { ...ISS_OMM, INCLINATION: "abc" };
  assertEquals(parseOmmRecord(bad), null);
});
