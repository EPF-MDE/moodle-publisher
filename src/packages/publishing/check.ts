// An entry point: a course repository checked without the Course.
//
// Everything a run refuses about the repository — `publisher.json`, the grid,
// every Published Document rendered, every cross-reference and picture
// resolved, the rule that no Student-facing document links to Instructor
// Material — refused with no site, no course id, no session and no browser,
// and with nothing written. It is what a course repository's pre-commit hook
// runs, so a broken link fails at commit time rather than in front of a class.
//
// It reads what a run reads, through the same loaders and the same plan, so a
// refusal added to either is a refusal here the day it lands, with the same
// message: fixing a commit is fixing a run.
import { documentsToPublish, loadCatalog } from "../catalog/index.ts";
import { loadDeliverables } from "../catalog/deliverables.ts";
import { loadProbes } from "../catalog/probes.ts";
import { formatHiddenLinks } from "./lib/cross-references.ts";
import { buildPlan } from "./plan.ts";

import type { HiddenLink } from "./lib/cross-references.ts";

/** What a check read, for the one line that says it passed. */
export interface CheckReport {
  readonly documents: number;
  readonly deliverables: number;
  readonly competencies: number;
  /** The warnings a plan would print, decided from the catalog's intent alone. */
  readonly hiddenLinks: readonly HiddenLink[];
}

/**
 * Checks the course repository at `repoRoot`, throwing the first refusal a run
 * would raise about it.
 *
 * Read in the order the commands read it — the catalog, the Deliverables, the
 * probes, then the plan — so a repository with two mistakes is refused over
 * the one a run would name first.
 *
 * The plan is built against a course holding nothing and a manifest recording
 * nothing, which is what "short of reading the Course" means: every document is
 * a create, so each is rendered and each of its links is decided, and the only
 * refusals left out are the ones about what the live course holds — a section
 * moved, instructor material already there — which no repository can answer.
 */
export function checkRepository(repoRoot: string): CheckReport {
  const catalog = loadCatalog(repoRoot);
  const deliverables = loadDeliverables(repoRoot, catalog);
  const probes = loadProbes(repoRoot, catalog);
  const plan = buildPlan({
    repoRoot,
    // No site: it is carried for applying, which a check never does.
    baseUrl: "",
    deliverables,
    documents: documentsToPublish(catalog),
    manifest: { entries: {} },
    snapshot: { courseId: "", sections: [], items: [] },
  });
  return {
    documents: plan.items.length,
    deliverables: plan.devoirs.length,
    competencies: Object.keys(probes).length,
    hiddenLinks: plan.hiddenLinks,
  };
}

/** `1 document` / `2 documents`, so the verdict reads as a sentence. */
function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The check as the instructor, or the hook, reads it. */
export function formatCheck(report: CheckReport): string {
  return [
    `Check passed: ${counted(report.documents, "document", "documents")}, ` +
      `${counted(report.deliverables, "Deliverable", "Deliverables")}, ` +
      `${counted(report.competencies, "Competency", "Competencies")} probed.`,
    ...formatHiddenLinks(report.hiddenLinks),
    "",
    "Nothing was read from Moodle and nothing was written.",
  ].join("\n");
}
