// Implementation: private to the publishing package.
//
// A Published Document as the course receives it: the name its PDF is stored
// under, and the one self-contained HTML document that PDF is printed from.
// Printing is the driver's; everything the PDF says is decided here, the page
// it is laid out on included.
import { basename, extname } from "node:path";

import { contentHash } from "../../documents/index.ts";
import { escape } from "./html.ts";

import type { PublishedDocument } from "../../catalog/index.ts";

/**
 * How a printed page is put together, as the hash records it: the table's
 * title stands in for the document's own leading heading. Changing that
 * changes every PDF it applies to, so it is hashed.
 */
const PRINT_LAYOUT_VERSION = "table-title-only";

/**
 * The `h1` a rendered body opens with, and the space after it. Comments before
 * it are captured so they are kept: a reader sees none of them, so the heading
 * after them is still the first thing on the page. An `h1` holds no other
 * `h1`, so the first closing tag is its own.
 */
const LEADING_H1 = /^((?:\s*<!--[\s\S]*?-->)*\s*)<h1[\s>][\s\S]*?<\/h1>\s*/i;

/**
 * What a Student's download is called: the source's basename with `.pdf`, so
 * `lectures/lecture-1-framing.md` downloads as `lecture-1-framing.pdf` and a
 * file on somebody's disk still says which document it is.
 */
export function pdfFileName(source: string): string {
  return `${basename(source, extname(source))}.pdf`;
}

/** What every page of a run's PDFs says at its foot, besides its number. */
export interface Footer {
  /** The Course, as `publisher.json` names it. */
  readonly course: string;
  /** The instant the run publishes as of; the page shows its day in Paris. */
  readonly publishedOn: Date;
}

/**
 * Writes an instant as the day it falls on in Paris, as a reader writes it:
 * `12 September 2026`. The course runs in Paris, so a run late in the evening
 * UTC is dated the next day, as the Students who print it would date it.
 */
const PARIS_DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * `text` as a quoted CSS string, safe inside a `<style>` element.
 *
 * A quote or a backslash would end or bend the string, and a `<` could start
 * the `</style>` that ends the element — and hands whatever follows to the
 * HTML parser — so all three are written as CSS escapes, as is any line break.
 */
function cssString(text: string): string {
  const escaped = text.replace(/["\\<\n\r\f]/g, (character) =>
    character === '"' || character === "\\"
      ? `\\${character}`
      : `\\${character.charCodeAt(0).toString(16)} `
  );
  return `"${escaped}"`;
}

/**
 * The print stylesheet: one portrait A4 layout for every document, Lectures
 * included, with the footer in the page's margin boxes.
 *
 * `size` is set here rather than left to the driver: Chromium lets a
 * document's own `@page` turn the page whatever the print call asks for, so
 * the one layout is only the one layout if the document says it.
 *
 * The footer lives in the margin boxes because they are the only place a page
 * number exists: `counter(page)` is the page's own, and each box is repeated
 * on every page without anything in the body being repeated with it.
 */
function printStylesheet(footer: Footer): string {
  const course = cssString(footer.course);
  const published = cssString(`Published ${PARIS_DAY.format(footer.publishedOn)}`);
  return `
@page {
  size: A4 portrait;
  margin: 18mm 18mm 20mm;
  @bottom-left { content: ${course}; font: 8pt system-ui, sans-serif; color: #555; }
  @bottom-center { content: "Page " counter(page) " of " counter(pages); font: 8pt system-ui, sans-serif; color: #555; }
  @bottom-right { content: ${published}; font: 8pt system-ui, sans-serif; color: #555; }
}
html { font: 10.5pt/1.5 system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1a1a; }
body { margin: 0; }
h1, h2, h3, h4 { line-height: 1.25; break-after: avoid; }
h1.document-title { margin-top: 0; padding-bottom: 0.3em; border-bottom: 1px solid #bbb; }
h2 { margin-top: 1.6em; }
p, li { orphans: 3; widows: 3; }
a { color: #0b57a4; }
hr { border: 0; border-top: 1px solid #ccc; margin: 1.5em 0; }
code { font-family: ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace; font-size: 0.9em; background: #f2f2f2; padding: 0.05em 0.25em; border-radius: 3px; }
pre { font-family: ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace; font-size: 8.5pt; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; padding: 0.6em 0.8em; break-inside: avoid; }
pre code { font-size: inherit; background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 9pt; }
th, td { border: 1px solid #bbb; padding: 0.3em 0.5em; text-align: left; vertical-align: top; }
th { background: #eee; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
blockquote { margin: 1em 0; padding: 0.2em 1em; border-left: 4px solid #9aa4b2; background: #f7f8fa; color: #333; }
img { max-width: 100%; height: auto; break-inside: avoid; }
`;
}

/**
 * What the manifest records for a PDF printed from `body`: the document's own
 * hash, with the print layout folded in when the layout changes the page.
 *
 * Without it, PDFs printed before the document's leading heading was dropped
 * would keep printing the title twice until their markdown changed. Folded in
 * only when the body opens with an `h1`, so a document the layout does not
 * touch keeps the hash it always had and is not reprinted for nothing.
 */
export function hashPrinted(body: string, documentHash: string): string {
  if (!LEADING_H1.test(body)) return documentHash;
  return contentHash([documentHash, `\0print:${PRINT_LAYOUT_VERSION}\0`]);
}

/**
 * The document the PDF is printed from: the title the course page shows, at
 * the top, then the rendered body — links already in their text form and
 * pictures already embedded, so nothing beside it needs fetching — laid out by
 * the print stylesheet, with `footer` at the foot of every page.
 *
 * The table's title is the one title. A body that opens with its own `h1`
 * loses that `h1`, and only that one: it would print the title a second time,
 * not always spelled the same. Later `h1`s, and a leading heading of any other
 * level, are the document's own and stay.
 */
export function printReady(
  document: PublishedDocument,
  body: string,
  footer: Footer
): string {
  const title = escape(document.title);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${title}</title>`,
    `<style>${printStylesheet(footer)}</style>`,
    "</head>",
    "<body>",
    `<h1 class="document-title">${title}</h1>`,
    body.replace(LEADING_H1, "$1"),
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
