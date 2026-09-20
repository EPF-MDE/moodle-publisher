// Implementation: private to the course package. The browser driver prints
// with it, and `print.ts` exposes it to `render`.
//
// Printing a Published Document to the PDF a file resource holds. The one
// place a PDF is made, so that nothing above the driver touches Chromium.
import { chromium } from "playwright";

import { browserMissing } from "./browser-install.ts";

/**
 * Prints one self-contained HTML document to PDF bytes: A4, portrait and
 * backgrounds printed. Chromium still lets the document's own `@page` rule
 * turn or resize the page, and draws its margin boxes, so the layout and the
 * footer are the document's to state; the publishing package's print
 * stylesheet states both.
 *
 * In a browser of its own, headless and closed straight afterwards, rather
 * than in a tab of the visible one holding the Moodle session. Printing reads
 * no cookie and needs no screen, and a document that fetched something would
 * then fetch it without the Instructor's session attached.
 */
export async function printPdf(html: string): Promise<Buffer> {
  const browser = await chromium
    .launch({ headless: true })
    .catch((error: unknown) => {
      throw browserMissing(error) ?? error;
    });
  try {
    const page = await browser.newPage();
    // "load", so that the pictures a self-contained document inlines have
    // been decoded before the page is laid out for print.
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      landscape: false,
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}
