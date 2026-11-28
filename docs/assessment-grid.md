# The assessment grid

The Grid Source, its Competencies and its Deliverables. Part of the [Moodle publisher README](../README.md).

## The assessment grid

The Assessment Grid a Student reads is never written whole: the publisher assembles it at publish time from two parts ([ADR-0014](./adr/0014-the-assessment-grid-is-assembled-from-a-grid-source-and-a-grid-frame.md)), and says nothing about what this course does not have ([ADR-0015](./adr/0015-what-a-course-may-not-have-is-a-region-of-the-grid-frame.md)).

- The **Grid Source** is the course's part: the file `publisher.json` names as `grid`. Its front matter declares the [Competencies](#competencies), the [Deliverables](#deliverables), the programme, the term and the Oral, and — where the course has them — the Rehearsal, the Reading Day and the Oral's timetable. Its prose holds one block per Competency, headed by the Competency's id alone (`## C1`), and nothing else.
- The **Grid Frame** is the publisher's part, the same in every EPF course: the opening line naming the course, programme and term, the legend of the five Bands and the two gaps (_justification_ and _knowing the limits_), each Freeze and the Extension sentence, how the Oral verifies a provisional Band, how the Feedback Letter is made, each Competency's heading, and the Resit section. Three of its parts are printed only where the course declares the facts they state — the Rehearsal, the Reading Day and the Oral's timetable — and a course that declares none reads nothing about them. It is [docs/grid-frame.md](./grid-frame.md), shipped in the package, so an Instructor reads what their Students read around their blocks at `node_modules/@epf-mde/moodle-publisher/docs/grid-frame.md`.

The publisher prints the Grid Frame with the course's facts and blocks written into it. The opening line is `<course> · EPF <programme> · <term>`, from `publisher.json`'s `course` and the front matter's `programme` and `term`. The Oral is stated as "individual, `<length>`, `<when>`", from `oral:`'s `length` and `when`, and its timetable, the Rehearsal and the Reading Day are printed where `oral.timetable:`, `rehearsal:` and `readingDay:` are written and left unsaid where they are not. Each Freeze is written from its Deliverable's `due` (see [Deliverables](#deliverables)). The blocks come in `C1…Cn` order, whatever order the Grid Source writes them in, each headed `C1 — <title>` with its title from `competencies:`. Each field is printed as written, and none is defaulted:

```yaml
---
programme: Ingénieur 4A
term: Autumn 2026
oral:
  length: 20 minutes
  when: 14 and 15 September 2026
  # Optional, like the two blocks below: left out, the grid says nothing of it.
  timetable:
    - at: 0:00–2:00
      what: C1 question
rehearsal:
  when: 11 December 2026
  length: 3 hours
readingDay:
  when: 4 January 2027 at 09:00
competencies:
  - Framing and decomposing work
deliverables:
  - id: c1-1
    title: Your repository — C1
    competencies: [C1]
    due: 2026-09-10T20:00:00+02:00
---
```

The front matter is never printed. To read the grid as Students will, before publishing, run `npx moodle-publisher render <grid>`. The Grid Frame prints no title of its own: the PDF opens with the title the `published` table gives the grid, as every Published Document's does. A cross-reference or a picture in a Competency block is published as in any other document.

**A course can neither drop nor reword the Grid Frame; it changes when the pinned publisher does.** The Manifest's hash for the grid is taken over the assembled markdown, so moving the pin to a tag with a new Grid Frame makes the next publish `replace` the Assessment Grid in its module, keeping its module id, Section place and visibility, and leaves every other document at `skip`. A tag whose Grid Frame is unchanged changes nothing. Retitling a Competency or moving a `due` replaces the Assessment Grid the same way.

**A Grid Source in the wrong shape is refused**, by every command that reads the catalog, `check` included, before any browser opens and with the same message from `check` as from `publish`:

- a `programme`, a `term`, an `oral:` block, or its `length` or `when`, missing or not text, naming the field;
- a `rehearsal:`, a `readingDay:` or an `oral.timetable:` that is written and incomplete, naming the field — `rehearsal.length`, `oral.timetable[2].what`. Leaving one of the three out is not a mistake: the Grid Frame then says nothing about it;
- a timetable row naming a Competency `competencies:` does not declare, naming the row and the id. A row's `what` is prose and may say anything, but a `Cn` in it is a Competency a Student is graded on, and pointing a minute of the Oral at one that does not exist is a minute spent on nothing;
- a declared Competency with no block, naming it;
- a block headed by a Competency `competencies:` does not declare (a renumbering mistake, most often), naming it;
- two blocks for one Competency;
- a block whose Band table does not have the five Bands as rows in order (`Resit`, `Needs Work`, `Basic`, `Solid`, `Outstanding`), and above all one with no Solid row. The Solid row is what a Student's work is read against when their Feedback Letter is drafted ([ADR-0011](./adr/0011-the-feedback-letter-replaces-the-probe-sheet.md)), so no Competency is published without one;
- any other `## ` heading, naming it. A heading inside a fenced code block is code, not a heading.

The package ships a starting point: the **Grid Source starter**, [docs/grid-source-starter.md](./grid-source-starter.md). A course copies it once, by hand, to the path its `publisher.json` names as `grid`, and fills in the placeholders written `<like this>`: the front matter, with one Competency and one Deliverable, and one Competency block with the fiche quote, the Subject, the expected evidence, the five Band rows and the Oral question. As copied, placeholders and all, it passes `check`. A course that copied the full grid an earlier publisher shipped converts it once, following [docs/upgrading.md](./upgrading.md).

## Competencies

A course is graded on the **Competencies** its Grid Source declares, in a `competencies:` block of its front matter, beside the Deliverables that serve them:

```yaml
---
competencies:
  - Framing and decomposing work
  - Extending and constraining an agent
  - Recovering from failure
---
```

Each is written as its title alone, and the Grid Frame prints it as its block's heading. Its **id is generated from its place**: `C1` for the first, `C2` for the second, and so on. A Deliverable's `competencies` refer to that id. Reordering the list renumbers them, so add a Competency at the end. A course graded on two or five is published exactly as one graded on three. The five Bands and their scale are not declared anywhere: they are EPF's, the same for every course.

Every mistake here **aborts before the course is opened**: a Grid Source with no `competencies:` block, a Competency with no title, and a Deliverable serving a Competency the grid does not declare.

A Grid Source that still has a `probes:` block **aborts every command**, naming [ADR-0011](./adr/0011-the-feedback-letter-replaces-the-probe-sheet.md): the publisher no longer prepares the Oral, so delete the block. Each Competency's Solid row is what a Student's work is read against. The Grade Items and the `Bands` scale an earlier version made in a live course stay where they are; whether to delete those gradebook columns is the Instructor's call, made by hand. The manifest still reads the entries it recorded for them, and the next run that writes it leaves them out.

## Deliverables

A **Deliverable** is something required from a student by a stated instant. Each is defined **once**, in the front matter of the Grid Source, and its `due` is its **Freeze**. That one `due` is written twice by the publisher and never by hand: into the Devoir, whose due date and cut-off date enforce it, and into the Assessment Grid, whose Grid Frame states it. So the Freeze a Student reads is the instant the Devoir closes, and the two cannot drift. They did when both were written by hand: the 2026 course shipped `14:00` to the live course while two of its files said `20:00`.

```yaml
---
deliverables:
  - id: c1-1
    title: Your repository — C1 and C2
    competencies: [C1, C2]
    due: 2026-09-10T20:00:00+02:00
  - id: c3-1
    title: Your C3 branch — recovering from failure
    competencies: [C3]
    due: 2026-09-10T20:00:00+02:00
    visible: false
---
```

**No entry says where it goes.** There is one `Deliverables` section, it holds Devoirs and nothing else, and its membership is derived from this front matter ([ADR-0005](./adr/0005-devoirs-live-in-a-section-of-their-own.md)): a section whose contents are decided by what a thing _is_ does not take a field saying where it goes, and a field would invite a fixture to name another one. A published document that names `Deliverables` **aborts the run** — `Deliverables` is a real section, so the check that asks whether a section exists would pass it straight through, and this is the guard beside it that does not.

`id` is **authored, never computed from position**: it is what the published Devoir will be recorded under, so inserting a Deliverable above another one must not rename it. `visible` defaults to true and is the only defaulted field. There is no `link_kind`: the 2026 course's two Deliverables are both repository URLs, and nothing distinguishes them by link kind.

Which document defines the Deliverables is the catalog's `grid`: one Grid Source, from whose front matter the Competencies are read too. The same doctrine as the table above, for the same reason: nothing is discovered by noticing that a document happens to carry front matter, and a grid that defines no Deliverables aborts, naming it, rather than quietly publishing no Devoir.

The Assessment Grid states **one Freeze line per Deliverable**, in `due` order, naming the Deliverable by its `title` and giving its time and date in `Europe/Paris` — `20:00 on Thursday 10 September 2026` — followed by the Extension sentence. Moving a `due` moves both the Devoir and that line, and replaces the Assessment Grid on the next publish.

`publish` also reports every Deliverable and states each **Freeze in full** — the weekday, the date, the time, the zone and the instant — so a wrong date is caught by reading the plan rather than by a student at a deadline. The section is stated once, in the heading over them, rather than repeated down a column: it is the same constant for every Devoir, and what is worth checking against the timetable on that page is the Freeze.

Everything that can go wrong here **aborts, before the course is opened, naming the Deliverable**:

| The mistake | What happens |
| --- | --- |
| Two Deliverables share an `id` | Refuses, naming both by title and by the document they are written in |
| `due` has no offset, or an offset that is not `Europe/Paris`'s on that day | Refuses, saying which offset Paris was on |
| `due` cannot be read, or is absent | Refuses. Nothing is defaulted |
| A competency the Grid Source does not declare | Refuses, naming it and the Deliverable |
| `visible` written as anything but `true` or `false` | Refuses. `visible: fasle` must not read as "visible" — in the 2026 course, `c3-1` is the one that ships hidden |
| A published document naming the `Deliverables` section | Refuses, naming the document. Nothing but a Deliverable lands there |

The front matter is read by the publisher and never published: the Assessment Grid a student reads starts with its title and then the Grid Frame's opening line.
