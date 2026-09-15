// Implementation: private to the catalog package.
//
// The Competencies a course is graded on, declared in the front matter of its
// grid beside the Deliverables that serve them and the probes the Oral asks
// about them. Declared there and nowhere else, for the reason `deliverable.ts`
// gives about the Freeze: what the gradebook grades, what a Devoir serves and
// what the Instructor asks are checked against each other by eye, in one diff.
//
// Every failure here is an abort naming the grid. There is no default set of
// Competencies: a grid that lost its block would otherwise be graded on
// whatever this program last knew, which is another course's.
import { bandNamedIn } from "../../course/gradebook.ts";
import { frontMatter } from "../../documents/index.ts";

import type { Competency } from "../../course/gradebook.ts";
import type { FrontMatter, FrontMatterValue } from "../../documents/index.ts";

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
        `the top of the file, one "- id:" with its "title:" per Competency. Restore it, or ` +
        `point the catalog's grid at the document that declares them.`
    );
    this.name = "NoCompetencies";
  }
}

/**
 * A Competency is missing its id or its title.
 *
 * Neither is defaulted. The Grade Item a Competency is graded in is named
 * `<id> — <title>` and recorded under the id, so a guessed id is a Grade Item a
 * later run no longer recognises, and a guessed title is one the Instructor
 * cannot tell apart from its neighbours.
 */
export class MissingCompetencyField extends Error {
  constructor(source: string, id: string | undefined, field: string) {
    super(
      `Refusing to start: ${
        id === undefined
          ? `a Competency in "${source}"`
          : `Competency "${id}" in "${source}"`
      } has no "${field}". Every Competency states its id and its title under ` +
        `"competencies:"; its Grade Item is named after both, so neither is defaulted.`
    );
    this.name = "MissingCompetencyField";
  }
}

/**
 * Two Competencies share an id.
 *
 * A Grade Item is recorded under its Competency's id, so two of them are two
 * Grade Items competing for one record — and two Probe Sheet columns nobody
 * could map apart on import.
 */
export class DuplicateCompetencyId extends Error {
  constructor(source: string, id: string, first: Competency, second: Competency) {
    super(
      `Refusing to start: "${source}" declares two Competencies with the id "${id}" — ` +
        `"${first.title}" and "${second.title}". A Grade Item is recorded under its ` +
        `Competency's id, so two of them would compete for one. Give one of them a ` +
        `different id.`
    );
    this.name = "DuplicateCompetencyId";
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
      `Refusing to start: Competency "${competency.id}" in "${source}" is titled ` +
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
 * and columns are written in it.
 */
export function readCompetencies(
  repoRoot: string,
  grid: string
): readonly Competency[] {
  const written = frontMatter(repoRoot, grid)?.["competencies"];
  if (!Array.isArray(written) || written.length === 0) {
    throw new NoCompetencies(grid);
  }
  const byId = new Map<string, Competency>();
  return written.map((entry) => {
    const competency = readCompetency(grid, entry);
    const first = byId.get(competency.id);
    if (first !== undefined) {
      throw new DuplicateCompetencyId(grid, competency.id, first, competency);
    }
    byId.set(competency.id, competency);
    return competency;
  });
}

function readCompetency(source: string, entry: FrontMatterValue): Competency {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new MissingCompetencyField(source, undefined, "id");
  }
  const fields = entry as FrontMatter;
  const id = nonEmptyString(fields["id"]);
  if (id === undefined) throw new MissingCompetencyField(source, undefined, "id");
  const title = nonEmptyString(fields["title"]);
  if (title === undefined) throw new MissingCompetencyField(source, id, "title");
  const band = bandNamedIn(title);
  if (band !== undefined) {
    throw new CompetencyNamesABand(source, { id, title }, band);
  }
  return { id, title };
}

/** A field's value when it was written as a non-empty string, else undefined. */
export function nonEmptyString(
  value: FrontMatterValue | undefined
): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim() === "" ? undefined : value.trim();
}
