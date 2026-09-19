// An entry point: the Competencies the course is graded on, read from the
// front matter of the grid the catalog names, and checked against the
// Competency blocks of its body.
//
// An entry point of its own because the Competencies are read once and handed
// on: the Deliverables are checked against what this returns, handed to
// `deliverables.ts` rather than read again.
import { readGridBlocks } from "../documents/index.ts";

import { readCompetencies } from "./lib/competency.ts";
import { assertCompetencyBlocks } from "./lib/grid-body.ts";

import type { Competency } from "./lib/competency.ts";
import type { Catalog } from "./index.ts";

export {
  NoCompetencies,
  ProbesRetired,
  UntitledCompetency,
} from "./lib/competency.ts";
export {
  DuplicateCompetencyBlock,
  MisorderedBands,
  MissingBandTable,
  MissingCompetencyBlock,
  MissingSolidRow,
  StrayGridHeading,
  UndeclaredCompetencyBlock,
} from "./lib/grid-body.ts";
export type { Competency } from "./lib/competency.ts";

/**
 * Every Competency the grid declares, checked, in the order it declares them,
 * each with the id its place gives it: `C1`, `C2`, …
 *
 * Throws — naming the grid, and never falling back to a default — when the grid
 * has no `competencies:` block, when a Competency has no title, or when the
 * grid still has the retired `probes:` block. Throws too, naming the
 * Competency or the heading, unless the grid's body is one block per
 * Competency, headed by its id alone and holding the five Bands as the rows of
 * its table, in order, and nothing else under a `##` heading.
 */
export function loadCompetencies(
  repoRoot: string,
  catalog: Catalog
): readonly Competency[] {
  const competencies = readCompetencies(repoRoot, catalog.grid);
  assertCompetencyBlocks(
    catalog.grid,
    readGridBlocks(repoRoot, catalog.grid),
    competencies
  );
  return competencies;
}
