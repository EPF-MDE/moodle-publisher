// Implementation: private to the publishing package.
//
// What a Devoir is made of, decided here rather than in a driver: the same
// three sentences reach the fake course and the live one, and a test that
// reads them off the fake is reading what students would read.
//
// A Devoir carries no prose of its own. The brief's prose stays in exactly one
// Moodle activity — the document whose front matter defines the Deliverable —
// and what is generated here is a stub that says what to paste, states the
// Freeze, and links to that activity.
import { formatFreeze } from "../../catalog/deliverables.ts";
import { contentHash } from "../../documents/index.ts";
import { escape } from "./html.ts";

import type { Deliverable } from "../../catalog/deliverables.ts";
import type { PublishedDocument } from "../../catalog/index.ts";
import type { DocumentEntry } from "../../manifest/index.ts";

/**
 * The document a Deliverable's front matter defines it in, and which its
 * Devoir therefore links to, is not published.
 *
 * There is no Devoir to make without it. The stub's whole content is "here is
 * where the brief is", and a Devoir published with that sentence pointing
 * nowhere would be a hand-in box for an exercise nobody could read — found out
 * by a student, at a deadline, which is the failure this feature exists to
 * remove.
 *
 * It aborts while the plan is being built, before anything is written: what is
 * wrong is a table in the repository, and the fix is an entry in it.
 */
export class DevoirBriefNotPublished extends Error {
  constructor(id: string, source: string) {
    super(
      `Aborting: Deliverable "${id}" is defined in "${source}", and the publishable table ` +
        `does not name that document, so the Devoir's description would link to a page ` +
        `that is not in the course. Add "${source}" to the publishable table, or take the ` +
        `Deliverable out of the front matter. Nothing has been published.`
    );
    this.name = "DevoirBriefNotPublished";
  }
}

/**
 * A published document as a Devoir's link needs it: which activity it is, and
 * what kind, because Moodle serves each kind from its own URL. A brief is a
 * PDF, or a page an earlier publisher made and this one left standing.
 */
export type Activity = Pick<DocumentEntry, "kind" | "moduleId">;

/** Where Moodle serves `activity`. */
export function activityUrl(baseUrl: string, activity: Activity): string {
  const module = activity.kind === "file-resource" ? "resource" : "page";
  return `${baseUrl.replace(/\/+$/, "")}/mod/${module}/view.php?id=${activity.moduleId}`;
}

/**
 * The description a Student reads on the Devoir.
 *
 * Three sentences, in the order they are needed: what to paste, when it stops
 * being accepted, and where the exercise itself is written down.
 *
 * What to paste is the Deliverable's own title, because the title is the
 * sentence that says it — "Your repository — C1 and C2", "Your C3 branch —
 * recovering from failure". There is no field distinguishing a repository URL
 * from a branch URL, deliberately: a second place stating the same thing is a
 * second place for it to be wrong.
 *
 * The Freeze is stated in full, in the same words the plan states it in. A
 * Student reading this activity and an Instructor reading the plan before
 * applying it are reading one string, formatted by one function.
 */
export function devoirDescription(
  deliverable: Deliverable,
  brief: PublishedDocument,
  briefUrl: string
): string {
  return [
    `<p>Hand in by pasting one URL here, as text: ${escape(deliverable.title)}. ` +
      `There is nothing to upload — this activity collects a link and nothing else.</p>`,
    `<p><strong>Freeze: ${escape(formatFreeze(deliverable.freeze))}.</strong> ` +
      `Moodle stops accepting a submission at that instant. There is no grace window, ` +
      `so anything pushed afterwards is not late — it cannot be handed in at all. ` +
      `You can revise what you pasted as often as you like until then.</p>`,
    `<p>What this covers and how it is assessed: ` +
      `<a href="${briefUrl}">${escape(brief.title)}</a>.</p>`,
  ].join("\n");
}

/**
 * What stands in for the brief's URL while the description is being hashed.
 *
 * The stub carries a link to an activity, and a link is a course module id —
 * which changes only when the brief it names is created again, and says nothing
 * about whether the Deliverable was edited. So the description is hashed with
 * this in the href's place, for the reason `hashDocument` hashes what a link
 * *says* and never the module id it resolves to: what is being asked is
 * whether the repository changed, not what state the course is in. The one run
 * that has to react to a new module id — the one that creates the brief again
 * — sees it from the plan, which knows what it is about to make.
 */
const BRIEF_URL_PLACEHOLDER = "the brief";

/**
 * What this Deliverable would be published as, in one string.
 *
 * It is the whole of what a run compares against the manifest to decide
 * whether there is anything to do to a Devoir. Taken over the description
 * itself rather than over the fields it is written from, so that a change to
 * the wording above — a sentence added to what students read — is a change
 * every published Devoir picks up, rather than one only the Devoirs published
 * from tomorrow on would ever get.
 *
 * The title rides along separately because it is not in the description in
 * full: it is what students read on the course page, and a Deliverable
 * retitled and nothing else is an edit Moodle has to be told about.
 */
export function devoirContentHash(
  deliverable: Deliverable,
  brief: PublishedDocument
): string {
  // Hashed by the same function a document's content hash goes through, so the
  // two are spelled alike in the manifest without anyone having to remember to
  // spell them alike.
  return contentHash([
    deliverable.title,
    "\0",
    devoirDescription(deliverable, brief, BRIEF_URL_PLACEHOLDER),
  ]);
}
