// Implementation: private to the catalog package.
//
// The Competencies a course is graded on, declared in the front matter of its
// grid beside the Deliverables that serve them. Declared there and nowhere
// else, for the reason `deliverable.ts` gives about the Freeze: what a Devoir
// serves and what Students read are checked against each other by eye, in one
// diff.
//
// The grid writes a title per Competency and nothing else. The id is this
// program's — `C1`, `C2`, … in the order the grid declares them — and it is
// what a Deliverable's `competencies` refer to.
//
// Every failure here is an abort naming the grid. There is no default set of
// Competencies: a grid that lost its block would otherwise be graded on
// whatever this program last knew, which is another course's.
import { frontMatter } from "../../documents/index.ts";

import { nonEmptyString } from "./scalar.ts";

/**
 * One independently graded Competency, as the course's grid declares it.
 *
 * Declared by the course rather than written here, so a course graded on two or
 * five is as publishable as one graded on three. The grid writes only the
 * title; the id is `C1`, `C2`, … by the order it declares them, so reordering
 * the grid renumbers the Competencies.
 */
export interface Competency {
  readonly id: string;
  readonly title: string;
}

/**
 * The grid the catalog names declares no Competencies.
 *
 * Not "no Competencies, then", for the reason {@link NoDeliverables} is not "no
 * Deliverables, then": a course with nothing to grade on has no Devoir that
 * serves anything.
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
 * A title is not defaulted: a guessed one is a Competency the Instructor cannot
 * tell apart from its neighbours.
 */
export class UntitledCompetency extends Error {
  constructor(source: string, id: string) {
    super(
      `Refusing to start: Competency ${id} in "${source}" has no title. Every Competency ` +
        `is written under "competencies:" as one "- " line carrying its title, and it ` +
        `is not defaulted.`
    );
    this.name = "UntitledCompetency";
  }
}

/**
 * A grid that still carries the retired `probes:` block.
 *
 * Refused rather than ignored: the block was the Oral's checklist, and a grid
 * that keeps it keeps a copy of its own Solid column that nothing reads any
 * more and that drifts from it unnoticed (ADR-0011).
 */
export class ProbesRetired extends Error {
  constructor(grid: string) {
    super(
      `Refusing to start: "${grid}" still has a "probes:" block in its front matter. ` +
        `Probes were retired with the Probe Sheet, and the publisher no longer reads them ` +
        `(ADR-0011, "The Feedback Letter replaces the Probe Sheet"). Delete the "probes:" ` +
        `block from the grid: its Solid column is what a Student's work is read against.`
    );
    this.name = "ProbesRetired";
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
 * Each Competency's id is its place in that order.
 */
export function readCompetencies(
  repoRoot: string,
  grid: string
): readonly Competency[] {
  const declared = frontMatter(repoRoot, grid);
  if (declared !== undefined && "probes" in declared) {
    throw new ProbesRetired(grid);
  }
  const written = declared?.["competencies"];
  if (!Array.isArray(written) || written.length === 0) {
    throw new NoCompetencies(grid);
  }
  return written.map((entry, index) => {
    const id = `C${index + 1}`;
    const title = nonEmptyString(entry);
    if (title === undefined) throw new UntitledCompetency(grid, id);
    return { id, title };
  });
}
