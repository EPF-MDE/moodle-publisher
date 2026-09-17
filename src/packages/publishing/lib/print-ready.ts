// Implementation: private to the publishing package.
//
// A Published Document as the course receives it: the name its PDF is stored
// under, and the one self-contained HTML document that PDF is printed from.
// Printing is the driver's; everything the PDF says is decided here, the page
// it is laid out on included.
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

/** What every page of a run's PDFs says at its foot, besides its number. */
export interface Footer {
  /** The Course, as `publisher.json` names it. */
  readonly course: string;
  /** The instant the run publishes as of; the page shows its day in Paris. */
  readonly publishedOn: Date;
}

/**
 * The day `instant` falls on in Paris, as a reader writes it:
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
 * The document the PDF is printed from: the title the course page shows, at
 * the top, then the rendered body — links already in their text form and
 * pictures already embedded, so nothing beside it needs fetching — laid out by
 * the print stylesheet, with `footer` at the foot of every page.
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
    body,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
