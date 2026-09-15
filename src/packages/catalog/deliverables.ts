// An entry point: the Deliverables the course requires, read from the front
// matter of the grid the catalog names.
//
// A second entry point rather than more of `index.ts`: what a document is and
// who it is for is one question, and what a Student must hand in by when is
// another. They meet only in the catalog, which says which document carries the
// definitions.
import { readDeliverables } from "./lib/deliverable.ts";

import type { Catalog } from "./index.ts";
import type { Deliverable } from "./lib/deliverable.ts";

export { COMPETENCIES } from "./lib/deliverable.ts";
export {
  DuplicateDeliverableId,
  FreezeNotInParis,
  MissingDeliverableField,
  NoDeliverables,
  UnknownCompetency,
  UnreadableFreeze,
  UnreadableVisibility,
  formatFreeze,
  formatInstant,
} from "./lib/deliverable.ts";
export type { Competency, Deliverable, Freeze } from "./lib/deliverable.ts";

/**
 * Every Deliverable the course requires, checked, in the order the grid
 * defines them.
 *
 * Throws — naming the Deliverable, and never falling back to a default — when
 * two share an id, when a Freeze is missing, unreadable or not written in
 * `Europe/Paris`, when a Competency is one this course does not have, or when
 * the grid defines none at all.
 *
 * Called before the course is opened, like {@link loadCatalog}: every one of
 * these is a mistake in the repository, and none of them is worth finding out
 * halfway through writing to Moodle.
 */
export function loadDeliverables(
  repoRoot: string,
  catalog: Catalog
): readonly Deliverable[] {
  return readDeliverables(repoRoot, catalog.grid);
}
