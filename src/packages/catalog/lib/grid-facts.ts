// Implementation: private to the catalog package.
//
// What the Grid Source's front matter states about the course besides its
// Competencies and its Deliverables: the programme, the term, the Oral, and —
// where the course has them — the Rehearsal, the Reading Day and the Oral's
// timetable. The Grid Frame writes each into what a Student reads (ADR-0014),
// so each is stated once, here, and printed as written.
//
// The programme, the term and the Oral's length and when are required. There
// is no default programme, term or Oral: a Grid Frame with an empty slot, or
// with another course's facts in it, is a grid that tells Students something
// nobody wrote down.
//
// The other three are the course's to have at all — a course with no Rehearsal
// must not be made to declare one — so each block is optional. What is not
// optional is a block that is written: every field of it is required, for the
// same reason, and a half-written Rehearsal is refused rather than printed
// with a gap in it.
//
// None of them is a date this program reads. Only a Deliverable's `due` is an
// instant, because only a Devoir enforces one; a Rehearsal or a Reading Day is
// read, not collected, and is printed as the course writes it.
import { frontMatter } from "../../documents/index.ts";

import { nonEmptyString } from "./scalar.ts";

import type { FrontMatter, FrontMatterValue } from "../../documents/index.ts";

/** The Rehearsal a course holds before the Freeze, as it states it. */
export interface GridRehearsal {
  /** When it is held, e.g. `11 December`. */
  readonly when: string;
  /** How long it lasts, e.g. `3 hours`. */
  readonly length: string;
}

/** The day a course's work is read, as it states it. */
export interface GridReadingDay {
  /** When the reading happens, e.g. `4 January at 09:00`. */
  readonly when: string;
}

/** One line of the Oral's timetable: where in the Oral, and what happens. */
export interface GridOralSlot {
  /** Where in the Oral it falls, e.g. `0:00–2:00`. */
  readonly at: string;
  /**
   * What happens then, as the course writes it. Printed as written: a row may
   * name a Competency, or anything else the Oral does, and this program does
   * not read it for ids — the timetable is prose in a table, not another place
   * the Competencies are declared.
   */
  readonly what: string;
}

/** The course's facts the Grid Frame states, each as the Grid Source writes it. */
export interface GridFacts {
  /** The EPF programme the course is taught in, e.g. `Ingénieur 4A`. */
  readonly programme: string;
  /** The term it is taught in, e.g. `Autumn 2026`. */
  readonly term: string;
  readonly oral: {
    /** How long one Student's Oral lasts, e.g. `20 minutes`. */
    readonly length: string;
    /** When the Orals happen, e.g. `14 and 15 September 2026`. */
    readonly when: string;
    /** The Oral minute by minute, as written, or `undefined` for a course that states none. */
    readonly timetable?: readonly GridOralSlot[];
  };
  /** The Rehearsal, or `undefined` for a course that holds none. */
  readonly rehearsal?: GridRehearsal;
  /** The Reading Day, or `undefined` for a course that has none. */
  readonly readingDay?: GridReadingDay;
}

/**
 * A fact the Grid Frame states is missing from the Grid Source's front matter,
 * or written as something other than text.
 *
 * `field` is named as the front matter spells it, a nested one by its path:
 * `oral.length`, `rehearsal.when`, or `oral.timetable` row 2's `what` as
 * `oral.timetable[2].what`.
 */
export class MissingGridField extends Error {
  constructor(grid: string, field: string) {
    super(
      `Refusing to start: "${grid}" has no "${field}" written as text in its front matter. The Grid Frame ` +
        `states the programme, the term and the Oral from the Grid Source, written as ` +
        `"programme:", "term:" and an "oral:" block with "length:" and "when:", each as ` +
        `the text a Student reads. None of them is defaulted. The "rehearsal:", ` +
        `"readingDay:" and "oral.timetable:" blocks are the course's to leave out ` +
        `altogether, but every field of one that is written is required too.`
    );
    this.name = "MissingGridField";
  }
}

/** The facts the Grid Source at `grid` states, each one checked. */
export function readGridFacts(repoRoot: string, grid: string): GridFacts {
  const declared: FrontMatter = frontMatter(repoRoot, grid) ?? {};
  const programme = text(grid, declared["programme"], "programme");
  const term = text(grid, declared["term"], "term");
  const oral = block(grid, declared["oral"], "oral");
  if (oral === undefined) throw new MissingGridField(grid, "oral");
  return {
    programme,
    term,
    oral: {
      length: text(grid, oral["length"], "oral.length"),
      when: text(grid, oral["when"], "oral.when"),
      ...optional("timetable", readTimetable(grid, oral["timetable"])),
    },
    ...optional("rehearsal", readRehearsal(grid, declared["rehearsal"])),
    ...optional("readingDay", readReadingDay(grid, declared["readingDay"])),
  };
}

/**
 * `{ key: value }` when the course stated one, and no key at all when it did
 * not, so that "has no Rehearsal" is an absent field rather than a written
 * `undefined` for everything downstream to tell apart.
 */
function optional<Key extends string, Value>(
  key: Key,
  value: Value | undefined
): { [K in Key]?: Value } {
  return value === undefined ? {} : ({ [key]: value } as { [K in Key]: Value });
}

/** A field written as text, or the refusal naming it. */
function text(
  grid: string,
  value: FrontMatterValue | undefined,
  field: string
): string {
  const written = nonEmptyString(value);
  if (written === undefined) throw new MissingGridField(grid, field);
  return written;
}

/**
 * A block of fields, `undefined` when it is not written at all, and the
 * refusal when it is written as something that is not a block — `oral: 20
 * minutes` is a mistake, not an absent Oral.
 */
function block(
  grid: string,
  value: FrontMatterValue | undefined,
  field: string
): FrontMatter | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MissingGridField(grid, field);
  }
  return value as FrontMatter;
}

function readRehearsal(
  grid: string,
  value: FrontMatterValue | undefined
): GridRehearsal | undefined {
  const fields = block(grid, value, "rehearsal");
  if (fields === undefined) return undefined;
  return {
    when: text(grid, fields["when"], "rehearsal.when"),
    length: text(grid, fields["length"], "rehearsal.length"),
  };
}

function readReadingDay(
  grid: string,
  value: FrontMatterValue | undefined
): GridReadingDay | undefined {
  const fields = block(grid, value, "readingDay");
  if (fields === undefined) return undefined;
  return { when: text(grid, fields["when"], "readingDay.when") };
}

/**
 * The Oral's timetable, in the order the front matter gives, or `undefined`
 * for a course that states none.
 *
 * A `timetable:` written as anything but a sequence of rows — including an
 * empty one — is refused: a course that has nothing to say about how the Oral
 * goes leaves the field out, and an empty table printed under a lead-in
 * sentence is a grid with a hole in it.
 */
function readTimetable(
  grid: string,
  value: FrontMatterValue | undefined
): readonly GridOralSlot[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new MissingGridField(grid, "oral.timetable");
  }
  return value.map((row, index): GridOralSlot => {
    // Rows are counted from 1, as they are read down the page.
    const at = `oral.timetable[${index + 1}]`;
    const fields = block(grid, row, at);
    if (fields === undefined) throw new MissingGridField(grid, at);
    return {
      at: text(grid, fields["at"], `${at}.at`),
      what: text(grid, fields["what"], `${at}.what`),
    };
  });
}
