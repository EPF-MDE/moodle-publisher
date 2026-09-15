// An entry point: the Competencies the course is graded on, read from the
// front matter of the grid the catalog names.
//
// An entry point of its own because `setup` and `import` need the Competencies
// and nothing else the grid defines: one Grade Item per Competency, and one
// pair of columns per Competency in the file that goes into them. The
// Deliverables and the probes are checked against what this returns, handed to
// `deliverables.ts` and `probes.ts` rather than read again by each.
import { readCompetencies } from "./lib/competency.ts";

import type { Competency } from "../course/gradebook.ts";
import type { Catalog } from "./index.ts";

export {
  CompetencyNamesABand,
  NoCompetencies,
  UntitledCompetency,
} from "./lib/competency.ts";

/**
 * Every Competency the grid declares, checked, in the order it declares them,
 * each with the id its place gives it: `C1`, `C2`, …
 *
 * Throws — naming the grid, and never falling back to a default — when the grid
 * has no `competencies:` block, when a Competency has no title, or when a title
 * names a Band.
 */
export function loadCompetencies(
  repoRoot: string,
  catalog: Catalog
): readonly Competency[] {
  return readCompetencies(repoRoot, catalog.grid);
}
