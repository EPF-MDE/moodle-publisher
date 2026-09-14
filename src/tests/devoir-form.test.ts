// The numbers and switches a Devoir's settings form receives.
//
// The one part of publishing a Devoir that no other test can reach. Everything
// else about a Devoir is asserted through a run, off the fake course — but the
// fake is handed the Freeze as the front matter wrote it and stores it back
// unchanged, so a run proves that the right instant travelled and nothing
// about what Moodle is finally told. What Moodle is finally told is five
// numbers per date and two checkboxes, worked out here, and a mistake in them
// is exactly the silent kind: an hour out, or a leading zero that selects no
// option at all, and the first person to find out is a student at a deadline.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEVOIR_SUBMISSION_FIELDS,
  devoirDateFields,
  instantFromMoodleDateFields,
  moodleDateFields,
} from "../packages/course/devoir-form.ts";
import { DEVOIR_SUBMISSION } from "../packages/course/index.ts";

/** A Freeze as the seam carries it: the instant, and the string that wrote it. */
function freeze(written: string) {
  return { instant: new Date(written), written };
}

test("a Freeze is read off in Paris, not in the machine's zone", () => {
  // 20:00+02:00 is 18:00 UTC. A form filled from UTC would say 18.
  assert.deepEqual(moodleDateFields(new Date("2026-09-10T20:00:00+02:00")), {
    day: "10",
    month: "9",
    year: "2026",
    hour: "20",
    minute: "0",
  });
  // The same instant, written as UTC in the file: still 20:00 in the form.
  assert.equal(moodleDateFields(new Date("2026-09-10T18:00:00Z")).hour, "20");
});

test("a Freeze in winter is an hour off one in summer, and the form says so", () => {
  // Paris is +01:00 in January and +02:00 in September. One offset applied to
  // both is the bug this asserts against: the same UTC clock time is 13:00 in
  // one and 14:00 in the other.
  assert.equal(moodleDateFields(new Date("2026-01-15T12:00:00Z")).hour, "13");
  assert.equal(moodleDateFields(new Date("2026-09-15T12:00:00Z")).hour, "14");
});

test("every number is unpadded, as Moodle's own options are", () => {
  // 09:05 on the 3rd of the 4th. Moodle's selects carry "3", "4", "9", "5",
  // and a padded "09" matches no option, which fails silently: the select
  // keeps whatever it had.
  assert.deepEqual(moodleDateFields(new Date("2026-04-03T09:05:00+02:00")), {
    day: "3",
    month: "4",
    year: "2026",
    hour: "9",
    minute: "5",
  });
  // Midnight is "0" and not "" — the hour that is most easily lost.
  assert.equal(
    moodleDateFields(new Date("2026-04-03T00:00:00+02:00")).hour,
    "0"
  );
});

test("a year keeps all four of its digits", () => {
  assert.equal(
    moodleDateFields(new Date("2026-09-10T20:00:00+02:00")).year,
    "2026"
  );
});

test("the due date and the cut-off date are one Freeze, to the minute", () => {
  const fields = devoirDateFields(freeze("2026-09-11T09:30:00+02:00"));

  // Two dates, and no third: a Devoir has a due date and a cut-off and nothing
  // else that a date could leak into.
  assert.equal(fields.length, 2);
  const [due, cutOff] = fields;
  assert.ok(due && cutOff);
  // Not "both are set" but "both are the same numbers". A grace window is what
  // a difference between them would be, and nobody wrote one down.
  assert.deepEqual(
    due.parts.map((part) => part.value),
    cutOff.parts.map((part) => part.value)
  );
  // Each pointed at its own control, so the pair cannot both land on one date.
  assert.notEqual(due.enabledSelector, cutOff.enabledSelector);
});

test("each of the five selects is addressed by name, off the checkbox", () => {
  // Written out as literals, because the selectors are derived — the checkbox
  // loses `_enabled` and the five gain `_day` and the rest. A checkbox
  // selector renamed in `selectors.ts` would otherwise go on addressing five
  // controls that do not exist, and nothing anywhere would say so: Playwright
  // is asked to choose an option in a locator that matches nothing, and a
  // Devoir ships with no dates on it at all.
  const [due, cutOff] = devoirDateFields(freeze("2026-09-11T09:30:00+02:00"));
  assert.ok(due && cutOff);

  assert.deepEqual(due.parts, [
    { selector: "#id_duedate_day", value: "11" },
    { selector: "#id_duedate_month", value: "9" },
    { selector: "#id_duedate_year", value: "2026" },
    { selector: "#id_duedate_hour", value: "9" },
    { selector: "#id_duedate_minute", value: "30" },
  ]);
  assert.deepEqual(cutOff.parts, [
    { selector: "#id_cutoffdate_day", value: "11" },
    { selector: "#id_cutoffdate_month", value: "9" },
    { selector: "#id_cutoffdate_year", value: "2026" },
    { selector: "#id_cutoffdate_hour", value: "9" },
    { selector: "#id_cutoffdate_minute", value: "30" },
  ]);
});

test("a Devoir's form is told what to collect and what to refuse", () => {
  // The refusal is the assertion. A file upload switch that is never written
  // is a Devoir that collects whatever Moodle's site default collects, and a
  // student handing in a zip of their repository is not caught by anything
  // downstream — so the switch appears here with `false` beside it, rather
  // than being left out because false is what it should already be.
  const fileUpload = DEVOIR_SUBMISSION_FIELDS.find(
    (field) => field.what === "fileUpload"
  );
  assert.ok(fileUpload, "no file-upload field is written to the form");
  assert.equal(fileUpload.on, false);

  const onlineText = DEVOIR_SUBMISSION_FIELDS.find(
    (field) => field.what === "onlineText"
  );
  assert.ok(onlineText, "no online-text field is written to the form");
  assert.equal(onlineText.on, true);

  // Every switch the design names is written to the form. A field added to
  // DEVOIR_SUBMISSION and forgotten here would be a setting the program
  // believes it made and never made.
  assert.deepEqual(
    DEVOIR_SUBMISSION_FIELDS.map((field) => field.what).toSorted(),
    Object.keys(DEVOIR_SUBMISSION).toSorted()
  );
  // Distinct controls: one selector serving two switches would silently make
  // the second overwrite the first.
  assert.equal(
    new Set(DEVOIR_SUBMISSION_FIELDS.map((field) => field.selector)).size,
    DEVOIR_SUBMISSION_FIELDS.length
  );
});

// Reading a Devoir's dates back off the form, which is the audit's half of the
// same conversion. It is the direction that decides whether a live Devoir
// agrees with the front matter, so getting it wrong either passes a Devoir
// that is an hour adrift or fails one that is not.

test("five numbers read off a form are the instant the front matter states", () => {
  assert.deepEqual(
    instantFromMoodleDateFields({
      day: "10",
      month: "9",
      year: "2026",
      hour: "20",
      minute: "0",
    }),
    new Date("2026-09-10T20:00:00+02:00")
  );
});

test("reading a date back is the exact inverse of writing it", () => {
  // Both sides of the changeover, and midnight: whatever the form was told,
  // reading the form says the same instant again. An audit built on anything
  // less than this compares a Devoir against a rewritten copy of itself.
  for (const written of [
    "2026-09-10T20:00:00+02:00",
    "2026-09-11T09:30:00+02:00",
    "2026-01-15T13:00:00+01:00",
    "2026-04-03T00:00:00+02:00",
    "2026-12-31T23:59:00+01:00",
  ]) {
    const instant = new Date(written);
    assert.deepEqual(
      instantFromMoodleDateFields(moodleDateFields(instant)),
      instant,
      written
    );
  }
});

test("a date whose numbers cannot be read is unreadable, never guessed at", () => {
  assert.equal(
    instantFromMoodleDateFields({
      day: "10",
      month: "9",
      year: "",
      hour: "20",
      minute: "0",
    }),
    undefined
  );
});
