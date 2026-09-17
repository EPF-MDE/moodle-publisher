// An entry point: turning a plan into activities in the course.
//
// The manifest is written as each item succeeds. An interrupted run therefore
// leaves an accurate record of what actually happened, and recovery is running
// the same command again.
import { DELIVERABLE_SECTION } from "../course/index.ts";
import { devoirKey, recordPublished } from "../manifest/index.ts";
import {
  documentActivityUrl,
  devoirContentHash,
  devoirDescription,
} from "./lib/devoirs.ts";
import { printReady } from "./lib/print-ready.ts";
import { sectionsToCreate } from "./plan.ts";

import type { CourseDriver } from "../course/index.ts";
import type { DocumentActivity } from "./lib/devoirs.ts";
import type { Footer } from "./lib/print-ready.ts";
import type { DevoirPlanItem, Plan, PlanItem } from "./plan.ts";

/**
 * The activity each document was published as, by source: everything the
 * manifest recorded, plus everything this run has created so far.
 *
 * Only a Devoir asks, for the brief its description links to. A document's own
 * links are text and need no module id.
 */
type DocumentActivityBySource = Map<string, DocumentActivity>;

function knownActivities(plan: Plan): DocumentActivityBySource {
  const activities: DocumentActivityBySource = new Map();
  for (const item of plan.items) {
    if (item.verb !== "create") {
      activities.set(item.document.source, item.published);
    }
  }
  return activities;
}

export interface ApplyOptions {
  readonly manifestPath: string;
  readonly driver: CourseDriver;
  /** What the foot of every page of every PDF this run makes says. */
  readonly footer: Footer;
  /** Where progress goes: one line per item, as it happens. */
  readonly report: (line: string) => void;
}

/**
 * Puts every section this run needs into the course, in the order the plan
 * gives them.
 *
 * The order is a guarantee about the sections the publisher creates: a section
 * the instructor made by hand keeps the place it already had, because
 * publishing adds sections and never reshuffles a course somebody else is
 * arranging.
 *
 * It happens before the first PDF goes in, and here rather than inside each
 * driver, so there is one rule — take the section that is there, add it when it
 * is not, abort when two of them share the name — instead of one rule per
 * transport, only one of which the tests can see.
 */
async function ensureSections(
  plan: Plan,
  options: ApplyOptions
): Promise<void> {
  for (const name of sectionsToCreate(plan)) {
    const outcome = await options.driver.ensureSection(name);
    if (outcome.created) options.report(`created  section ${name}`);
  }
}

/**
 * Creates one document's PDF in its Section and records it. Returns the id
 * Moodle gave it, which is what a Devoir's link to its brief becomes.
 *
 * The body is the document exactly as the plan read it.
 */
async function create(
  item: Extract<PlanItem, { verb: "create" }>,
  options: ApplyOptions
): Promise<string> {
  const { document } = item;
  const created = await options.driver.createFileResource({
    name: document.title,
    section: document.section,
    fileName: item.fileName,
    html: printReady(document, item.rendered.html, options.footer),
    // The one place visibility is *written* for a document that is not being
    // re-hidden. Which value it is was decided by the catalog, which owns the
    // policies; this passes it on and has no opinion, so there is no second
    // reading of the rule here to drift from the first.
    //
    // Instructor material and reveal-dated documents arrive false, so neither
    // is visible for a moment between being created and being hidden. After
    // this line the document is the instructor's, and the only thing this
    // program can still do to it is conceal it — and only if its policy is
    // `enforced-hidden`.
    visible: document.visibleOnCreate,
  });

  const now = new Date().toISOString();
  recordPublished(options.manifestPath, document.source, {
    kind: "file-resource",
    moduleId: created.moduleId,
    section: document.section,
    title: document.title,
    contentHash: item.printedHash,
    publishedAt: now,
    updatedAt: now,
  });
  options.report(
    `created  ${document.title} as ${item.fileName} (module ${created.moduleId})`
  );
  return created.moduleId;
}

/**
 * Replaces the file of one changed document's PDF where it stands, and records
 * the hash it now holds.
 *
 * The manifest keeps the module id, the Section, the title and the day the
 * PDF was first published: only the file changed. The call carries no
 * visibility, so a PDF the Instructor opened by hand stays open and a hidden
 * one stays hidden.
 */
async function replace(
  item: Extract<PlanItem, { verb: "replace" }>,
  options: ApplyOptions
): Promise<void> {
  const { document, published } = item;
  await options.driver.replaceFile({
    moduleId: published.moduleId,
    fileName: item.fileName,
    html: printReady(document, item.rendered.html, options.footer),
  });

  recordPublished(options.manifestPath, document.source, {
    ...published,
    contentHash: item.printedHash,
    updatedAt: new Date().toISOString(),
  });
  options.report(
    `replaced ${document.title} as ${item.fileName} (module ${published.moduleId})`
  );
}

/**
 * Re-hides one activity the run found visible.
 *
 * Only `enforced-hidden` documents ever get here — the plan is what decides
 * that — and the driver call it makes takes no boolean, so this path cannot
 * reveal anything even if it is called about the wrong activity.
 */
async function hide(item: PlanItem, options: ApplyOptions): Promise<void> {
  if (!item.hide || item.verb === "create") return;
  await options.driver.hideItem(item.published.moduleId);
  options.report(
    `re-hid   ${item.document.title} (module ${item.published.moduleId}, it was visible)`
  );
}

/**
 * Publishes the Devoirs: creates the ones the course does not hold, rewrites
 * the ones whose Deliverable has been edited, and records each as it succeeds.
 *
 * Last in the run, after every document has been published, because a
 * Devoir's description links to the brief and the brief's module id only
 * exists once its PDF is in the course. A brief that is not published at all is
 * refused while the plan is built, so by here every one of these lookups has
 * an answer.
 *
 * An edit rewrites the activity that is already there. The module id is what
 * every Submission handed in, every bookmark and every link to the Devoir
 * hangs off, and a Devoir deleted and made again takes all three with it —
 * students' work included, which exists nowhere else. So there is no path here
 * that replaces one.
 *
 * Visibility is written by the create and by nothing else. `updateDevoir` has
 * no field for it, so a Devoir revealed by hand on the morning of the exercise
 * is still revealed after the next typo fix.
 */
async function publishDevoirs(
  plan: Plan,
  activities: DocumentActivityBySource,
  options: ApplyOptions
): Promise<void> {
  for (const devoir of plan.devoirs) {
    if (devoir.verb === "skip") {
      options.report(`skip     devoir ${devoir.deliverable.title}`);
      continue;
    }
    // The brief's own activity: the id for it is known because the brief was
    // published earlier in this same run, or recorded by an earlier one.
    const html = devoirDescription(
      devoir.deliverable,
      devoir.brief,
      documentActivityUrl(plan.baseUrl, briefActivity(devoir, activities))
    );
    if (devoir.verb === "update") {
      await rewriteDevoir(devoir, html, options);
    } else {
      await makeDevoir(devoir, html, options);
    }
  }
}

/**
 * Where this run published the brief the Devoir's description links to.
 *
 * The brief is created before any Devoir is, and a Deliverable defined in a
 * document nobody publishes is refused while the plan is built, so this has an
 * answer by the time it is asked. It is asked all the same, and loudly,
 * because the alternative to an answer is a hand-in box whose only sentence
 * points at nothing.
 */
function briefActivity(
  devoir: Extract<DevoirPlanItem, { verb: "create" | "update" }>,
  activities: DocumentActivityBySource
): DocumentActivity {
  const activity = activities.get(devoir.brief.source);
  if (activity === undefined) {
    throw new Error(
      `Aborting: the Devoir for "${devoir.deliverable.id}" links to "${devoir.brief.source}", and this ` +
        `run has no module id for it. Nothing has been recorded for the Devoir. ` +
        `Run publish again — the brief is created first, and its id is what the link needs.`
    );
  }
  return activity;
}

/**
 * Creates one Devoir and records it.
 *
 * Named apart from the driver call it makes — `createDevoir` is Moodle's side
 * of this, one line below — so a stack trace and a grep each name one thing.
 *
 * The one place a Devoir's visibility is written, exactly as
 * {@link create} is for a document: after this call the Devoir is the
 * instructor's, and nothing in this program writes its visibility again.
 */
async function makeDevoir(
  devoir: Extract<DevoirPlanItem, { verb: "create" }>,
  html: string,
  options: ApplyOptions
): Promise<void> {
  const { deliverable, brief } = devoir;
  const created = await options.driver.createDevoir({
    name: deliverable.title,
    html,
    visible: deliverable.visible,
    freeze: deliverable.freeze,
  });

  const now = new Date().toISOString();
  recordPublished(options.manifestPath, devoirKey(deliverable.id), {
    kind: "devoir",
    moduleId: created.moduleId,
    section: DELIVERABLE_SECTION,
    contentHash: devoirContentHash(deliverable, brief),
    publishedAt: now,
    updatedAt: now,
  });
  options.report(
    `created  devoir ${deliverable.title} (module ${created.moduleId}, ` +
      `freeze ${deliverable.freeze.written}` +
      `${deliverable.visible ? "" : ", hidden"})`
  );
}

/**
 * Rewrites one Devoir where it stands and records what it now holds.
 *
 * The manifest keeps the module id and the day it was first published: the
 * activity did not move, and an edit does not change when the Devoir first
 * appeared in the course. The module id is what every Submission handed in
 * hangs off.
 */
async function rewriteDevoir(
  devoir: Extract<DevoirPlanItem, { verb: "update" }>,
  html: string,
  options: ApplyOptions
): Promise<void> {
  const { deliverable, brief, published } = devoir;
  await options.driver.updateDevoir({
    moduleId: published.moduleId,
    name: deliverable.title,
    html,
    // Both dates, written again from the Freeze the front matter states now.
    // There is nothing else in this call: no visibility, and no section.
    freeze: deliverable.freeze,
  });

  recordPublished(options.manifestPath, devoirKey(deliverable.id), {
    ...published,
    contentHash: devoirContentHash(deliverable, brief),
    updatedAt: new Date().toISOString(),
  });
  options.report(
    `updated  devoir ${deliverable.title} (module ${published.moduleId}, ` +
      `freeze ${deliverable.freeze.written})`
  );
}

/**
 * Applies every create, replace and hide in the plan, in order. Throws on the
 * first failure, having already recorded everything that succeeded before it.
 */
export async function applyPlan(
  plan: Plan,
  options: ApplyOptions
): Promise<void> {
  await ensureSections(plan, options);

  const activities = knownActivities(plan);

  for (const item of plan.items) {
    if (item.verb === "create") {
      const moduleId = await create(item, options);
      activities.set(item.document.source, { kind: "file-resource", moduleId });
    } else if (item.verb === "replace") {
      await replace(item, options);
    } else if (!item.hide) {
      options.report(`skip     ${item.document.title}`);
    }
    await hide(item, options);
  }

  await publishDevoirs(plan, activities, options);
}
