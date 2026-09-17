---
status: supersedes one consequence of ADR-0008 (Lectures are written as a Runbook and published twice, in EPF-MDE/coding-agents-management)
---

# The Course is published as PDFs

Every Published Document used to be a Moodle page, written by driving Moodle's page editor in a browser: the Atto editor filled in, every picture uploaded through Atto's image dialogue and addressed as `@@PLUGINFILE@@`. That was the most fragile part of the publisher, and the part that cost the most during the first run of the Course. Students, meanwhile, had nothing to take away. A page cannot be downloaded, printed or annotated, so a Student who wanted the Lecture they sat through, or the Lab they were about to work, on paper or offline had no way to get it.

So from `v3` on, every Published Document goes into its Section as a PDF, in a Moodle file resource, instead of a page. The markdown in git is still what the Instructor writes and reviews. Each run renders it to one self-contained, print-ready HTML document, with the title at the top, links already in their text form and every picture embedded. The browser driver prints that document to PDF with Chromium and uploads it. Nothing above the driver touches Chromium, and the PDF is never committed.

Instructor Material is a hidden PDF, decided by the `--instructor` suffix exactly as before (ADR-0004), and a document with a reveal date is created hidden. The Manifest records each PDF by repository source path, with a hash taken over the markdown and the pictures it shows, never over the PDF's bytes, which a render is free to vary.

## Considered options

- **Keep pages and add a PDF beside each one** (EPF-MDE/coding-agents-management#75). Rejected: it keeps the fragile page path and doubles what each run writes, and two copies of one document are two copies to keep in step.
- **Commit the rendered PDF.** Rejected: git would hold a source and a binary that can drift, and a diff of a PDF reviews nothing.
- **A choice of format per document.** Rejected: one format is one path to keep working.

## Consequences

- **ADR-0008's consequence "no deck is uploaded as a file, and there is no new kind of artifact" is superseded.** Every document is now uploaded as a file. Its decision still holds: a Lecture is written as a Runbook, and the Runbook and the Lecture are two Published Documents.
- **ADR-0008's duplicated-pictures consequence is retired.** A picture is embedded in each PDF that shows it, so no activity keeps its own uploaded copy for another to point at.
- **A PDF opens with its title**, as the course page names it, `Instructor — ` prefix included.
- **Pictures cost bytes in each PDF.** A diagram shown by two documents is inside both.
- **ADR-0004's title** (*Instructor material is hidden per page*) stays as recorded history. Its decision holds per PDF.
- **How a PDF looks, the add-resource form and whether a hidden PDF is unreachable by a Student** are checked by hand against a Moodle test course, never by the suite. The fake course keeps the HTML it was handed, and the tests read that.
