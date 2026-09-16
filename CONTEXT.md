# EPF Moodle publisher

Publishes a Course from its repository into EPF's Moodle, one way and repeatably: the documents Students read, and the Devoirs they hand in to. Git is canonical; Moodle is the rendered mirror.

This glossary ships with the package. A course repository reaches it, and the ADRs in `docs/adr/`, through the `CONTEXT-MAP.md` it is required to keep at its root, which points into the installed publisher; `check` fails when that map is missing, does not link to both, or names nothing. Upgrading the pinned tag is the sync. **Course**, **Instructor**, **Student** and **Oral** are the course repository's words, and are used here in the sense its own glossary gives them.

## Language

### Publishing

**Published Document**: A markdown file in the course repository that the Instructor has explicitly listed as allowed into the Course. Membership is an entry in one table, the `published` list of `publisher.json`, never a directory walk: a document nobody listed is not published, and a link to it aborts the run.

**Instructor Material**: A Published Document named with an `--instructor` suffix, published hidden into the Section its Student counterpart sits in — or, where it has none, into the Section its reader is already in — and which no Student-facing document may link to. The suffix is what says so; there is no other place that does. It may be an answer key beside a Student-facing document or the source one is written from, and the publisher treats both the same (ADR-0004).

**Manifest**: The committed record of what has been published and where it landed, keyed by repository source path and kept in the course repository. It is what makes re-running boring: publishing updates what it already made instead of duplicating it.

**Section**: A named part of the Moodle course page — `Assessment`, `Deliverables`, `Lectures`, `Labs`, `Autonomy`, `Resources` — the same six in every EPF course, in that order, and not configurable. Most are named by the document that lands in them. One is not: `Deliverables` is filled from the grid's Deliverables, and a document naming it aborts the run (ADR-0005). Publishing adds Sections, all of them visible; it never reshuffles them.

**Audit**: A read-only comparison of the live Course against the course repository. It writes nothing and exists to catch what a human did by hand — a revealed page of Instructor Material, a hand-edited Freeze.

**Wipe**: Emptying the Course so it can be built again. The only destructive operation here, and it refuses outright to delete a Devoir that holds Submissions.

### Handing in

**Deliverable**: Something required from a Student by a stated instant. Each is defined once, in the front matter of the grid `publisher.json` names, with the Competencies it serves, and its `id` is written down rather than computed. _Avoid_: assignment, task, homework, rendu

**Devoir**: The Moodle activity that carries one Deliverable — Moodle's own word, and what Students see. It accepts online text only; no file is ever uploaded. _Avoid_: assignment, assign, activity (too broad)

**Submission**: One Student's answer to one Deliverable: a URL, revised in place, with no attempt history. It is the record of handing in, not the work itself.

**Freeze**: The instant a Deliverable stops accepting work, written once as its `due` and read in `Europe/Paris`. The Devoir's due date and cut-off date are both set from it, so it is enforced by the Devoir closing, never by the Instructor remembering. It is a time, not a captured commit: anything pushed later is not read. _Avoid_: deadline (use for the stated date; Freeze is the enforced instant), cut-off, due date

**Extension**: More time granted to one named Student on one Deliverable. It moves that Student's Freeze and nobody else's, and it is granted deliberately in Moodle, by hand — there is no grace period everyone gets silently, and nothing here grants one.

### Grading

**Competency**: One independently graded capability of a Course, declared per course in the `competencies:` block of the grid's front matter, one title per line, beside the Deliverables that serve it; its id — `C1`, `C2`, … — is its place in that block, and there is no default set. _Avoid_: skill (reserved for agent skills), criterion, learning outcome

**Band**: One of five ordered verdicts on one Competency: `Resit`, `Needs Work`, `Basic`, `Solid`, `Outstanding`; the scale is fixed, built into the publisher and the same in every course. There is no numeric score, no average and no /20. _Avoid_: grade, mark, score, note

**Resit**: The Band meaning the work for a Competency was not done. It is an absence verdict, not the bottom of a quality scale, and it never averages with anything.

**Feedback Letter**: The Instructor's written account to one Student of their Bands and the reasons for them, or of what would reach the next Band. There is one per Student, kept as a secret gist: the Instructor's correspondence with that Student, not course material. It is drafted before the Oral and revised after it, and its revision history shows the verdict before and after. An agent may draft it and argue for a Band, but a Band appears in it only once the Instructor has stated it. _Avoid_: gist, report, transcript, feedback (on its own)

**Banding Anchors**: Worked example answers for one Competency, written as Instructor Material: what falls short, what Solid sounds like, what Outstanding adds, and the near-misses. They let the Instructor place a Student's answer within the time the Oral allows, and they are read with the grid's Solid column when a Feedback Letter is drafted. _Avoid_: assessment examples, model answers, rubric

## Retired terms

Do not reintroduce these.

- **Publishable Document**, **Never-Publish** and **membership class** — there is one table of Published Documents, and the `--instructor` suffix says who each is for. A document nobody listed is simply not published.
- **The `Instructors` Section** — Instructor Material is hidden per page and sits in the Section its Student counterpart is in (ADR-0004).
- **Phase** — a batch of material a run published up to. Every Published Document publishes on every run; a document that must not appear yet carries a reveal date and ships hidden (ADR-0007).
- **Probe Sheet**, **Probes**, **Grade Item** and **Enrolment** — the Oral's prefilled sheet, its yes/no questions, the hidden gradebook column it was imported into, and the enrolled Student it was prepared for. The Feedback Letter replaced all four. No tool writes a Band into Moodle, and the grid's Solid column is what a Student's work is read against (ADR-0011).
