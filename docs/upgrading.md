# Upgrading the publisher

What a course repository does, once, when it moves its pinned tag past a release that asks for it. Each note is written for the agent doing the upgrade in the course repository, which reads it here, in the installed publisher: `node_modules/@epf-mde/moodle-publisher/docs/upgrading.md`. The newest note is first.

## v4.1.0 — the Grid Frame states the Rehearsal, the Reading Day and the Oral's timetable

Three things an Instructor says in every course are now the Grid Frame's to say: the **Rehearsal**, the supervised lab before the Freeze that does not count towards a Band; the **Reading Day**, after which nothing pushed is read; and the **Oral's timetable**, what happens minute by minute. The wording is shared, so improving it reaches every course by moving the pinned tag. The facts are the course's, declared in the Grid Source's front matter.

Each of the three is optional. **No course is made to declare one**: the Frame prints nothing about a Rehearsal it was not told of — no heading and no placeholder — so there is nothing to do here unless the course has one of the three to state. This release asks for no edit, and refuses no grid it accepted before.

To state them, add to the front matter of the file `publisher.json` names as `grid`:

```yaml
rehearsal:
  when: 11 December 2026
  length: 3 hours
readingDay:
  when: 4 January 2027 at 09:00
oral:
  length: 9 minutes
  when: 8 January 2027
  timetable:
    - at: 0:00–2:00
      what: C1 question
    - at: 6:00–8:00
      what: "A twist: one constraint of your system changes, and you say what your design does about it"
```

Every field of a block that is written is required, and `check` refuses a half-written one, naming the field — `rehearsal.length`, `oral.timetable[2].what`. None is read as a date: each is printed as the course writes it, like the Oral's `when`. Only a Deliverable's `due` is a real instant, because only a Devoir enforces one. A timetable row's `what` is prose: it may name a Competency, and nothing checks it against `competencies:`.

**If your old grid stated any of the three in its own prose, declare them rather than delete them.** A course still migrating from before v4.0.0 should read the note below with this one open: what it says to delete from _How the Bands are given_ includes the Rehearsal, the Reading Day and the Oral's timetable, and those three come back here as front matter.

**The first publish after the pin moves replaces the Assessment Grid, whether or not you declare anything.** This tag's Grid Frame also states the Oral below the Freezes rather than above them, which every course's assembled grid reflects; as with any new Frame, `publish` plans `replace` on the Assessment Grid, keeping its module id, Section place and visibility, and `skip` on every other Published Document. Read the plan before `--apply`.

## v4.0.0 — the Assessment Grid is assembled

The Assessment Grid a Student reads is no longer written whole by the course. The publisher assembles it at publish time from the course's **Grid Source** and the **Grid Frame** it ships ([ADR-0014](./adr/0014-the-assessment-grid-is-assembled-from-a-grid-source-and-a-grid-frame.md); the terms are in the publisher's `CONTEXT.md`). The Grid Frame, [`grid-frame.md`](./grid-frame.md), holds everything a Student reads except the bodies of the Competency blocks: the opening line, the Band legend and the two gaps, how the Bands are given, each Freeze, the Feedback Letter, each Competency's heading and the Resit section. It writes each Freeze from its Deliverable's `due`, each heading from `competencies:`, and the programme, the term and the Oral from new front-matter fields.

So the grid a course copied from an earlier publisher states all of that a second time, and `check` refuses it: it has no `programme`, `term` or `oral`, and its prose has headings that are not a Competency's id. Converting it is a single edit to the file `publisher.json` names as `grid`. The publisher neither detects nor converts the old shape.

1. **Move the pin** to the new tag in `package.json`, and run `npm install`.
2. **Add the course's facts to the front matter**, beside `competencies:` and `deliverables:`, each as the old grid's prose states it and printed as written:
   - `programme` and `term`, from the opening line (`**EPF · Ingénieur 4A · Autumn 2026**` gives `Ingénieur 4A` and `Autumn 2026`);
   - `oral:` with `length` and `when`, from the account of the Oral (`The Oral — 20 minutes, individual, on 14 and 15 December 2026` gives `20 minutes` and `14 and 15 December 2026`). The Grid Frame prints them as "The Oral — individual, `<length>`, `<when>` —".
3. **Keep each Competency block, re-headed by its id alone.** `## C1 — Framing and decomposing work` becomes `## C1`: the Grid Frame writes the title from `competencies:`. Keep everything under the heading down to the next `## `: the fiche quote, the Subject, the expected evidence, the Band table with its five rows and the Oral question. Drop a `---` rule that ends a block: the Grid Frame prints its own rules between the blocks.
4. **Delete everything else**: the `# ` title, the opening line, _How this course is assessed_, _How the Bands are given_ with its Freeze lines, _Your Feedback Letter_, _Resit_, and the `---` rules between them. The Grid Frame says all of it.
5. **Run `npx moodle-publisher check`** and fix what it names until it passes.

Three things are the Instructor's to decide, so ask rather than pick:

- A Freeze the old prose states differently from its Deliverable's `due`. The `due` is what the Devoir enforces, and from now on it is also what Students read.
- A Competency title the old heading writes differently from `competencies:`. The `competencies:` title is the one printed.
- Anything in the deleted sections that is the course's own rather than the shared text: a remark about this course's Oral, say. The Grid Frame cannot be reworded, so it belongs in a Competency block, in another Published Document, or nowhere. Three of them are the Frame's from v4.1.0 on, and are declared in the front matter rather than deleted: a Rehearsal, a Reading Day and the Oral's timetable — see the note above.

**The first publish afterwards replaces the Assessment Grid, and nothing else.** `npx moodle-publisher publish` plans `replace` on the Assessment Grid, keeping its module id, Section place and visibility, so Student bookmarks and Moodle's logs survive, and `skip` on every other Published Document. Read the plan before `--apply`. Every later publish replaces the Assessment Grid only when its assembly changes: an edit to a block, a retitled Competency, a moved `due`, or a new Grid Frame brought by a later tag.

### A worked example

The grid as a course copied it from an earlier publisher, shortened:

```markdown before
---
competencies:
  - Framing and decomposing work
  - Recovering from failure
deliverables:
  - id: repository
    title: Your repository
    competencies: [C1, C2]
    due: 2026-12-11T18:00:00+01:00
---

# Assessment Grid — Software Craft

**EPF · Ingénieur 4A · Autumn 2026**

---

## How this course is assessed

Each Competency is assessed on its own, and given one of five Bands.

## How the Bands are given

The Oral — 20 minutes, individual, on 14 and 15 December 2026 — does not discover your work: it **verifies** that the work is yours.

**Freeze:** your repository must be handed in by **18:00 on Friday 11 December 2026**.

## Your Feedback Letter

The Bands reach you in a **Feedback Letter**.

---

## C1 — Framing and decomposing work

**Subject:** the brief you write before an agent starts.

| Band | What it looks like |
| --- | --- |
| **Resit** | There is no brief. |
| **Needs Work** | The brief exists, and does not say what done means. |
| **Basic** | The brief says what done means. |
| **Solid** | The brief says what done means, and why the work is cut where it is. |
| **Outstanding** | All of Solid, plus where the cut stops holding. |

**Oral question:** _"Why is the work cut there?"_

## C2 — Recovering from failure

**Subject:** a run that failed, and what you did next.

| Band | What it looks like |
| --- | --- |
| **Resit** | There is no failed run to show. |
| **Needs Work** | The run failed, and nothing was done about it. |
| **Basic** | The run was restarted, and passed. |
| **Solid** | The failure was diagnosed before the restart, and the cause is written down. |
| **Outstanding** | All of Solid, plus which failures the fix does not cover. |

**Oral question:** _"What did the failure tell you?"_

---

## Resit

A **Resit** Band means the work for that Competency was not done.
```

The same file as a Grid Source:

```markdown after
---
programme: Ingénieur 4A
term: Autumn 2026
oral:
  length: 20 minutes
  when: 14 and 15 December 2026
competencies:
  - Framing and decomposing work
  - Recovering from failure
deliverables:
  - id: repository
    title: Your repository
    competencies: [C1, C2]
    due: 2026-12-11T18:00:00+01:00
---

## C1

**Subject:** the brief you write before an agent starts.

| Band | What it looks like |
| --- | --- |
| **Resit** | There is no brief. |
| **Needs Work** | The brief exists, and does not say what done means. |
| **Basic** | The brief says what done means. |
| **Solid** | The brief says what done means, and why the work is cut where it is. |
| **Outstanding** | All of Solid, plus where the cut stops holding. |

**Oral question:** _"Why is the work cut there?"_

## C2

**Subject:** a run that failed, and what you did next.

| Band | What it looks like |
| --- | --- |
| **Resit** | There is no failed run to show. |
| **Needs Work** | The run failed, and nothing was done about it. |
| **Basic** | The run was restarted, and passed. |
| **Solid** | The failure was diagnosed before the restart, and the cause is written down. |
| **Outstanding** | All of Solid, plus which failures the fix does not cover. |

**Oral question:** _"What did the failure tell you?"_
```
