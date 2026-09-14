// An entry point: the yes/no probes the Oral is run from, read from the front
// matter of the documents the catalog says define them.
//
// A third entry point rather than more of `index.ts`, for the reason
// `deliverables.ts` is a second one: what a document is and who it is for is one
// question, what a Student must hand in by when is another, and what the
// Instructor asks about it at the Oral is a third. They meet only in the table
// that says which document carries each set of definitions.
import { readProbes } from "./lib/probe.ts";

import type { Catalog } from "./index.ts";
import type { Probes } from "./lib/probe.ts";

export {
  MalformedProbes,
  MissingProbes,
  NoProbes,
  ProbeNamesABand,
  UnknownProbedCompetency,
} from "./lib/probe.ts";
export type { Probes } from "./lib/probe.ts";

/**
 * The probes each Competency's Probe Sheet carries, checked, in the order the
 * document writes them.
 *
 * Throws — naming the document and the Competency, and never falling back to a
 * default — when a document the table names defines no probes, when a
 * Competency has none, when a block is not a list of questions, or when a probe
 * names a Band.
 */
export function loadProbes(repoRoot: string, catalog: Catalog): Probes {
  return readProbes(repoRoot, catalog.probeSources);
}
