// An entry point: one Published Document as the course would receive it,
// without the Course.
//
// What an Instructor reads before publishing: the Assessment Grid assembled, or
// any other document the `published` table lists, laid out for print exactly as
// a run would upload it. The repository is read as `check` reads it, with the
// same refusals, so a preview never shows a document a run would refuse.
// Printing the HTML to a PDF is the course package's, as it is for a run.
import { posix } from "node:path";

import { readCheckedRepository } from "./check.ts";
import { pdfFileName, printReady } from "./lib/print-ready.ts";

/** A source `render` was asked for that the `published` table does not list. */
export class NotAPublishedDocument extends Error {
  constructor(source: string) {
    super(
      `Aborting: "${source}" is not a Published Document. Only a source the ` +
        `"published" table of publisher.json lists can be rendered.`
    );
    this.name = "NotAPublishedDocument";
  }
}

/** A Published Document ready to print. */
export interface RenderedForPrint {
  /** The title the course page and the top of the PDF show. */
  readonly title: string;
  /** The name the PDF is stored under: the source's basename with `.pdf`. */
  readonly fileName: string;
  /** The one self-contained HTML document the PDF is printed from. */
  readonly html: string;
}

/**
 * The document `source` names, as a run would print it on `publishedOn`.
 *
 * `source` is repository-relative, as the table writes it; `./lab.md` is
 * `lab.md`. Throws every refusal `check` would raise about the repository,
 * then {@link NotAPublishedDocument} when the table does not list `source`.
 */
export function renderForPrint(
  repoRoot: string,
  source: string,
  publishedOn: Date
): RenderedForPrint {
  const { catalog, plan } = readCheckedRepository(repoRoot);
  const wanted = posix.normalize(source);
  const item = plan.items.find((candidate) => candidate.document.source === wanted);
  if (item === undefined) throw new NotAPublishedDocument(source);
  return {
    title: item.document.title,
    fileName: pdfFileName(item.document.source),
    html: printReady(item.document, item.rendered.html, {
      course: catalog.course,
      publishedOn,
    }),
  };
}
