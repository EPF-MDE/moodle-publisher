// An entry point: the Competencies the course is graded on, read from the
// front matter of the grid the catalog names.
//
// An entry point of its own because `setup` and `import` need the Competencies
// and nothing else the grid defines: one Grade Item per Competency, and one
// pair of columns per Competency in the file that goes into them. The
// Deliverables and the probes are checked against the same declaration by
// `deliverables.ts` and `probes.ts`, which read it themselves.
import { readCompetencies } from "./lib/competency.ts";

import type { Competency } from "../course/gradebook.ts";
import type { Catalog } from "./index.ts";

export {
  CompetencyNamesABand,
  DuplicateCompetencyId,
  MissingCompetencyField,
  NoCompetencies,
} from "./lib/competency.ts";

/**
 * Every Competency the grid declares, checked, in the order it declares them.
 *
 * Throws — naming the grid, and never falling back to a default — when the grid
 * has no `competencies:` block, when a Competency has no id or no title, when a
 * title names a Band, or when two share an id.
 */
export function loadCompetencies(
  repoRoot: string,
  catalog: Catalog
): readonly Competency[] {
  return readCompetencies(repoRoot, catalog.grid);
}
