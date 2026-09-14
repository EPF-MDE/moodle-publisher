// An entry point: turning a plan into activities in the course.
//
// The manifest is written as each item succeeds. An interrupted run therefore
// leaves an accurate record of what actually happened, and recovery is running
// the same command again.
import { DELIVERABLE_SECTION } from "../course/index.ts";
import { withResolvedLinks } from "../documents/index.ts";
import { devoirKey, recordPublished } from "../manifest/index.ts";
import { UnrewrittenCrossReference, pageUrl } from "./lib/cross-references.ts";
import { devoirContentHash, devoirDescription } from "./lib/devoirs.ts";
import { sectionsToCreate } from "./plan.ts";

import type {
  CourseDriver,
  PageImage,
  PublishedAsset,
} from "../course/index.ts";
import type { CrossReference } from "../documents/index.ts";
import type { DevoirPlanItem, Plan, PlanItem } from "./plan.ts";

/**
 * What each document this run can already point a link at was published as: the
 * course module id a link to it becomes, and the title a link to it reads as.
 * Everything the manifest recorded, plus everything this run has created so
 * far.
 *
 * A document created earlier in the same run is in here by the time a later one
 * is written, which is why most cross-references resolve on the first pass.
 *
 * The two travel together because a link needs both, and looking the title up
 * separately at the point of use is how a page ends up pointing at one document
 * under the name of another.
 */
interface PublishedActivity {
  readonly moduleId: string;
  readonly title: string;
}
type ActivityBySource = Map<string, PublishedActivity>;

function knownActivities(plan: Plan): ActivityBySource {
  const activities: ActivityBySource = new Map();
  for (const item of plan.items) {
    if (item.verb !== "create")
      activities.set(item.document.source, {
        moduleId: item.published.moduleId,
        title: item.document.title,
      });
  }
  return activities;
}

/**
 * The document's HTML with every cross-reference pointing at Moodle, and the
 * ones whose target this run has not made yet.
 *
 * Which links are allowed was settled while the plan was built. What is decided
 * here is only where each one goes, so a link left unresolved is a document
 * this run is about to create rather than a link anyone needs to hear about.
 */
function linkedHtml(item: PlanItem, plan: Plan, activities: ActivityBySource) {
  return withResolvedLinks(item.rendered, (link) => {
    const target = activities.get(link.target);
    return target === undefined
      ? undefined
      : {
          url: pageUrl(plan.baseUrl, target.moduleId, link.fragment),
          title: target.title,
        };
  });
}

export interface ApplyOptions {
  readonly manifestPath: string;
  readonly driver: CourseDriver;
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
 * It happens before the first page goes in, and here rather than inside each
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
 * What the manifest records about the pictures that went up with a document.
 *
 * A document showing none records nothing at all — the field goes out
 * `undefined` and the manifest drops it — rather than an empty list. Its entry
 * then stays byte-for-byte what it was, and the first run after pictures
 * existed does not rewrite every line of a file that is read in diffs.
 *
 * Written on every update, not only when there is something to write: a
 * document that has lost its last picture has to lose the record of it too, or
 * the manifest goes on naming a URL nothing points at.
 */
function assetsOf(assets: readonly PublishedAsset[]): {
  assets: readonly PublishedAsset[] | undefined;
} {
  return { assets: assets.length === 0 ? undefined : assets };
}

/**
 * Says where each picture that went up this time ended up, one line each, as
 * it happened.
 *
 * Only the ones that travelled. A document showing twenty-eight pictures and
 * changing a sentence would otherwise report twenty-eight uploads that did not
 * happen, and the output an instructor uses to tell a slow run from a fast one
 * would say the same thing either way. What the course serves every picture at
 * goes to the manifest regardless.
 */
function reportUploads(
  sent: readonly PageImage[],
  assets: readonly PublishedAsset[],
  options: ApplyOptions
): void {
  const paths = new Set(sent.map((image) => image.path));
  for (const asset of assets) {
    if (!paths.has(asset.path)) continue;
    options.report(`uploaded ${asset.path} (served at ${asset.url})`);
  }
}

/**
 * Creates one page, with the pictures it shows, and records it. Returns the id
 * Moodle gave it, which is what a link to this document becomes.
 *
 * The pictures come from the document as it was read; the HTML is passed in,
 * because by here its cross-references have been answered with the module ids
 * this run knows and the document itself cannot know them.
 */
async function create(
  item: PlanItem,
  html: string,
  options: ApplyOptions
): Promise<string> {
  const created = await options.driver.createPage({
    name: item.document.title,
    section: item.document.section,
    html,
    images: item.rendered.images,
    upload: item.upload,
    // The one place visibility is *written* for a document that is not being
    // re-hidden. Which value it is was decided by the catalog, which owns the
    // policies; this passes it on and has no opinion, so there is no second
    // reading of the rule here to drift from the first.
    //
    // Instructor material and the C3 brief arrive false, so neither is visible
    // for a moment between being created and being hidden. After this line the
    // document is the instructor's, and the only thing this program can still
    // do to it is conceal it — and only if its policy is `enforced-hidden`.
    visible: item.document.visibleOnCreate,
  });

  const now = new Date().toISOString();
  recordPublished(options.manifestPath, item.document.source, {
    kind: "page",
    moduleId: created.moduleId,
    section: item.document.section,
    contentHash: item.rendered.contentHash,
    publishedAt: now,
    updatedAt: now,
    ...assetsOf(created.assets),
  });
  options.report(
    `created  ${item.document.title} (module ${created.moduleId})`
  );
  reportUploads(item.upload, created.assets, options);
  return created.moduleId;
}

/**
 * Rewrites one page where it stands and records the new hash.
 *
 * The manifest keeps the module id and the section it already had: the
 * activity did not move, and the first publication date is a fact about the
 * course that a later edit does not change. Recording the catalog's section
 * here instead would leave the manifest describing a place the activity is not.
 */
async function update(
  item: Extract<PlanItem, { verb: "update" }>,
  html: string,
  options: ApplyOptions
): Promise<void> {
  const { published } = item;
  const assets = await options.driver.updatePage({
    moduleId: published.moduleId,
    name: item.document.title,
    html,
    images: item.rendered.images,
    upload: item.upload,
  });

  recordPublished(options.manifestPath, item.document.source, {
    ...published,
    contentHash: item.rendered.contentHash,
    updatedAt: new Date().toISOString(),
    ...assetsOf(assets),
  });
  options.report(
    `updated  ${item.document.title} (module ${published.moduleId})`
  );
  reportUploads(item.upload, assets, options);
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
 * Rewrites the pages that pointed at something this run had not made yet.
 *
 * A document and the document it links to can both be new — the second lecture
 * and the brief it points at, a lab and the resource it sends students to — and
 * a link becomes a URL only once Moodle has given its target a module id. So
 * the run comes back for them at the end, when every id is known.
 *
 * The manifest is not rewritten: the hash covers the repository paths a
 * document links to, not the ids they resolved to, so the record made on the
 * first pass is already the right one and this pass is invisible to the next
 * run.
 *
 * This is also the last moment anything can be said about a link: every page
 * exists and every id is known, so a cross-reference still spelled as a
 * repository path here is one no later pass will fix. Every page is relinked
 * first and the complaint comes after, so one bad link in the first document
 * does not cost the rest of them the pass they were owed.
 */
async function relink(
  pending: readonly PlanItem[],
  plan: Plan,
  activities: ActivityBySource,
  options: ApplyOptions
): Promise<void> {
  let dead: { source: string; link: CrossReference } | undefined;

  for (const item of pending) {
    const moduleId = activities.get(item.document.source)?.moduleId;
    if (moduleId === undefined) continue;
    const { html, unresolved } = linkedHtml(item, plan, activities);
    await options.driver.updatePage({
      moduleId,
      name: item.document.title,
      html,
      // The same pictures the page already carries. This pass rewrites links
      // and nothing else, and a page updated without them would have its
      // pictures taken away to fix a link.
      images: item.rendered.images,
      // None of them go up again. Whatever this document needed uploading was
      // uploaded by the create or update that came before this pass, so the
      // activity already holds every picture the page shows — and the form
      // puts what the activity holds back into the draft area, so saying
      // nothing here keeps them.
      upload: [],
    });
    options.report(
      `relinked ${item.document.title} (module ${moduleId}, links to pages made in this run)`
    );
    // Any link at all, not only the ones whose target this run made: the plan
    // refuses every link it cannot place, so by here each one has an activity
    // to point at and being unresolved means the rewrite missed it.
    const [first] = unresolved;
    if (first !== undefined && dead === undefined)
      dead = { source: item.document.source, link: first };
  }

  if (dead !== undefined)
    throw new UnrewrittenCrossReference(dead.source, dead.link);
}

/**
 * Publishes the Devoirs: creates the ones the course does not hold, rewrites
 * the ones whose Deliverable has been edited, and records each as it succeeds.
 *
 * Last in the run, after every page has been written and relinked, because a
 * Devoir's description links to the brief and the brief's module id only
 * exists once the page has been saved. A brief that is not published at all is
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
  activities: ActivityBySource,
  options: ApplyOptions
): Promise<void> {
  for (const devoir of plan.devoirs) {
    if (devoir.verb === "skip") {
      options.report(`skip     devoir ${devoir.deliverable.title}`);
      continue;
    }
    // The brief's own page, with no fragment: the link goes to the document,
    // and the id for it is known because the page was published earlier in
    // this same run.
    const html = devoirDescription(
      devoir.deliverable,
      devoir.brief,
      pageUrl(plan.baseUrl, briefModuleId(devoir, activities), "")
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
function briefModuleId(
  devoir: Extract<DevoirPlanItem, { verb: "create" | "update" }>,
  activities: ActivityBySource
): string {
  const moduleId = activities.get(devoir.brief.source)?.moduleId;
  if (moduleId === undefined) {
    throw new Error(
      `Aborting: the Devoir for "${devoir.deliverable.id}" links to "${devoir.brief.source}", and this ` +
        `run has no module id for it. Nothing has been recorded for the Devoir. ` +
        `Run publish again — the brief is created first, and its id is what the link needs.`
    );
  }
  return moduleId;
}

/**
 * Creates one Devoir and records it.
 *
 * Named apart from the driver call it makes — `createDevoir` is Moodle's side
 * of this, one line below — so a stack trace and a grep each name one thing.
 *
 * The one place a Devoir's visibility is written, exactly as
 * {@link create} is for a page: after this call the Devoir is the
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
 * appeared in the course. The same reading {@link update} makes for a page,
 * and here it matters more — the module id is what every Submission handed in
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
 * Applies every create, update and hide in the plan, in order. Throws on the
 * first failure, having already recorded everything that succeeded before it.
 */
export async function applyPlan(
  plan: Plan,
  options: ApplyOptions
): Promise<void> {
  await ensureSections(plan, options);

  const activities = knownActivities(plan);
  const pending: PlanItem[] = [];

  for (const item of plan.items) {
    if (item.verb !== "skip") {
      const { html, unresolved } = linkedHtml(item, plan, activities);
      if (item.verb === "create") {
        activities.set(item.document.source, {
          moduleId: await create(item, html, options),
          title: item.document.title,
        });
      } else {
        await update(item, html, options);
      }
      if (unresolved.length > 0) pending.push(item);
    } else if (!item.hide) {
      options.report(`skip     ${item.document.title}`);
    }
    await hide(item, options);
  }

  await relink(pending, plan, activities, options);
  await publishDevoirs(plan, activities, options);
}
