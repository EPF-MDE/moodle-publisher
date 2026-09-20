// An entry point: what the grid's front matter states about the course for the
// Grid Frame to print — the programme, the term, the Oral, and the Rehearsal,
// the Reading Day and the Oral's timetable where the course has them.
//
// An entry point of its own, beside the Competencies and the Deliverables read
// from the same front matter: each is read once, checked, and handed on to
// whatever prints it.
import { readGridFacts } from "./lib/grid-facts.ts";

import type { Catalog } from "./index.ts";
import type { GridFacts } from "./lib/grid-facts.ts";

export { MissingGridField } from "./lib/grid-facts.ts";
export type {
  GridFacts,
  GridReadingDay,
  GridRehearsal,
  GridTimetableRow,
} from "./lib/grid-facts.ts";

/**
 * The programme, the term and the Oral the grid states, each as written, with
 * the Rehearsal, the Reading Day and the Oral's timetable for a course that
 * declares them.
 *
 * Throws — naming the grid and the field, and never falling back to a
 * default — when any of `programme`, `term`, `oral`, `oral.length` or
 * `oral.when` is missing or is not text, and when a `rehearsal:`,
 * `readingDay:` or `oral.timetable:` that is written is missing a field of its
 * own. Leaving one of those three out is not a refusal: the Grid Frame then
 * says nothing about it.
 */
export function loadGridFacts(repoRoot: string, catalog: Catalog): GridFacts {
  return readGridFacts(repoRoot, catalog.grid);
}
