// Implementation: private to the publishing package.
//
// A Published Document as the course receives it: the name its PDF is stored
// under, and the one self-contained HTML document that PDF is printed from.
// Printing is the driver's; everything the PDF says is decided here.
import { basename, extname } from "node:path";

import { escape } from "./html.ts";

import type { PublishedDocument } from "../../catalog/index.ts";

/**
 * What a Student's download is called: the source's basename with `.pdf`, so
 * `lectures/lecture-1-framing.md` downloads as `lecture-1-framing.pdf` and a
 * file on somebody's disk still says which document it is.
 */
export function pdfFileName(source: string): string {
  return `${basename(source, extname(source))}.pdf`;
}

/**
 * The document the PDF is printed from: the title the course page shows, at
 * the top, then the rendered body — links already in their text form and
 * pictures already embedded, so nothing beside it needs fetching.
 */
export function printReady(document: PublishedDocument, body: string): string {
  const title = escape(document.title);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${title}</title>`,
    "</head>",
    "<body>",
    `<h1 class="document-title">${title}</h1>`,
    body,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
