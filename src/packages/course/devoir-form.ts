// An entry point: what a Devoir's settings form is told, decided away from the
// browser that types it.
//
// A driver's job is filling in a form. Which numbers and which switches go in
// it is not a form-filling problem — it is the whole of what a Devoir *is*,
// and it is worked out here, in the open, where it can be tested without a
// browser. The same split as `sections.ts` and `activities.ts`, for the same
// reason, and here the reason is the sharpest in the program: a Freeze wrong
// by an hour and a Devoir that quietly collects files are both found out by a
// student at a deadline, never by a type checker.
import { DEVOIR_SUBMISSION } from "./index.ts";
import { SELECTORS } from "./lib/selectors.ts";

import type { DevoirFreeze } from "./index.ts";

/** The zone every Freeze is written in, and the only one a Devoir is set from. */
export const FREEZE_ZONE = "Europe/Paris";

/**
 * Moodle's date selector, which is five selects: day, month, year, hour,
 * minute.
 *
 * The names are the suffixes Moodle's own field ids carry, so
 * `#id_duedate` + `_day` addresses the first of them. That is why they are
 * named here rather than in the driver: they are half of a selector, and a
 * selector spelled in two places is a selector that comes to differ.
 */
export interface MoodleDateFields {
  readonly day: string;
  readonly month: string;
  readonly year: string;
  readonly hour: string;
  readonly minute: string;
}

/**
 * The five numbers that put `instant` into a Moodle date form, read off it in
 * `Europe/Paris`.
 *
 * Moodle stores a date as an instant and renders it as a local time in the
 * signed-in user's timezone. So the numbers typed into the form are the Paris
 * ones — the numbers the timetable states and the front matter was written
 * from — and it is the driver's job to have established that the browser's
 * user is in that zone before it types them. The same five numbers entered
 * against another zone are another instant.
 *
 * Every value comes out as Moodle spells its option values: a plain decimal
 * number with no leading zero. `09:30` selecting nothing because the option is
 * `9` is exactly the kind of failure that would ship silently, so the padding
 * is stripped here rather than hoped away.
 */
export function moodleDateFields(instant: Date): MoodleDateFields {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: FREEZE_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  const number = (type: Intl.DateTimeFormatPartTypes): string =>
    String(Number(value(type)));
  return {
    day: number("day"),
    month: number("month"),
    // Not passed through `Number`: a year is written in full, and there is no
    // leading zero on it to strip.
    year: value("year"),
    hour: number("hour"),
    minute: number("minute"),
  };
}

/**
 * The instant five Moodle date numbers stand for, read as `Europe/Paris`
 * wall-clock time — the inverse of {@link moodleDateFields}.
 *
 * The inverse is worth having in the open for the reason the forward direction
 * is: what the audit compares a front-matter Freeze against is whatever a
 * human left in these five selects, and reading them in the wrong zone would
 * report a correct Devoir as an hour adrift — or, far worse, pass a Devoir
 * that is.
 *
 * `undefined` when any of the five is empty or is not a number, which is what
 * a selector pointing at the wrong control looks like: an unreadable date is
 * said to be unreadable rather than guessed at.
 *
 * Two passes, because the offset depends on the instant being worked out. The
 * first pass reads the offset at the wall-clock time treated as UTC, which is
 * within an hour or two of the answer; the second reads it at that answer,
 * which settles it for every instant except one inside a changeover hour.
 */
export function instantFromMoodleDateFields(
  fields: MoodleDateFields
): Date | undefined {
  const numbers = [
    fields.year,
    fields.month,
    fields.day,
    fields.hour,
    fields.minute,
  ].map((part) => (part.trim() === "" ? Number.NaN : Number(part.trim())));
  // An empty select is unreadable and not zero. `Number("")` is 0, which would
  // read a form with nothing chosen in it as the year 0 — a date the audit
  // would then report as drift, in a message naming an instant nobody typed.
  if (numbers.some((number) => Number.isNaN(number))) return undefined;
  const [year, month, day, hour, minute] = numbers as [
    number,
    number,
    number,
    number,
    number,
  ];
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const first = new Date(wall - parisOffsetMs(new Date(wall)));
  return new Date(wall - parisOffsetMs(first));
}

/** What `Europe/Paris` is ahead of UTC at `instant`, in milliseconds. */
function parisOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: FREEZE_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const wall = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second")
  );
  // Seconds and below are not in the wall clock reading, so the difference is
  // taken against an instant truncated to the same precision.
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

/** One of the five selects behind a date, and the option to choose in it. */
export interface DevoirDatePart {
  readonly selector: string;
  readonly value: string;
}

/**
 * One of Moodle's optional dates: the checkbox that turns it on, and the five
 * selects behind it, each already addressed and already answered.
 *
 * The selects are worked out here rather than in the driver because working
 * them out is string surgery on a selector — `#id_duedate_enabled` loses its
 * suffix and gains `_day` — and string surgery nobody can see is string
 * surgery nobody checks. Done here, `#id_duedate_day` is a literal in a test;
 * done in the driver, a renamed checkbox would quietly address five controls
 * that do not exist and every test would stay green.
 */
export interface DevoirDateField {
  readonly enabledSelector: string;
  readonly parts: readonly DevoirDatePart[];
}

/**
 * The five selects a date's enabling checkbox stands in front of.
 *
 * Moodle names them from one prefix: `#id_duedate_enabled` is the checkbox and
 * `#id_duedate_day` is the first select. Losing the `_enabled` suffix is
 * therefore how the five are found, and a checkbox selector that does not
 * carry it is a selector this program cannot derive the rest from — so it says
 * so, rather than building `#id_duedate_day` out of a guess.
 */
function datePartSelectors(enabledSelector: string): MoodleDateFields {
  if (!enabledSelector.endsWith("_enabled")) {
    throw new Error(
      `Aborting: "${enabledSelector}" is meant to be a Moodle date checkbox, whose five ` +
        `selects are named after it without its "_enabled" suffix. It has no such suffix, ` +
        `so the day, month, year, hour and minute controls cannot be addressed. Check the ` +
        `selectors against this Moodle.`
    );
  }
  const prefix = enabledSelector.slice(0, -"_enabled".length);
  const selector = (part: keyof MoodleDateFields): string =>
    `${prefix}_${part}`;
  return {
    day: selector("day"),
    month: selector("month"),
    year: selector("year"),
    hour: selector("hour"),
    minute: selector("minute"),
  };
}

/**
 * One of the two dates a Devoir carries, addressed on the form: the checkbox
 * that turns it on, and the five selects behind it.
 *
 * Named as {@link DevoirSettings} names it, so that a date written into the
 * form and the same date read back out of it are the same date under one word.
 * This is the list the writing side maps over to answer and the reading side
 * maps over to ask, which is what makes it impossible for one of them to know
 * about a date the other does not.
 */
export interface DevoirDateControls {
  readonly what: "due" | "cutOff";
  readonly enabledSelector: string;
  /** The five selects, each addressed; the values are what differ per use. */
  readonly parts: MoodleDateFields;
}

/**
 * Both of a Devoir's dates, as controls on the form.
 *
 * Due is what Moodle marks a Submission late against; cut-off is what it stops
 * accepting at. Both are set from the one Freeze and both are read back
 * against it, and having exactly these two in one list is what leaves no room
 * for the grace window nobody wrote down.
 */
export const DEVOIR_DATE_CONTROLS: readonly DevoirDateControls[] = (
  [
    { what: "due", enabledSelector: SELECTORS.assignDueDateEnabled },
    { what: "cutOff", enabledSelector: SELECTORS.assignCutOffDateEnabled },
  ] as const
).map(({ what, enabledSelector }) => ({
  what,
  enabledSelector,
  parts: datePartSelectors(enabledSelector),
}));

/**
 * Both of a Devoir's dates, from the one Freeze, each already addressed and
 * already answered.
 *
 * Setting them to a single instant is what makes a late Submission not exist
 * rather than merely be flagged, and taking them from one argument is what
 * leaves no second date here for anything else to fill.
 */
export function devoirDateFields(
  freeze: DevoirFreeze
): readonly DevoirDateField[] {
  const fields = moodleDateFields(freeze.instant);
  return DEVOIR_DATE_CONTROLS.map(({ enabledSelector, parts }) => ({
    enabledSelector,
    parts: Object.entries(parts).map(([part, selector]) => ({
      selector,
      value: fields[part as keyof MoodleDateFields],
    })),
  }));
}

/** One submission-plugin checkbox on the form, and what it is set to. */
export interface DevoirSubmissionField {
  /** The setting this control is, named as {@link DEVOIR_SUBMISSION} names it. */
  readonly what: keyof typeof DEVOIR_SUBMISSION;
  readonly selector: string;
  readonly on: boolean;
}

/**
 * Every submission plugin a Devoir's form is told about, and what each is set
 * to.
 *
 * A list rather than two calls in the driver, because the thing worth checking
 * is that the list is complete. Both switches are *written* on every create,
 * including the one that is written off: a site whose default has file
 * submissions enabled would otherwise produce exactly the Devoir this design
 * exists to prevent, and "we did not switch it on" is not the same statement
 * as "it is off". Off it is, and off a test can see it being set.
 */
export const DEVOIR_SUBMISSION_FIELDS: readonly DevoirSubmissionField[] = [
  {
    what: "onlineText",
    selector: SELECTORS.assignOnlineText,
    on: DEVOIR_SUBMISSION.onlineText,
  },
  {
    what: "fileUpload",
    selector: SELECTORS.assignFileSubmissions,
    on: DEVOIR_SUBMISSION.fileUpload,
  },
];
