// An entry point: printing a Published Document to PDF with no course open.
//
// The same printing the browser driver does when it uploads a file, so the PDF
// `render` writes is the PDF a run would upload. Headless, and it reads no
// session: printing touches no Moodle.
export { printPdf } from "./lib/print-pdf.ts";
