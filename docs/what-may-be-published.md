# What may be published

The `published` table, the links between documents and the instructor material it hides. Part of the [Moodle publisher README](../README.md).

## What may be published

**One table**, in the course repository's own `publisher.json`, at its root, reviewed in a diff there. Every run reads it, against the real course or the fake one:

```json
{
  "course": "Coding Agents Management 2026",
  "grid": "assessment-grid.md",
  "published": [
    { "source": "assessment-grid.md", "title": "Assessment Grid — how you are graded", "section": "Assessment" },
    { "source": "autonomy/autonomy-2-c3-exercise-brief.md", "title": "C3 exercise brief", "section": "Autonomy", "revealedOn": "2026-09-08" }
  ]
}
```

`course` is the Course's name as its Students know it, printed at the foot of every page of every PDF. `grid` is the repository-relative path of the Grid Source, which the Competencies, the Deliverables and the course's other facts are read from, and which is published as the Assessment Grid ([below](./assessment-grid.md#the-assessment-grid)). An entry in `published` names a document's source, the human title it is published under and its section, and may name a `revealedOn` date, which makes it ship hidden for the instructor to open by hand. What every course shares stays in the publisher: the six Sections, the reserved `Deliverables` Section, `Europe/Paris` and the naming of instructor material.

**A mistaken edit stops the run before the browser opens.** A missing or unparseable `publisher.json`, one whose `course`, `grid` or `published` is missing or of the wrong kind, an entry without its `source`, `title` or `section`, an entry naming a Section the course page does not have (the message lists the Sections), an entry naming `Deliverables` — whose contents are the Grid Source's Deliverables and nothing else — a `revealedOn` that is not `YYYY-MM-DD`, and two documents published under the same title once the `Instructor — ` prefix is derived: each aborts, naming the entry.

Membership is by explicit entry; nothing is discovered by walking a directory. **A document the table does not name is not published** — in the 2026 course, the C3 fixture generator under `script/`, notes nobody meant anyone to read — and a link to one of them is published as its link text alone. There is no list of things that must never be published, because there is nothing a document has to be taken off.

**Who a document is for is not in the table.** A source path ending in `--instructor.md` is material for examiners, and nothing else says so: the file sits beside the student document it pairs with — in the 2026 course, `labs/lab-3-oral--instructor.md` next to `labs/lab-3-oral.md`, `c1-banding-anchors--instructor.md` next to `assessment-grid.md` — and everything that follows from the suffix is derived at publish time. See [Instructor material](#instructor-material).

**That question is also what decides a link.** See [Cross-references](#cross-references): the rules are written against who each end of a link is for, not against publishability and not against hiddenness.

### Every entry, every run

**There is no schedule.** Every document the table names is published on every run, and `publish` takes no argument that changes which ones. A document is live the moment its entry is added to the table.

That is the whole of it, and what it gives up is worth stating: nothing now guarantees that material cannot appear before its lecture. A document that must stay out of sight until a known day carries a `revealedOn` date and ships hidden for the instructor to open by hand — see [A document with a reveal date](./re-running.md#a-document-with-a-reveal-date). Everything else appears as soon as it is written down. Adding an entry is therefore a publishing decision, made in the diff that adds it. See [ADR 0007](./adr/0007-every-entry-publishes-on-every-run.md).

**Being on the page is not being assigned.** A course page students have from day one is not reading anybody is asked to do in advance, which is what the 2026 course's [ADR-0006](https://github.com/xavxyz/epf-coding-agents-management/blob/master/docs/adr/0006-nothing-a-lecture-or-a-lab-depends-on-is-assigned-in-advance.md) forbids: what a taught session depends on is met inside that session. The table says what exists; the session says when it is read.

`publish` **aborts on any flag but `--apply`**, rather than ignoring it. `--phase` used to decide how much of the course a run published; a command line or a note that still carries it is refused by name instead of quietly reporting a full publish.

The table is checked against the repository it sits in, so a source path that is a typo fails here rather than in front of a class. Every guard over the table fires before the browser is even opened.

## Cross-references

A link from one document of a course repository to another is **published as text**, not as a link: it names the target and where on the course page to find it, and a link that would hand a student the answer key **stops the run**. No document needs another document's module id to be published, so every PDF goes in on the first pass.

A relative link ending in `.md`, with or without a `#fragment`, is resolved against the linking document's directory and looked up in the table:

- **A listed document** becomes `"<title>" (document available in the <Section> section)` — for example `"Killing bloat" (document available in the Resources section)`. The title is the one the course page shows, `Instructor — ` prefix included. The link's own text is dropped, whatever it said, so a link written ``[`../resources/killing-bloat.md`](../resources/killing-bloat.md)`` reads under the target's title like any other. A link to a heading in the linking document itself, spelled with its own path (`lab-1.md#appendix` from `lab-1.md`), is no exception: it reads as that document's own title.
- **A document the table does not list** — or a path that climbs out of the repository — becomes its link text alone, with its formatting kept and no parenthetical. Nothing publishes the target, so there is nothing to name and nothing to click.

**In-page anchors and web links stay links** — an in-page `#section` link and the 2026 course's Lecture 1 links out to aihero.dev both keep working — and so does a relative path that merely appears in a code span, because the rewrite is done to the rendered HTML, where a link is unambiguously an `<a>` with an `href`. A cross-reference the rewrite cannot find in the rendered page — an `<a>` its author never closed — stops the run while the document is read, rather than publishing the path.

**A GitHub reference naming its repository is published as a link.** GitHub links `EPF-MDE/OceENS#97` on its own pages, but it is not markdown, so a course written on GitHub looks linked there and prints as plain text. The publisher links it to `https://github.com/EPF-MDE/OceENS/issues/97`, which GitHub redirects when the number is a pull request's. `#97` alone stays text: GitHub takes its repository from the page it is on, and a PDF is on none. A reference inside a link's text or a code span is left as written. A document making one is folded into the content hash as linking them, so it is republished once rather than kept as the text it was published with.

The title and Section come from the same table entry that decides whether the link may be published at all, never from the filename or from a heading in the target. Both are folded into the document's content hash for the same reason the bytes of a picture are: rename or move an entry in the table and every document linking to it reads differently, which nothing in the linking document's markdown would show.

What a link is allowed to mean turns on **who each end of it is for**, not on publishability and not on hiddenness:

| Link from | Link to | Verdict |
| --- | --- | --- |
| student-facing | instructor material | **hard error** |
| instructor material | anything published, either kind | text |
| anything | a document the table does not list | link text alone |
| anything | a published document that is hidden | text, like any other |

Who it is for rather than whether it is hidden, because the 2026 course's C3 brief is the counterexample already in its table: it ships hidden and is student-facing all the same. A rule written about hidden documents would refuse the lecture that points at the brief and allow a brief that points at the answer key.

**A link to a hidden document is not warned about.** It is only text, so there is nothing for a reader who cannot see the target to click and be refused.

**Every refusal happens while the plan is being built**, before anything is written to the course — so `npm run plan`, which applies nothing, is a complete link check.

The tests drive the command line against a temporary repository with its own `publisher.json`, exactly as a course repository is run. That file decides what a repository publishes; it has no say over which of those documents are instructor material, because that is the filename's to say.

## Instructor material

Examiners need the banding anchors and the oral script on the day, in the same place they already go for the course. So they are published, by the same command as everything else, **hidden, into the section the student document they pair with sits in** — in the 2026 course, the anchors in `Assessment` beside the grid, the oral protocol in `Labs` beside the brief, the worked solution in `Autonomy` beside the exercise.

**The filename decides, and nothing else does.** A source path ending in `--instructor.md` is instructor material. From that one fact the publisher derives the whole of the treatment: the PDF is created hidden, it is re-hidden by any later run that finds it showing, its title is published under an `Instructor — ` prefix, and no student-facing document may link to it. Renaming a file is therefore the whole of the change — add the suffix and the same entry publishes hidden, drop it and the same entry publishes visible.

There is deliberately **no guard against listing an instructor document without its suffix**. It would publish visible, and the thing that would have to be checked against is the filename, which is the statement itself; a second place saying who a document is for is a second place to disagree with the first.

**What the guarantee is.** Moodle's role system, not obscurity. A hidden activity is refused to anyone without the capability to view hidden material; a student enrolled as a student does not have it, and a direct URL is refused too. Teachers and non-editing teachers do have it, which is the point — a co-examiner is already a teacher on the course.

**What it is not.** It is not encryption, and it is not a promise about anyone who is more than a student. A course-level role override, a student who is also a teacher on the course, or anyone with site-level rights can read every word of it. In the 2026 course, the seeded C3 bug's real protection remains the **private GitHub repository** until 8 September; hiding the PDF is what keeps it off the course page, not what makes it secret.

**Why the activity and not a section.** Hiding a section is one click, covers everything in it, and one click the other way — made in a hurry on the day a brief is being revealed — uncovers all of it at once and says nothing afterwards ([ADR-0004](./adr/0004-instructor-material-is-hidden-per-page.md)). So visibility is a property of the activity. Every section the publisher creates is created visible, and no run hides a section.

Four things make the per-activity lock enforceable rather than merely intended:

1. **Created hidden, in one submission.** There is no moment between an instructor PDF being created and being hidden: the resource form carries the visibility, so the PDF is never on the course page showing.
2. **Hidden, never stealthed.** "Available but not shown on the course page" leaves a URL that still works for anyone who has one. The publisher never sets stealth mode, and a driver that finds an activity it just created stealthed **aborts**.
3. **Self-healing, one way only.** A run that finds an instructor PDF visible **re-hides it and says so** in the output, so an accidental reveal is corrected at the next publish rather than persisting until a student finds it. The plan reports the `hide` before anything is applied, and a dry run performs none of it. The driver call it uses takes **no boolean**, so the publisher has no operation that reveals.
4. **Every visibility write is read back.** Creating an activity hidden and re-hiding one are each confirmed against the course page afterwards, and a write that quietly did nothing **aborts** with an instruction to hide it by hand. So does a write whose result cannot be read back at all: an activity the course page no longer lists is a question the run could not get an answer to, and "I cannot find the answer key" is not reported as "the answer key is hidden".

Instructor material is published from the first run, wherever it sits — including, in the 2026 course, the oral protocol, beside the student-facing brief it is the examiner's half of. What keeps it from students is the hiding and the re-hiding, and nothing about _when_ a document is published has any say over it.

**Titles carry the prefix, derived rather than typed.** In the 2026 course an examiner reads `Instructor — C3 worked solution`; the table entry says `C3 worked solution`. The prefix is what a section name used to say and nothing else now does, so it is derived from the suffix at publish time — there is no entry that can carry the prefix without the hiding, or the hiding without the prefix. Nothing in the publisher _recognises_ instructor material by its title: a run finds these documents by module id, which is the only thing that still identifies an activity somebody has retitled by hand.

**Seeing it hold.** The test suite proves the mechanism; the guarantee is confirmed by hand, once, on each real course: publish, then use Moodle's **Switch role to… Student** and check that no instructor PDF, and no direct URL to one, is reachable. A guard never seen to fire is not a guard, and this is the guard that matters most.

## Reviewing the course

Nothing in the publisher checks the course after a run. What a human did by hand in Moodle — a revealed PDF of Instructor Material, a Freeze moved, file upload switched back on, a Devoir deleted — is found by reviewing the course by eye, against [docs/human-review-checklist.md](./human-review-checklist.md). The `audit` command that used to read the course for this is retired.

## Seeing the guards fire

A guard never seen to fire is not a guard, so each is exercised:

- A student-facing document linking to instructor material makes the **publisher refuse to start**, naming both ends (`src/tests/cross-references.test.ts`), in markdown and in raw HTML, in either quote style. The startup guard is deliberately in front of everything else, so the signpost never reaches the course.
- Revealing an instructor activity in the fake course makes the next run **re-hide it and report it**, and only it (`src/tests/instructors.test.ts`); revealing a student-facing document proves the opposite rule still holds, and it stays revealed.
- Renaming a document to add or drop the `--instructor` suffix, with no other edit, changes whether it publishes hidden and under the prefix (`src/tests/catalog.test.ts`).
