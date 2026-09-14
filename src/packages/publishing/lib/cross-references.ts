// Implementation: private to the publishing package.
//
// What a link from one document of this repository to another is allowed to
// mean, and what it becomes in Moodle.
//
// The rules key on **who each document is for** — the `--instructor` suffix on
// its filename — and not on whether a document happens to be published or
// happens to be hidden. The C3 brief is the reason: it ships hidden and is
// student-facing all the same, so a rule written about hiddenness would refuse
// the lecture that points at it and allow a brief that points at the answer key.
import { pageFor } from "../../manifest/index.ts";

import type { PublishedDocument } from "../../catalog/index.ts";
import type { CourseSnapshot } from "../../course/index.ts";
import type { CrossReference } from "../../documents/index.ts";
import type { Manifest } from "../../manifest/index.ts";

/**
 * How every refusal below opens: which document wrote the link, how the link is
 * spelled, and what it resolves to.
 *
 * All three are needed to act on the message and none of them can be worked out
 * from the others — the href is what to search the markdown for, the target is
 * what to look up in the tables — so they are said once, here, rather than
 * spelled out four times with four chances to drift.
 */
function refusal(from: string, link: CrossReference): string {
  return `Aborting: "${from}" links to "${link.href}", which resolves to "${link.target}"`;
}

/**
 * A link to a document the table does not name.
 *
 * The repository holds a great deal of markdown that is not course material —
 * this publisher's own documentation, the fixture repository's README, notes.
 * A student-facing page cannot point at any of it: in Moodle there is nothing
 * on the other end, and the reader meets a dead link. It is the only way a
 * cross-reference can fail to find its target, every document the table names
 * being published on every run.
 */
export class LinkToUnknownDocument extends Error {
  constructor(from: string, link: CrossReference) {
    super(
      `${refusal(from, link)} — a document the table does not name, so nothing publishes ` +
        `it and the link would be dead in Moodle. Either add "${link.target}" to the ` +
        `table, or drop the link and keep the sentence.`
    );
    this.name = "LinkToUnknownDocument";
  }
}

/**
 * A student-facing document points at examiner-only material.
 *
 * The leak this whole check exists for. Instructor material is published now,
 * hidden beside the document it pairs with, so a link to it is no longer a dead
 * end that fails safely: it is a URL, and a student who follows it has the
 * answer key.
 */
export class LinkToInstructorOnly extends Error {
  constructor(from: string, link: CrossReference) {
    super(
      `${refusal(from, link)} — examiner-only material, and "${from}" is published to ` +
        `students. That link is a signpost to the answer key. Drop it and keep the ` +
        `sentence, as \`labs/lab-3-oral.md\` does.`
    );
    this.name = "LinkToInstructorOnly";
  }
}

/**
 * A link that survived every check and still did not become a URL.
 *
 * Not a mistake in the repository: every refusal above runs before anything is
 * written, so by the time this can fire the link has been ruled publishable and
 * its target has a module id. It means the rewrite did not recognise the href
 * in the rendered HTML — the shape of bug that used to pass silently, leaving a
 * relative path in a published page for a student to click on.
 *
 * Loud, and after the fact, because the alternative is quiet: a link and the
 * document it points at can both be new in the same run, so whether the
 * substitution landed is not knowable until every page has been made.
 */
export class UnrewrittenCrossReference extends Error {
  constructor(from: string, link: CrossReference) {
    super(
      `${refusal(from, link)} — and the rewrite did not replace it, so the published page ` +
        `still carries that path and a reader following it meets nothing. The course has ` +
        `been written; this is a defect in the publisher, not in the document. Report the ` +
        `href above, and re-run once it is fixed.`
    );
    this.name = "UnrewrittenCrossReference";
  }
}

/** One link whose target is in the course but hidden from students. */
export interface HiddenLink {
  readonly from: string;
  readonly target: string;
  /** What the target is published as, so the instructor can find the activity. */
  readonly title: string;
}

/**
 * What deciding a link takes: every document the table names, and the course as
 * it stands.
 *
 * Declared here and widened by the plan's own input rather than copied, so the
 * two cannot drift into describing different things under the same field names.
 */
export interface CrossReferenceInput {
  /** Every document the table names. */
  readonly documents: readonly PublishedDocument[];
  readonly manifest: Manifest;
  readonly snapshot: CourseSnapshot;
}

/**
 * Whether the activity `document` was published as is hidden from students
 * right now.
 *
 * Read from the live course when the course has it, and from the catalog's
 * intent when it does not. The C3 brief is why: it ships hidden and is revealed
 * by hand, and after the reveal a warning about a link to it would be telling
 * the instructor about a state they themselves ended.
 */
function isHidden(
  document: PublishedDocument,
  input: CrossReferenceInput
): boolean {
  const published = pageFor(input.manifest, document.source);
  const standing =
    published === undefined
      ? undefined
      : input.snapshot.items.find(
          (item) => item.moduleId === published.moduleId
        );
  return standing === undefined ? !document.visibleOnCreate : !standing.visible;
}

/**
 * Checks every cross-reference the run is about to publish, and returns the
 * ones worth warning about.
 *
 * Throws on the first link that cannot be published, naming the document that
 * wrote it and the document it points at. Nothing has been written to the
 * course at this point: the check runs while the plan is being built, so a
 * refusal costs a report rather than a half-published course.
 */
export function checkCrossReferences(
  input: CrossReferenceInput,
  links: readonly { document: PublishedDocument; link: CrossReference }[]
): readonly HiddenLink[] {
  const bySource = new Map(
    input.documents.map((document) => [document.source, document])
  );
  const hidden: HiddenLink[] = [];

  for (const { document, link } of links) {
    const from = document.source;
    // One lookup answers every question — whether the target is published at
    // all, who it is for, what it is called — so there is no second reading of
    // the table here to disagree with the first.
    const target = bySource.get(link.target);
    if (target === undefined) throw new LinkToUnknownDocument(from, link);
    if (target.instructorMaterial && !document.instructorMaterial)
      throw new LinkToInstructorOnly(from, link);
    if (isHidden(target, input)) {
      hidden.push({ from, target: link.target, title: target.title });
    }
  }

  return hidden;
}

/**
 * The hidden-link warnings as the instructor reads them: one heading that says
 * what the warning means, then one line per link.
 *
 * Said once rather than once per link, because it fires by construction. Every
 * examiner-only activity is hidden, so every link between two of them warns,
 * and a run of the real repository produces a handful at a time — a paragraph
 * repeated five times is a paragraph nobody reads the fifth time, or the first.
 */
export function formatHiddenLinks(
  hidden: readonly HiddenLink[]
): readonly string[] {
  if (hidden.length === 0) return [];
  return [
    "",
    hidden.length === 1
      ? `Warning: 1 link points at a document that is hidden in the course.`
      : `Warning: ${hidden.length} links point at a document that is hidden in the course.`,
    `  The link is published and resolves; a reader who cannot see the target activity ` +
      `cannot follow it.`,
    `  Examiner-only material is always hidden, so a link between two examiner-only ` +
      `documents says this by construction.`,
    ...hidden.map(
      (link) => `  ${link.from} → ${link.target}  ("${link.title}")`
    ),
  ];
}

/** Where Moodle serves the page activity `moduleId`, with the fragment asked for. */
export function pageUrl(
  baseUrl: string,
  moduleId: string,
  fragment: string
): string {
  return `${baseUrl.replace(/\/+$/, "")}/mod/page/view.php?id=${moduleId}${fragment}`;
}
