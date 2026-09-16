// Implementation: private to the catalog package.
//
// A Deliverable is something required from a Student by a stated instant, and
// it is defined once — in the front matter of the document whose prose states
// the same instant two lines below. The reading is here; which document that
// is — the grid — the catalog names, like every other membership question in
// this package.
//
// A Deliverable does not say where it goes. There is one section Devoirs land
// in — `DELIVERABLE_SECTION` — and its membership is derived from the
// Deliverables the grid defines rather than named by an entry, so there is
// exactly one way for anything to arrive there.
//
// Every failure in this file is an abort that names the Deliverable it is
// about. There is no default id, no default title and, above all, no default
// Freeze: a Deliverable this program had to guess at is a Devoir a student
// meets at a deadline that nobody wrote down.
import { frontMatter } from "../../documents/index.ts";

import { idsOf, isDeclared } from "./competency.ts";
import { formatFreeze, formatInstant, readFreeze } from "./freeze.ts";
import { nonEmptyString } from "./scalar.ts";

import type { Competency } from "./competency.ts";
import type { FrontMatter, FrontMatterValue } from "../../documents/index.ts";
import type { Freeze } from "./freeze.ts";

/** One Deliverable, as everything downstream of the catalog sees it. */
export interface Deliverable {
  /**
   * Authored, never computed from position. Inserting a Deliverable above
   * another one must not rename it, because the manifest keys the Devoir
   * already published by this.
   */
  readonly id: string;
  /** What Students read on the course page — never the id. */
  readonly title: string;
  /**
   * The ids of the Competencies it serves, each one the grid declares. A
   * Deliverable serving one the grid does not declare is a typo — the course
   * has no such thing to grade it on.
   */
  readonly competencies: readonly string[];
  /**
   * The instant it stops accepting work. Written `due` in the front matter,
   * which is the word Moodle's own form uses; a Freeze everywhere else,
   * because what it is here is the enforced instant and not a stated date.
   */
  readonly freeze: Freeze;
  /** Whether the Devoir is visible when it is created. Defaults to true. */
  readonly visible: boolean;
  /** The document whose front matter defines it, for messages about it. */
  readonly source: string;
}

/** How a Deliverable is named in a message before its id is known to be sound. */
function named(source: string, id: string | undefined): string {
  return id === undefined
    ? `a Deliverable in "${source}"`
    : `Deliverable "${id}"`;
}

/**
 * The grid the catalog names defines no Deliverables.
 *
 * Not "no Deliverables, then". Naming a grid is a statement that the
 * Deliverables are in it, and a run that quietly published no Devoir — because
 * the grid lost its front matter, or because the catalog names the wrong
 * document — would leave students with nowhere to hand in and an instructor
 * with a plan that looked fine.
 */
export class NoDeliverables extends Error {
  constructor(grid: string) {
    super(
      `Refusing to start: "${grid}" is the grid that defines the Deliverables, and its ` +
        `front matter defines none. Deliverables are written in a "deliverables:" block at the ` +
        `top of the file. Restore it, or point the catalog's grid at the document that defines them.`
    );
    this.name = "NoDeliverables";
  }
}

/**
 * Two Deliverables share an id.
 *
 * Both are named — by title and by the document that defines them, because a
 * copy-paste produces two entries with the same title as readily as the same
 * id, and "one of these two" is not a message anyone can act on. The fix is
 * deciding which of the two entries is wrong, and there is no way to tell that
 * from one of them.
 *
 * The manifest keys a Devoir by this id: two Deliverables carrying one id are
 * two Devoirs competing for one record, and whichever ran second would
 * overwrite the first.
 */
export class DuplicateDeliverableId extends Error {
  constructor(id: string, first: Deliverable, second: Deliverable) {
    super(
      `Refusing to start: two Deliverables are defined with the id "${id}" — ` +
        `"${first.title}" in "${first.source}" and "${second.title}" in "${second.source}". ` +
        `An id is what the published Devoir is recorded under, so two of them ` +
        `would compete for one record. Give one of them a different id.`
    );
    this.name = "DuplicateDeliverableId";
  }
}

/** A Deliverable is missing a field that has no sound default. */
export class MissingDeliverableField extends Error {
  constructor(source: string, id: string | undefined, field: string) {
    super(
      `Refusing to start: ${named(source, id)} has no "${field}". Every Deliverable states its ` +
        `id, title, competencies and due in the front matter of "${source}"; none of them is ` +
        `defaulted.`
    );
    this.name = "MissingDeliverableField";
  }
}

/**
 * A `due` that is not an instant this program can read.
 *
 * Fatal, and deliberately so: the alternative to stopping is publishing a
 * Devoir with whatever date a lenient parser made of it, which is discovered
 * by a student at a deadline.
 */
export class UnreadableFreeze extends Error {
  constructor(source: string, id: string, written: string) {
    super(
      `Refusing to start: Deliverable "${id}" in "${source}" has due "${written}", which is not ` +
        `an instant this program can read. Write it as a date, a time and an explicit ` +
        `Europe/Paris offset, e.g. 2026-09-10T20:00:00+02:00. Nothing is defaulted: a Freeze ` +
        `this program guessed at is one a student meets at a deadline.`
    );
    this.name = "UnreadableFreeze";
  }
}

/**
 * A `due` whose offset is not the one `Europe/Paris` was on that day.
 *
 * The quiet failure this catches: `+01:00` on 10 September parses, and means
 * 21:00 Paris time. So does `Z`, and so does anything written without an
 * offset at all — which would be read against whichever zone the machine
 * running the publisher happens to be in.
 */
export class FreezeNotInParis extends Error {
  constructor(
    source: string,
    id: string,
    written: string,
    offset: string,
    paris: string
  ) {
    super(
      `Refusing to start: Deliverable "${id}" in "${source}" has due "${written}", whose offset ` +
        `is ${offset}, but Europe/Paris is ${paris} at that instant. The Freeze is written as ` +
        `the timetable states it, in Paris time, with the offset that makes it one instant: ` +
        `write it as ${paris}, or correct the time.`
    );
    this.name = "FreezeNotInParis";
  }
}

/**
 * A `visible` that is written down and is not `true` or `false`.
 *
 * The one field with a default, so it is the one field a typo can pass
 * through: anything that is not `false` would otherwise read as visible, and
 * the Deliverable that says `visible: false` is the C3 one, hidden until the
 * autonomy slot begins.
 */
export class UnreadableVisibility extends Error {
  constructor(source: string, id: string, written: string) {
    super(
      `Refusing to start: Deliverable "${id}" in "${source}" has visible "${written}", which is ` +
        `neither true nor false. Leave it out for a Devoir students see as soon as it is ` +
        `published, or write "visible: false" for one that ships hidden.`
    );
    this.name = "UnreadableVisibility";
  }
}

/** A Deliverable serving a Competency the grid does not declare. */
export class UnknownCompetency extends Error {
  constructor(
    source: string,
    id: string,
    competency: string,
    declared: readonly Competency[]
  ) {
    super(
      `Refusing to start: Deliverable "${id}" in "${source}" serves competency "${competency}", ` +
        `which "${source}" does not declare. The competencies are ${idsOf(declared)}. ` +
        `A Devoir published against a competency nobody is graded on is work handed in for ` +
        `nothing.`
    );
    this.name = "UnknownCompetency";
  }
}

/**
 * Every Deliverable the grid defines, checked against the Competencies it
 * declares.
 *
 * Every one of them read before anything else happens: these are startup
 * guards, and the point of them is that they fire before the course is opened.
 */
export function readDeliverables(
  repoRoot: string,
  grid: string,
  competencies: readonly Competency[]
): readonly Deliverable[] {
  const defined = deliverablesIn(repoRoot, grid, competencies);
  if (defined.length === 0) throw new NoDeliverables(grid);
  const byId = new Map<string, Deliverable>();
  for (const deliverable of defined) {
    const first = byId.get(deliverable.id);
    if (first !== undefined) {
      throw new DuplicateDeliverableId(deliverable.id, first, deliverable);
    }
    byId.set(deliverable.id, deliverable);
  }
  return defined;
}

function deliverablesIn(
  repoRoot: string,
  source: string,
  competencies: readonly Competency[]
): readonly Deliverable[] {
  const written = frontMatter(repoRoot, source)?.["deliverables"];
  if (written === undefined) return [];
  if (!Array.isArray(written)) {
    throw new NoDeliverables(source);
  }
  return written.map((entry) => readDeliverable(source, entry, competencies));
}

function readDeliverable(
  source: string,
  entry: FrontMatterValue,
  competencies: readonly Competency[]
): Deliverable {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new MissingDeliverableField(source, undefined, "id");
  }
  const fields = entry as FrontMatter;
  const id = nonEmptyString(fields["id"]);
  if (id === undefined)
    throw new MissingDeliverableField(source, undefined, "id");

  const title = nonEmptyString(fields["title"]);
  if (title === undefined)
    throw new MissingDeliverableField(source, id, "title");

  return {
    id,
    title,
    competencies: readServed(source, id, fields["competencies"], competencies),
    freeze: readDue(source, id, fields["due"]),
    visible: readVisible(source, id, fields["visible"]),
    source,
  };
}

/**
 * Whether the Devoir is created visible. Absent means visible, and that is the
 * one default in a Deliverable: the safe direction, because a Devoir that
 * shipped visible and should not have is a hide the instructor makes in
 * Moodle, whereas nothing recovers a Freeze that was wrong.
 *
 * Written and not a boolean is not that default, though — it is a typo, and
 * `visible: fasle` reading as "visible" is precisely how the C3 Devoir would
 * appear on the course page a week before the exercise.
 */
function readVisible(
  source: string,
  id: string,
  written: FrontMatterValue | undefined
): boolean {
  if (written === undefined) return true;
  if (typeof written !== "boolean") {
    throw new UnreadableVisibility(source, id, String(written));
  }
  return written;
}

/** The ids of the Competencies a Deliverable serves, each one declared. */
function readServed(
  source: string,
  id: string,
  written: FrontMatterValue | undefined,
  declared: readonly Competency[]
): readonly string[] {
  const listed =
    written === undefined ? [] : Array.isArray(written) ? written : [written];
  const served = listed.map((entry) => {
    const name = nonEmptyString(entry);
    if (name === undefined || !isDeclared(declared, name)) {
      throw new UnknownCompetency(source, id, String(name ?? entry), declared);
    }
    return name;
  });
  if (served.length === 0) {
    throw new MissingDeliverableField(source, id, "competencies");
  }
  return served;
}

function readDue(
  source: string,
  id: string,
  written: FrontMatterValue | undefined
): Freeze {
  const due = nonEmptyString(written);
  if (due === undefined) throw new MissingDeliverableField(source, id, "due");
  const reading = readFreeze(due);
  if (reading.ok) return reading.freeze;
  if (reading.problem.kind === "not-paris") {
    throw new FreezeNotInParis(
      source,
      id,
      due,
      reading.problem.written,
      reading.problem.paris
    );
  }
  throw new UnreadableFreeze(source, id, due);
}

export { formatFreeze, formatInstant };
export type { Freeze };
