// Implementation: private to the catalog package.
//
// The Grid Source's body: one block per declared Competency, headed by its id
// alone, each holding a Band table with the five Bands as rows, in order
// (ADR-0014). Everything else a Student reads is the Grid Frame's.
//
// Every failure here is an abort naming the grid, thrown while the catalog is
// read and so before anything is written: a Competency published without its
// Band rows is one a Feedback Letter has no standard to read work against
// (ADR-0011).
import { idsOf, isDeclared } from "./competency.ts";

import type { GridBlock } from "../../documents/index.ts";
import type { Competency } from "./competency.ts";

/**
 * The five Bands, in order. The scale is fixed and the same in every course,
 * so it is written here rather than in any course's grid.
 */
const BANDS = ["Resit", "Needs Work", "Basic", "Solid", "Outstanding"];

/** The Band a Feedback Letter reads a Student's work against. */
const SOLID = "Solid";

/** How a block has to be headed, for the messages that say so. */
const HEADED_BY_ID =
  `each headed by the Competency's id alone ("## C1"), and everything else a Student ` +
  `reads is the Grid Frame's, which the publisher writes (ADR-0014)`;

/** A heading that names a Competency by its id, declared or not. */
const COMPETENCY_ID = /^C\d+$/;

/** A declared Competency the Grid Source has no block for. */
export class MissingCompetencyBlock extends Error {
  constructor(grid: string, competency: Competency) {
    super(
      `Refusing to start: "${grid}" declares ${competency.id} (${competency.title}) and has ` +
        `no block for it. Every declared Competency has one block, headed "## ${competency.id}" ` +
        `and holding its Band table: without it, the Competency is published with no standard ` +
        `to read work against (ADR-0011). Write the block, or remove the Competency from ` +
        `"competencies:".`
    );
    this.name = "MissingCompetencyBlock";
  }
}

/**
 * A block headed by the id of a Competency the grid does not declare: most
 * often a renumbering mistake, since an id is its place in `competencies:`.
 */
export class UndeclaredCompetencyBlock extends Error {
  constructor(grid: string, heading: string, competencies: readonly Competency[]) {
    super(
      `Refusing to start: "${grid}" has a block headed "## ${heading}", and its ` +
        `"competencies:" block declares ${idsOf(competencies)}. A Competency's id is its place ` +
        `in "competencies:", so removing or reordering one renumbers those after it. Renumber ` +
        `the blocks to match, or declare the Competency.`
    );
    this.name = "UndeclaredCompetencyBlock";
  }
}

/** Two blocks for one Competency: two standards, and a Student reads both. */
export class DuplicateCompetencyBlock extends Error {
  constructor(grid: string, id: string) {
    super(
      `Refusing to start: "${grid}" has two blocks for ${id}, each headed "## ${id}". A ` +
        `Competency has one standard: merge them into one block.`
    );
    this.name = "DuplicateCompetencyBlock";
  }
}

/** A `##` heading that heads no Competency block. */
export class StrayGridHeading extends Error {
  constructor(grid: string, heading: string) {
    super(
      `Refusing to start: "${grid}" has a "## ${heading}" heading. A Grid Source's body holds ` +
        `only its Competency blocks, ${HEADED_BY_ID}. Delete the section, or head the ` +
        `Competency's block with its id alone.`
    );
    this.name = "StrayGridHeading";
  }
}

/** A Competency block with no table whose rows name a Band. */
export class MissingBandTable extends Error {
  constructor(grid: string, id: string) {
    super(
      `Refusing to start: the block for ${id} in "${grid}" has no Band table. Each block ` +
        `holds a table with the five Bands as rows, in order, each Band written alone in ` +
        `its row's first cell: ${BANDS.join(", ")}.`
    );
    this.name = "MissingBandTable";
  }
}

/**
 * A Band table with no Solid row: the one row a Feedback Letter cannot do
 * without, so named on its own.
 */
export class MissingSolidRow extends Error {
  constructor(grid: string, id: string) {
    super(
      `Refusing to start: the Band table of ${id} in "${grid}" has no Solid row. The Solid ` +
        `row is the standard a Student's work is read against when their Feedback Letter is ` +
        `drafted (ADR-0011). Write it, between Basic and Outstanding.`
    );
    this.name = "MissingSolidRow";
  }
}

/** A Band table whose rows are not the five Bands, in order. */
export class MisorderedBands extends Error {
  constructor(grid: string, id: string, rows: readonly string[]) {
    super(
      `Refusing to start: the Band table of ${id} in "${grid}" has the rows ` +
        `${rows.join(", ")}. It has the five Bands as rows, in order: ${BANDS.join(", ")}.`
    );
    this.name = "MisorderedBands";
  }
}

/**
 * Throws unless the Band table among `tables`, the first whose rows name a
 * Band, has the five Bands as rows, in order.
 *
 * Found by what it says rather than by its place, so a block may show another
 * table, of evidence say, above its Bands.
 */
function assertBands(grid: string, id: string, tables: readonly (readonly string[])[]): void {
  const rows = tables.find((table) => table.some((row) => BANDS.includes(row)));
  if (rows === undefined) throw new MissingBandTable(grid, id);
  if (!rows.includes(SOLID)) throw new MissingSolidRow(grid, id);
  const inOrder =
    rows.length === BANDS.length && rows.every((row, at) => row === BANDS[at]);
  if (!inOrder) throw new MisorderedBands(grid, id, rows);
}

/**
 * Throws, naming `grid` and the first mistake in the order it is written,
 * unless `blocks` are one block per Competency of `competencies` with its Band
 * table, and nothing else.
 */
export function assertCompetencyBlocks(
  grid: string,
  blocks: readonly GridBlock[],
  competencies: readonly Competency[]
): void {
  const seen = new Set<string>();
  for (const { heading, tables } of blocks) {
    if (!COMPETENCY_ID.test(heading)) throw new StrayGridHeading(grid, heading);
    if (!isDeclared(competencies, heading)) {
      throw new UndeclaredCompetencyBlock(grid, heading, competencies);
    }
    if (seen.has(heading)) throw new DuplicateCompetencyBlock(grid, heading);
    seen.add(heading);
    assertBands(grid, heading, tables);
  }
  const missing = competencies.find((competency) => !seen.has(competency.id));
  if (missing !== undefined) throw new MissingCompetencyBlock(grid, missing);
}
