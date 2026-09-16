# EPF Moodle publisher

Publishes a Course from its repository into EPF's Moodle, one way and repeatably: the documents Students read, the Devoirs they hand in to, and the gradebook the Instructor fills in at the Oral. Git is canonical; Moodle is the rendered mirror.

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

**Competency**: One independently graded capability of a Course, declared per course in the `competencies:` block of the grid's front matter, one title per line, beside the Deliverables that serve it and the Probes that ask about it; its id — `C1`, `C2`, … — is its place in that block, and there is no default set. _Avoid_: skill (reserved for agent skills), criterion, learning outcome

**Band**: One of five ordered verdicts on one Competency: `Resit`, `Needs Work`, `Basic`, `Solid`, `Outstanding`; the scale is fixed, built into the publisher and the same in every course. There is no numeric score, no average and no /20. _Avoid_: grade, mark, score, note

**Resit**: The Band meaning the work for a Competency was not done. It is an absence verdict, not the bottom of a quality scale, and it never averages with anything.

**Probe Sheet**: The per-Student, per-Competency prompt the Instructor fills in during the Oral: the provisional Band, the yes/no Probes drawn from the grid, and the weakest point to probe. It is prepared by tooling and completed by a human (ADR-0002). _Avoid_: rubric, scorecard, pre-evaluation

**Probes**: The yes/no questions one Probe Sheet asks, one list per declared Competency. Defined once, in the front matter of the grid, beside the Deliverables — so that what is asked at the Oral and what Students read are checked by eye in one diff. A declared Competency with no Probes, or Probes keyed by a Competency the grid does not declare, aborts the run. A probe naming a Band is refused: the sheet carries the questions, never the verdict (ADR-0002). _Avoid_: questions (too broad), criteria (those are the grid's), checklist

**Enrolment**: One Student the Course reports as enrolled, read from Moodle at the moment sheets are generated — never authored here, since nothing in the publisher enrols or unenrols anyone. The email is the identity, carried as opaque data; the name is for the human reading the sheet and is never a key. Only those enrolled as Students are Enrolments, because a Probe Sheet is prepared for somebody who sits an Oral. _Avoid_: user, participant, roster

**Grade Item**: Where a Probe Sheet lives in Moodle: one manual gradebook column per declared Competency, named `<id> — <title>`, hidden from Students, excluded from the course total, valued on the Bands rather than a number. _Avoid_: grade, column, note

## Retired terms

Do not reintroduce these.

- **Publishable Document**, **Never-Publish** and **membership class** — there is one table of Published Documents, and the `--instructor` suffix says who each is for. A document nobody listed is simply not published.
- **The `Instructors` Section** — Instructor Material is hidden per page and sits in the Section its Student counterpart is in (ADR-0004).
- **Phase** — a batch of material a run published up to. Every Published Document publishes on every run; a document that must not appear yet carries a reveal date and ships hidden (ADR-0007).