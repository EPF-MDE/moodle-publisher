// Implementation: private to the catalog package.
//
// A Freeze is the instant a Deliverable stops accepting work. It is the most
// expensive thing in this repository to get wrong — a wrong Freeze is found
// out by a student at a deadline, and by then the work they pushed is not read
// — so every reading here either produces the instant that was written down or
// refuses. Nothing falls back to a default, and nothing is interpreted against
// the machine's local zone.
const ZONE = "Europe/Paris";

/**
 * `2026-09-10T20:00:00+02:00`: a local time and an explicit offset from UTC.
 *
 * The offset is not optional and `Z` is not accepted in its place. The Freeze
 * is written by a human reading a timetable in Paris, so it is written as they
 * read it, and the offset is what makes "20:00" mean one instant rather than
 * whichever one the machine running this happens to be in.
 */
const INSTANT =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?([+-]\d{2}:\d{2})$/;

/** An instant, and the string a human wrote it as. */
export interface Freeze {
  readonly instant: Date;
  /** Exactly as authored, so a message can quote the file back. */
  readonly written: string;
}

/** Why a `due` could not be read as a Freeze. `undefined` means it could. */
export type FreezeProblem =
  | { readonly kind: "unreadable" }
  | {
      readonly kind: "not-paris";
      readonly written: string;
      readonly paris: string;
    };

export type FreezeReading =
  | { readonly ok: true; readonly freeze: Freeze }
  | { readonly ok: false; readonly problem: FreezeProblem };

/**
 * The Freeze `written` states, or why it states none.
 *
 * Two ways to fail, kept apart because they are two different mistakes: a
 * string that is not an instant at all, and an instant whose offset is not the
 * one `Europe/Paris` was on that day. The second is the subtle one — `+01:00`
 * in September is a Freeze an hour later than the grid says, and it parses
 * perfectly.
 */
export function readFreeze(written: string): FreezeReading {
  const match = INSTANT.exec(written.trim());
  if (match === null) return { ok: false, problem: { kind: "unreadable" } };
  const instant = new Date(written.trim());
  if (Number.isNaN(instant.getTime())) {
    return { ok: false, problem: { kind: "unreadable" } };
  }
  const offset = match[3] as string;
  const paris = parisOffset(instant);
  if (offset !== paris) {
    return {
      ok: false,
      problem: { kind: "not-paris", written: offset, paris },
    };
  }
  return { ok: true, freeze: { instant, written: written.trim() } };
}

/**
 * What `Europe/Paris` is offset from UTC at `instant`, as `+02:00`.
 *
 * Asked of the zone at that instant rather than assumed, because the course
 * straddles no changeover but the next one might: September is `+02:00` and
 * October is `+01:00`, and a rule written for one of them silently rejects the
 * other.
 */
function parisOffset(instant: Date): string {
  const named = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    timeZoneName: "longOffset",
  })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value;
  // `GMT` on its own is what the zone reports when it is exactly UTC.
  return named === "GMT" ? "+00:00" : (named?.replace("GMT", "") ?? "+00:00");
}

/**
 * The Freeze stated in full: the day named, the time in the zone it was
 * written in, and the string the front matter states it as.
 *
 * In full, deliberately. This line is what an instructor reads the plan for,
 * and a date is only checked against the timetable if it says which day of the
 * week it falls on and which zone it is in.
 */
export function formatFreeze(freeze: Freeze): string {
  return `${formatInstant(freeze.instant)} (${freeze.written})`;
}

/**
 * The Freeze as a Student reads it in the Assessment Grid: the time, then the
 * day, in `Europe/Paris`, e.g. `20:00 on Thursday 10 September 2026`.
 *
 * Not the string the front matter states it as: an ISO timestamp is how the
 * Freeze is written down, not how anybody reads when their work stops being
 * read.
 */
export function freezeAsRead(freeze: Freeze): string {
  const value = partsOf(freeze.instant);
  return (
    `${value("hour")}:${value("minute")} on ` +
    `${value("weekday")} ${value("day")} ${value("month")} ${value("year")}`
  );
}

/** One instant, named the way a Freeze is named. */
function formatInstant(instant: Date): string {
  const value = partsOf(instant);
  return (
    `${value("weekday")} ${value("day")} ${value("month")} ${value("year")} ` +
    `at ${value("hour")}:${value("minute")} ${ZONE}`
  );
}

/** Each part of `instant`'s date and time in `Europe/Paris`, by its type. */
function partsOf(
  instant: Date
): (type: Intl.DateTimeFormatPartTypes) => string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  return (type) => parts.find((part) => part.type === type)?.value ?? "";
}
