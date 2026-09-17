// Implementation: private to the publishing package.
//
// What a link from one document of this repository to another is allowed to
// mean. What it becomes — text naming its target — is the documents package's.
//
// The rules key on **who each document is for** — the `--instructor` suffix on
// its filename — and not on whether a document happens to be published or
// happens to be hidden. The C3 brief is the reason: it ships hidden and is
// student-facing all the same, so a rule written about hiddenness would refuse
// the lecture that points at it and allow a brief that points at the answer key.
import type { PublishedDocument } from "../../catalog/index.ts";
import type { CrossReference } from "../../documents/index.ts";

/**
 * A student-facing document points at examiner-only material.
 *
 * The leak this whole check exists for, and the one link that stops a run.
 * Published as text, the link would put the answer key's title in a student's
 * page and tell them which Section it is hidden in.
 *
 * The message names which document wrote the link, how the link is spelled —
 * what to search the markdown for — and what it resolves to.
 */
export class LinkToInstructorOnly extends Error {
  constructor(from: string, link: CrossReference) {
    super(
      `Aborting: "${from}" links to "${link.href}", which resolves to "${link.target}" — ` +
        `examiner-only material, and "${from}" is published to students. That link is a ` +
        `signpost to the answer key. Drop it and keep the sentence, as ` +
        `\`labs/lab-3-oral.md\` does.`
    );
    this.name = "LinkToInstructorOnly";
  }
}

/**
 * What deciding a link takes: every document the table names.
 *
 * Declared here and widened by the plan's own input rather than copied, so the
 * two cannot drift into describing different things under the same field names.
 */
export interface CrossReferenceInput {
  /** Every document the table names. */
  readonly documents: readonly PublishedDocument[];
}

/**
 * Checks every cross-reference the run is about to publish.
 *
 * Throws on the first student-facing link to examiner-only material, naming the
 * document that wrote it and the document it points at. Nothing has been written to the
 * course at this point: the check runs while the plan is being built, so a
 * refusal costs a report rather than a half-published course.
 */
export function checkCrossReferences(
  input: CrossReferenceInput,
  links: readonly { document: PublishedDocument; link: CrossReference }[]
): void {
  const bySource = new Map(
    input.documents.map((document) => [document.source, document])
  );

  for (const { document, link } of links) {
    const from = document.source;
    // One lookup answers every question — whether the target is published at
    // all and who it is for — so there is no second reading of the table here
    // to disagree with the first.
    const target = bySource.get(link.target);
    // A document the table does not list: nothing publishes it, and the link
    // is published as its own text, so there is nothing to refuse.
    if (target === undefined) continue;
    if (target.instructorMaterial && !document.instructorMaterial)
      throw new LinkToInstructorOnly(from, link);
  }
}
