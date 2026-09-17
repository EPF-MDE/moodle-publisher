// An entry point: what a run would do, decided before anything is applied.
//
// Reporting the plan is the default; applying is opt-in, so this is what most
// invocations produce and nothing else happens.
//
// Every Published Document is published as a PDF. The plan is decided against
// a reading of the live course as well as the manifest, because one of the
// things it decides is whether Instructor Material somebody revealed has to be
// re-hidden — and no record on disk can answer that.
import { formatFreeze } from "../catalog/deliverables.ts";
import { DELIVERABLE_SECTION, SECTION_ORDER } from "../course/index.ts";
import { renderDocument } from "../documents/index.ts";
import { devoirEntryFor, documentEntryFor } from "../manifest/index.ts";
import { checkCrossReferences } from "./lib/cross-references.ts";
import { DevoirBriefNotPublished, devoirContentHash } from "./lib/devoirs.ts";
import { pdfFileName } from "./lib/print-ready.ts";

import type {
  CourseItem,
  CourseSnapshot,
  SectionName,
} from "../course/index.ts";
import type { PublishedDocument } from "../catalog/index.ts";
import type { Deliverable } from "../catalog/deliverables.ts";
import type { RenderedDocument } from "../documents/index.ts";
import type {
  DevoirEntry,
  FileResourceEntry,
  Manifest,
  PageEntry,
} from "../manifest/index.ts";
import type { CrossReferenceInput } from "./lib/cross-references.ts";

export { DevoirBriefNotPublished } from "./lib/devoirs.ts";
export { LinkToInstructorOnly } from "./lib/cross-references.ts";

/**
 * What a run would do to one document: create its PDF, or leave alone the one
 * the manifest already records.
 */
export type PlanVerb = "create" | "skip";

interface PlannedDocument {
  readonly document: PublishedDocument;
  /**
   * What the plan read off disk and what it hashed to. Applying uses exactly
   * this, so what reaches the course is what the instructor was shown, and a
   * document is rendered once per run.
   */
  readonly rendered: RenderedDocument;
  /** The name the PDF is stored under: the source's basename with `.pdf`. */
  readonly fileName: string;
  /**
   * The activity is `enforced-hidden`, and the course has it visible. It is
   * re-hidden, whatever else this run does to it.
   *
   * This is the only visibility the publisher writes outside a create, and it
   * only ever conceals: there is no flag here that reveals anything.
   */
  readonly hide: boolean;
}

/**
 * What a run would do to one document. The verb carries the manifest entry
 * with it, so the activity a skip leaves standing is on the item that says
 * `skip` and nowhere else.
 *
 * The entry may still be a page an earlier publisher made: it is in the
 * course all the same, and is left there.
 */
export type PlanItem =
  | (PlannedDocument & { readonly verb: "create" })
  | (PlannedDocument & {
      readonly verb: "skip";
      readonly published: FileResourceEntry | PageEntry;
    });

export interface Plan {
  /**
   * The Moodle site, so that applying can turn the brief's course module id
   * into the URL a Devoir's description points at. Decided by the configuration
   * and carried here rather than read again lower down, so one run cannot write
   * links to a second site.
   */
  readonly baseUrl: string;
  readonly items: readonly PlanItem[];
  /**
   * What this run would do to the Devoirs, one entry per Deliverable, in the
   * order the front matter defines them.
   *
   * Every Deliverable is here whatever the verb, so that the block an
   * instructor reads before applying states every Freeze in full — including
   * the ones nothing is going to happen to. A Deliverable left out because it
   * was already published is a date nobody reads again until a student meets
   * it.
   */
  readonly devoirs: readonly DevoirPlanItem[];
}

/**
 * What a run would do to one Devoir.
 *
 * An `update` rewrites the activity that is already in the course, keeping
 * the module id every Submission hangs off.
 */
export type DevoirVerb = "create" | "update" | "skip";

interface PlannedDevoir {
  readonly deliverable: Deliverable;
  /**
   * The document whose front matter defines this Deliverable, and which its
   * description links to.
   *
   * There is no field naming a brief, and there should not be: the definition
   * and the prose that explains it are one screen apart in one file, which is
   * the whole reason the definitions live where they do. So the brief is that
   * file, and a Deliverable defined in a document nobody publishes aborts.
   */
  readonly brief: PublishedDocument;
}

/**
 * What a run would do to one Devoir. As {@link PlanItem}, the verb carries the
 * manifest entry with it, so what is already in the course is on the item that
 * says `skip` and nowhere else.
 */
export type DevoirPlanItem =
  | (PlannedDevoir & { readonly verb: "create" })
  | (PlannedDevoir & {
      readonly verb: "skip";
      readonly published: DevoirEntry;
    })
  | (PlannedDevoir & {
      readonly verb: "update";
      /** The Devoir already in the course, and the record of it. */
      readonly published: DevoirEntry;
    });

/**
 * The table has moved a published document to a different section.
 *
 * The publisher never moves an activity, so there is no verb that would make
 * this true, and reporting `skip` would state a verdict that is not
 * true of the document: the plan would claim there was no work to do while the
 * grid sat in the section the table no longer names.
 */
export class SectionMoved extends Error {
  constructor(source: string, from: string, to: string) {
    super(
      `Aborting: "${source}" is published in section ${from}, but the table now says ${to}. ` +
        `The publisher does not move activities. ` +
        `Delete it in Moodle and run again to have it created in ${to}.`
    );
    this.name = "SectionMoved";
  }
}

/**
 * The course already holds an instructor activity the manifest has no record
 * of — a lost or stale manifest, or a copy made by hand.
 *
 * Planning a `create` here would publish a second copy of the answer key, and
 * the copy the manifest does not know about is the one no later run would
 * re-hide: it would sit in the course, unmanaged, until a human noticed it.
 * So this aborts and asks for the ambiguity to be settled in Moodle, where
 * both copies can be seen, rather than guessing which one is canonical.
 */
export class AlreadyInCourse extends Error {
  constructor(source: string, title: string, section: string) {
    super(
      `Aborting: the manifest has no record of "${source}", so this run would create it, ` +
        `but section ${section} already holds an activity called "${title}". ` +
        `Publishing would put a second copy of examiner-only material in the course, ` +
        `and nothing would re-hide the copy this run does not record. ` +
        `Delete the activity in Moodle, or restore the manifest that recorded it, then run again.`
    );
    this.name = "AlreadyInCourse";
  }
}

/**
 * Everything a plan is decided from: the repository, the tables, the course.
 *
 * Deciding a link takes only the table, so that part is declared once, where
 * the link rules live, and this widens it.
 */
export interface PlanInput extends CrossReferenceInput {
  readonly manifest: Manifest;
  /** The course as it stands. */
  readonly snapshot: CourseSnapshot;
  readonly repoRoot: string;
  /** The Moodle site a Devoir's description will point at. */
  readonly baseUrl: string;
  /**
   * The Deliverables, already read and already checked. Handed in rather than
   * read here, because every refusal they can produce has to happen before the
   * course is opened, and the plan is built with the course already open.
   */
  readonly deliverables: readonly Deliverable[];
}

/**
 * Compares the tables against the manifest, the current content of each
 * document and the live course, to decide, per document, what a run would do.
 *
 * Every document the table names is planned: nothing is filtered out, so a
 * document missing from the plan is a document missing from the table.
 */
export function buildPlan(input: PlanInput): Plan {
  const { repoRoot, documents, manifest, snapshot } = input;

  const live = new Map(snapshot.items.map((item) => [item.moduleId, item]));
  // Where every document the table names is published — its title and its
  // Section — which is what a link to it is published *as*. The same reading
  // `checkCrossReferences` makes below, so a link cannot be labelled by one
  // table and checked against another.
  const targets = new Map(
    documents.map((document) => [
      document.source,
      { title: document.title, section: document.section },
    ])
  );
  const items = documents.map((document): PlanItem => {
    const rendered = renderDocument(repoRoot, document.source, (link) =>
      targets.get(link.target)
    );
    const fileName = pdfFileName(document.source);
    const published = documentEntryFor(manifest, document.source);
    // The activity the manifest points at, as the course holds it now. Absent
    // means the record outlived what it recorded: the activity was deleted in
    // Moodle, by hand or by a rebuild this publisher was not part of, and the
    // module id names nothing. There is nothing standing, so this is a create.
    const standing =
      published === undefined ? undefined : live.get(published.moduleId);
    if (published === undefined || standing === undefined) {
      assertNotAlreadyInCourse(document, snapshot);
      // Created hidden when the policy says so, so there is no moment between
      // being created and being hidden. Nothing to re-hide.
      return { document, rendered, fileName, hide: false, verb: "create" };
    }
    // Only asked of an activity that is standing. A document whose activity
    // was deleted so it could be published elsewhere has already been created
    // above, in the section the table now names — which is what SectionMoved
    // tells the instructor to do.
    if (published.section !== document.section) {
      throw new SectionMoved(
        document.source,
        published.section,
        document.section
      );
    }
    const hide =
      document.visibility === "enforced-hidden" && standing.visible === true;
    // A document already in the course is left as it stands, changed or not:
    // this run creates PDFs and never rewrites one.
    return { document, rendered, fileName, hide, verb: "skip", published };
  });

  // After the items, so that a run refused over a link has already read every
  // document — one report naming the bad link, rather than one per run as each
  // is fixed. Before anything is applied, which is what matters: the plan is
  // built by the reporting path too, so `publish` without `--apply` is a link
  // check.
  //
  // Checked against every document the table names: a link whose target is
  // absent from it is published as its own text, and is nobody's refusal.
  checkCrossReferences(
    input,
    items.flatMap((item) =>
      item.rendered.links.map((link) => ({ document: item.document, link }))
    )
  );

  return {
    baseUrl: input.baseUrl,
    items,
    devoirs: planDevoirs(input, documents, createdSources(items), live),
  };
}

/**
 * What the run would do to each Devoir: create the ones the course does not
 * hold, rewrite the ones whose Deliverable has been edited, and leave the rest
 * alone.
 *
 * An edit is rewritten in place and never recreated. The module id is what
 * every Submission, every bookmark and every link to the activity hangs off,
 * and this course's Devoirs are the one place students' work exists at all.
 *
 * `skip` is decided by content, as it is for a document: what the Deliverable
 * would be published as now, against what the manifest says it was published
 * as. A record with no hash in it is one an earlier version of this program
 * wrote, before a Devoir could be edited; it cannot be called unchanged, so it
 * is rewritten once and the record is complete from then on.
 */
function planDevoirs(
  input: PlanInput,
  documents: readonly PublishedDocument[],
  /** The documents this run is about to make, by source: {@link createdSources}. */
  created: ReadonlySet<string>,
  /** The course as it stands, by module id: the same reading the documents got. */
  live: ReadonlyMap<string, CourseItem>
): readonly DevoirPlanItem[] {
  return input.deliverables.map((deliverable): DevoirPlanItem => {
    const brief = documents.find(
      (document) => document.source === deliverable.source
    );
    if (brief === undefined) {
      throw new DevoirBriefNotPublished(deliverable.id, deliverable.source);
    }
    const published = devoirEntryFor(input.manifest, deliverable.id);
    // Nothing recorded, or a record that outlived what it recorded: the Devoir
    // was deleted in Moodle, and the module id names nothing. There is nothing
    // to rewrite, so this is a create — the same reading a document whose
    // activity is gone gets, and the same one it has to get, because opening an update
    // form on a module id Moodle does not have is an error page.
    if (published === undefined || !live.has(published.moduleId)) {
      return { deliverable, brief, verb: "create" };
    }
    // The brief is being created in this run, so it is about to have a module
    // id it did not have before, and the link in the Devoir's description
    // points at the activity that is gone. The hash cannot see that — it is
    // taken over the repository and deliberately not over the state of the
    // course — so the run is what sees it, and the description is written
    // again with the id the brief is about to get.
    if (
      !created.has(brief.source) &&
      published.contentHash === devoirContentHash(deliverable, brief)
    ) {
      return { deliverable, brief, verb: "skip", published };
    }
    return { deliverable, brief, verb: "update", published };
  });
}

/**
 * The documents this run is about to create, by repository source.
 *
 * Read off the items where they are decided, rather than asked of them again
 * later: what a plan item means is the plan's business, and a Devoir asking
 * one whether it is a create would be reading a document's verb to answer a
 * question about itself.
 */
function createdSources(items: readonly PlanItem[]): ReadonlySet<string> {
  return new Set(
    items
      .filter((item) => item.verb === "create")
      .map((item) => item.document.source)
  );
}

/**
 * Checked for instructor material only.
 *
 * A duplicated student-facing page is a mess to tidy; a duplicated answer key
 * is a copy of the C3 solution that no run re-hides, which is the one thing
 * this section exists to prevent. The narrower rule is the one that can be
 * stated exactly, so it is the one enforced here.
 */
function assertNotAlreadyInCourse(
  document: PublishedDocument,
  snapshot: CourseSnapshot
): void {
  if (document.visibility !== "enforced-hidden") return;
  const standing = snapshot.items.find(
    (item) => item.section === document.section && item.name === document.title
  );
  if (standing === undefined) return;
  throw new AlreadyInCourse(document.source, document.title, document.section);
}

/**
 * The sections this plan needs made, in the order students read the page in
 * rather than the order the table happens to list its documents in.
 *
 * Only what a `create` needs: a skip does nothing at all.
 */
export function sectionsToCreate(plan: Plan): readonly SectionName[] {
  return SECTION_ORDER.filter((name: SectionName) => {
    // The Deliverables section is asked for by the Devoirs and by nothing
    // else, because no document may name it. A run with no Devoir to make
    // therefore does not make it: an empty section on the course page is a
    // place students would look for a hand-in box that is not there.
    if (name === DELIVERABLE_SECTION) {
      return plan.devoirs.some((devoir) => devoir.verb === "create");
    }
    return plan.items.some(
      (item) => item.verb === "create" && item.document.section === name
    );
  });
}

/** How many documents the run reports as `verb`. */
function count(plan: Plan, verb: PlanVerb): number {
  return plan.items.filter((item) => item.verb === verb).length;
}

/**
 * How many documents the run skips outright.
 *
 * An item that is only being re-hidden is not one of them: its line says
 * `hide`, and counting it in both totals would make the summary describe more
 * work than the plan lists.
 */
function skips(plan: Plan): number {
  return plan.items.filter((item) => item.verb === "skip" && !item.hide).length;
}

/** `1 PDF` / `2 PDFs`, so the summary reads as a sentence. */
function pdfs(count: number): string {
  return `${count} PDF${count === 1 ? "" : "s"}`;
}

function hides(plan: Plan): number {
  return plan.items.filter((item) => item.hide).length;
}

/**
 * The verb as the instructor reads it. A document that is only being re-hidden
 * says `hide`: that is the whole of what this run does to it.
 */
function verbOf(item: PlanItem): string {
  return item.hide ? "hide" : item.verb;
}

/**
 * What a line says about where a document goes and who can see it.
 *
 * Instructor lines say so twice over — the section and the hiddenness — because
 * this is the check the instructor makes before applying the riskiest thing
 * this tool does.
 */
function placementOf(item: PlanItem): string {
  const section = `section: ${item.document.section}`;
  if (item.document.visibility !== "enforced-hidden") {
    // A document that ships hidden says so on the line that creates it, along
    // with the day the instructor opens it. Afterwards it says nothing: its
    // visibility is the instructor's, this run does not know what they set,
    // and a plan that guessed would be describing a course it had not read.
    if (item.verb === "create" && item.document.revealedOn !== undefined) {
      return `${section} (created hidden, revealed by hand on ${item.document.revealedOn})`;
    }
    return section;
  }
  const state =
    item.verb === "create"
      ? "created hidden"
      : item.hide
        ? "visible, will be re-hidden"
        : "hidden";
  return `${section} (${state}, examiners only)`;
}

/**
 * The PDF a create would upload, by the name a Student's download will have.
 * A skip uploads nothing, and says nothing.
 */
function pdfOf(item: PlanItem): string {
  return item.verb === "create" ? `   pdf: ${item.fileName}` : "";
}

/**
 * The Deliverables, each with its Freeze stated in full.
 *
 * Every one of them, every run, whether or not the run has anything to do:
 * this block is the check an instructor makes against the timetable, and a
 * Deliverable left out of it because nothing about it changed is a date nobody
 * reads again until a student meets it.
 *
 * The verb leads, as it does on a document's line, and the title follows it
 * because the title is what students read; the id is between them because the
 * id is what the Devoir is recorded under.
 *
 * The section is stated once, in the heading, rather than repeated down a
 * column: every Devoir goes to the same one and no entry decides it, so a
 * column would only be the same constant printed twice. What is worth reading
 * against the timetable on this page is the Freeze.
 */
function formatDeliverables(plan: Plan): readonly string[] {
  if (plan.devoirs.length === 0) return [];
  return [
    "",
    `Deliverables, in section "${DELIVERABLE_SECTION}":`,
    ...plan.devoirs.flatMap(({ deliverable, verb }) => [
      `  ${verb.padEnd(8)} ${deliverable.id.padEnd(6)} ${deliverable.title}`,
      `              freeze: ${formatFreeze(deliverable.freeze)}`,
      `              competencies: ${deliverable.competencies.join(", ")}` +
        (deliverable.visible || verb !== "create" ? "" : "   (created hidden)"),
    ]),
  ];
}

/** The plan as the instructor reads it, one line per document and its PDF. */
export function formatPlan(plan: Plan): string {
  const heading = "Plan:";
  if (plan.items.length === 0) {
    return ["Plan: nothing to do.", ...formatDeliverables(plan)].join("\n");
  }
  const lines = plan.items.map(
    (item) =>
      `  ${verbOf(item).padEnd(11)} ${item.document.title}\n` +
      `              ${placementOf(item)}   source: ${item.document.source}` +
      pdfOf(item)
  );
  return [
    heading,
    ...lines,
    "",
    `${pdfs(count(plan, "create"))} to create, ${skips(plan)} to skip, ` +
      `${hides(plan)} to hide.`,
    ...formatDeliverables(plan),
  ].join("\n");
}
