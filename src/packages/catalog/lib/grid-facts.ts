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

import { idsOf, isDeclared } from "./competency.ts";
import { nonEmptyString } from "./scalar.ts";

import type { Competency } from "./competency.ts";
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

/** One row of the Oral's timetable: where in the Oral, and what happens. */
export interface GridTimetableRow {
  /** Where in the Oral it falls, e.g. `0:00–2:00`. */
  readonly at: string;
  /**
   * What happens then, as the course writes it. Printed as written, and read
   * for one thing only: a `Cn` it names has to be a Competency the grid
   * declares. The timetable is prose in a table, not another place the
   * Competencies are declared — but it may not point at one that does not
   * exist.
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
    readonly timetable?: readonly GridTimetableRow[];
  };
  /** The Rehearsal, or `undefined` for a course that holds none. */
  readonly rehearsal?: GridRehearsal;
  /** The Reading Day, or `undefined` for a course that has none. */
  readonly readingDay?: GridReadingDay;
}

/** A field of one of the three blocks a course may leave out altogether. */
const OF_AN_OPTIONAL_BLOCK = /^(?:rehearsal|readingDay|oral\.timetable)\b/;

/**
 * A fact the Grid Frame states is missing from the Grid Source's front matter,
 * or written as something other than text.
 *
 * `field` is named as the front matter spells it, a nested one by its path:
 * `oral.length`, `rehearsal.when`, or `oral.timetable` row 2's `what` as
 * `oral.timetable[2].what`. What the refusal goes on to explain is what the
 * missing field belongs to: a course that forgot `term:` is not told about
 * blocks it never wrote.
 */
export class MissingGridField extends Error {
  constructor(grid: string, field: string) {
    super(
      `Refusing to start: "${grid}" has no "${field}" written as text in its front matter. ` +
        (OF_AN_OPTIONAL_BLOCK.test(field)
          ? `The "rehearsal:", "readingDay:" and "oral.timetable:" blocks are the course's to ` +
            `leave out altogether, but every field of one that is written is required.`
          : `The Grid Frame states the programme, the term and the Oral from the Grid Source, ` +
            `written as "programme:", "term:" and an "oral:" block with "length:" and "when:", ` +
            `each as the text a Student reads. None of them is defaulted.`)
    );
    this.name = "MissingGridField";
  }
}

/**
 * A Competency id written in a timetable row, `C1`, `C2`, …: the ids this
 * program gives, so `C1` is a reference and `c1` is prose.
 */
const COMPETENCY_ID = /\bC\d+\b/g;

/**
 * A timetable row naming a Competency the grid does not declare.
 *
 * The row is prose, and it may say anything — but a Competency it names is one
 * a Student is graded on, and a minute of the Oral pointed at a Competency
 * nobody is graded on is a minute spent on nothing. Most often it is a
 * renumbering: an id is its place in `competencies:`, so removing or
 * reordering one moves every id after it.
 */
export class UndeclaredTimetableCompetency extends Error {
  constructor(
    grid: string,
    field: string,
    named: string,
    competencies: readonly Competency[]
  ) {
    super(
      `Refusing to start: "${grid}" writes "${field}" naming competency "${named}", which ` +
        `"${grid}" does not declare. The competencies are ${idsOf(competencies)}. A ` +
        `Competency's id is its place in "competencies:", so removing or reordering one ` +
        `renumbers those after it. Name a declared Competency, or write the row without an id.`
    );
    this.name = "UndeclaredTimetableCompetency";
  }
}

/**
 * The facts the Grid Source at `grid` states, each one checked against the
 * `competencies` the same grid declares.
 */
export function readGridFacts(
  repoRoot: string,
  grid: string,
  competencies: readonly Competency[]
): GridFacts {
  const declared: FrontMatter = frontMatter(repoRoot, grid) ?? {};
  const fields = fieldsOf(grid);
  const programme = fields.text(declared["programme"], "programme");
  const term = fields.text(declared["term"], "term");
  const oral = fields.block(declared["oral"], "oral");
  if (oral === undefined) throw fields.missing("oral");
  return {
    programme,
    term,
    oral: {
      length: fields.text(oral["length"], "oral.length"),
      when: fields.text(oral["when"], "oral.when"),
      timetable: readTimetable(fields, oral["timetable"], competencies),
    },
    rehearsal: readRehearsal(fields, declared["rehearsal"]),
    readingDay: readReadingDay(fields, declared["readingDay"]),
  };
}

/** Reads the fields of one Grid Source: every refusal names that source. */
interface Fields {
  /** The Grid Source being read, for a refusal this reader does not raise. */
  readonly source: string;
  /** A field written as text, or the refusal naming it. */
  text(value: FrontMatterValue | undefined, field: string): string;
  /**
   * A block of fields, `undefined` when it is not written at all, and the
   * refusal when it is written as something that is not a block — `oral: 20
   * minutes` is a mistake, not an absent Oral.
   */
  block(
    value: FrontMatterValue | undefined,
    field: string
  ): FrontMatter | undefined;
  /** The refusal naming `field`, for a reading that is not a field's own. */
  missing(field: string): MissingGridField;
}

/**
 * The reader for the Grid Source at `grid`, so that the source is named once
 * here rather than carried to every field that might be missing.
 */
function fieldsOf(grid: string): Fields {
  return {
    source: grid,
    text(value, field) {
      const written = nonEmptyString(value);
      if (written === undefined) throw new MissingGridField(grid, field);
      return written;
    },
    block(value, field) {
      if (value === undefined) return undefined;
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new MissingGridField(grid, field);
      }
      return value as FrontMatter;
    },
    missing(field) {
      return new MissingGridField(grid, field);
    },
  };
}

function readRehearsal(
  fields: Fields,
  value: FrontMatterValue | undefined
): GridRehearsal | undefined {
  const written = fields.block(value, "rehearsal");
  if (written === undefined) return undefined;
  return {
    when: fields.text(written["when"], "rehearsal.when"),
    length: fields.text(written["length"], "rehearsal.length"),
  };
}

function readReadingDay(
  fields: Fields,
  value: FrontMatterValue | undefined
): GridReadingDay | undefined {
  const written = fields.block(value, "readingDay");
  if (written === undefined) return undefined;
  return { when: fields.text(written["when"], "readingDay.when") };
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
  fields: Fields,
  value: FrontMatterValue | undefined,
  competencies: readonly Competency[]
): readonly GridTimetableRow[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw fields.missing("oral.timetable");
  }
  return value.map((row, index): GridTimetableRow => {
    // Rows are counted from 1, as they are read down the page.
    const path = `oral.timetable[${index + 1}]`;
    const written = fields.block(row, path);
    if (written === undefined) throw fields.missing(path);
    return {
      at: fields.text(written["at"], `${path}.at`),
      what: named(fields, written["what"], `${path}.what`, competencies),
    };
  });
}

/**
 * A timetable row's `what`, as written, once every Competency it names is one
 * the grid declares.
 *
 * The prose is not read for anything else: the timetable is a table of prose,
 * not a second place the Competencies are declared. What it may not do is
 * point a Student at a `Cn` that does not exist.
 */
function named(
  fields: Fields,
  value: FrontMatterValue | undefined,
  field: string,
  competencies: readonly Competency[]
): string {
  const written = fields.text(value, field);
  for (const id of written.match(COMPETENCY_ID) ?? []) {
    if (!isDeclared(competencies, id)) {
      throw new UndeclaredTimetableCompetency(
        fields.source,
        field,
        id,
        competencies
      );
    }
  }
  return written;
}
