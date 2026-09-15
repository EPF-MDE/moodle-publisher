// Implementation: private to the catalog package.
//
// The Competencies a course is graded on, declared in the front matter of its
// grid beside the Deliverables that serve them and the probes the Oral asks
// about them. Declared there and nowhere else, for the reason `deliverable.ts`
// gives about the Freeze: what the gradebook grades, what a Devoir serves and
// what the Instructor asks are checked against each other by eye, in one diff.
//
// The grid writes a title per Competency and nothing else. The id is this
// program's — `C1`, `C2`, … in the order the grid declares them — and it is
// what a Deliverable's `competencies` and the `probes` keys refer to.
//
// Every failure here is an abort naming the grid. There is no default set of
// Competencies: a grid that lost its block would otherwise be graded on
// whatever this program last knew, which is another course's.
import { bandNamedIn } from "../../course/gradebook.ts";
import { frontMatter } from "../../documents/index.ts";

import { nonEmptyString } from "./scalar.ts";

import type { Competency } from "../../course/gradebook.ts";

/**
 * The grid the catalog names declares no Competencies.
 *
 * Not "no Competencies, then", for the reason {@link NoDeliverables} is not "no
 * Deliverables, then": a course with nothing to grade on has no Grade Item to
 * make, no Probe Sheet to prepare and no Devoir that serves anything.
 */
export class NoCompetencies extends Error {
  constructor(grid: string) {
    super(
      `Refusing to start: "${grid}" is the grid that declares the Competencies, and its ` +
        `front matter declares none. Competencies are written in a "competencies:" block at ` +
        `the top of the file, one "- " line with its title per Competency. Restore it, or ` +
        `point the catalog's grid at the document that declares them.`
    );
    this.name = "NoCompetencies";
  }
}

/**
 * A Competency written as something other than its title.
 *
 * A title is not defaulted: the Grade Item a Competency is graded in is named
 * after it, and a guessed one is a Grade Item the Instructor cannot tell apart
 * from its neighbours.
 */
export class UntitledCompetency extends Error {
  constructor(source: string, id: string) {
    super(
      `Refusing to start: Competency ${id} in "${source}" has no title. Every Competency ` +
        `is written under "competencies:" as one "- " line carrying its title; its Grade ` +
        `Item is named after it, so it is not defaulted.`
    );
    this.name = "UntitledCompetency";
  }
}

/**
 * A Competency whose title names a Band.
 *
 * The title is half the name of its Grade Item, and that name heads a column of
 * the Probe Sheets file. A Band there is this program suggesting a verdict
 * (ADR-0002), which `probes` refuses — so a title carrying one would be let
 * through `setup`, made into a Grade Item, and then stop every generation after
 * it, with nothing left to fix but a rename by hand in the gradebook. It is
 * refused here, before any of that, where the fix is a word in the grid.
 */
export class CompetencyNamesABand extends Error {
  constructor(source: string, competency: Competency, band: string) {
    super(
      `Refusing to start: Competency ${competency.id} in "${source}" is titled ` +
        `"${competency.title}", which names the band "${band}". Its Grade Item and its ` +
        `Probe Sheet column are named after the title, and nothing this tooling writes ` +
        `suggests a band. Retitle it.`
    );
    this.name = "CompetencyNamesABand";
  }
}

/** The ids of `competencies`, as a message lists them. */
export function idsOf(competencies: readonly Competency[]): string {
  return competencies.map((competency) => competency.id).join(", ");
}

/** Whether `id` is one of the Competencies the grid declares. */
export function isDeclared(
  competencies: readonly Competency[],
  id: string
): boolean {
  return competencies.some((competency) => competency.id === id);
}

/**
 * Every Competency the grid declares, checked, in the order it declares them.
 *
 * The order is the gradebook's and the Probe Sheets' too: Grade Items are made
 * and columns are written in it, and each Competency's id is its place in it.
 */
export function readCompetencies(
  repoRoot: string,
  grid: string
): readonly Competency[] {
  const written = frontMatter(repoRoot, grid)?.["competencies"];
  if (!Array.isArray(written) || written.length === 0) {
    throw new NoCompetencies(grid);
  }
  return written.map((entry, index) => {
    const id = `C${index + 1}`;
    const title = nonEmptyString(entry);
    if (title === undefined) throw new UntitledCompetency(grid, id);
    const band = bandNamedIn(title);
    if (band !== undefined) {
      throw new CompetencyNamesABand(grid, { id, title }, band);
    }
    return { id, title };
  });
}
