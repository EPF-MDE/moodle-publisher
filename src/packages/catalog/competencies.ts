// An entry point: the Competencies the course is graded on, read from the
// front matter of the grid the catalog names.
//
// An entry point of its own because the Competencies are read once and handed
// on: the Deliverables are checked against what this returns, handed to
// `deliverables.ts` rather than read again.
import { readCompetencies } from "./lib/competency.ts";

import type { Competency } from "./lib/competency.ts";
import type { Catalog } from "./index.ts";

export {
  NoCompetencies,
  ProbesRetired,
  UntitledCompetency,
} from "./lib/competency.ts";
export type { Competency } from "./lib/competency.ts";

/**
 * Every Competency the grid declares, checked, in the order it declares them,
 * each with the id its place gives it: `C1`, `C2`, …
 *
 * Throws — naming the grid, and never falling back to a default — when the grid
 * has no `competencies:` block, when a Competency has no title, or when the
 * grid still has the retired `probes:` block.
 */
export function loadCompetencies(
  repoRoot: string,
  catalog: Catalog
): readonly Competency[] {
  return readCompetencies(repoRoot, catalog.grid);
}
