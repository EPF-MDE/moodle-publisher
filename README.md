# Moodle publisher

Pushes named course documents from a course repository into a Moodle course, one way and repeatably. Git stays canonical; Moodle is a rendered mirror. Re-running it is meant to be boring.

It was built inside the 2026 Coding Agents Management curriculum ([xavxyz/epf-coding-agents-management]), whose history holds how it came to be, and moved here so that any EPF course repository can install it. That course's table of Published Documents is still in the code for now, and so are the examples below.

[xavxyz/epf-coding-agents-management]: https://github.com/xavxyz/epf-coding-agents-management

## Installing it

A course repository depends on the publisher as a git dependency pinned to a tag. There is no registry and no build step: the package is TypeScript that Node runs directly, and it needs Node 24 or later.

```bash
npm install --save-dev github:epf-mde/moodle-publisher#<tag>
npx moodle-publisher publish      # the binary takes the commands below
```

**Run it from the course repository's root.** The directory the command is started in is the repository root: the documents are read from there, and the course's run state is kept there — `moodle-manifest.json` (committed), `.env`, `runs/` and `probe-sheets.csv` (all three git-ignored in the course repository: a session's captures and every Student's sheet). Nothing is kept beside the publisher, which once installed is inside `node_modules`, where the next install would delete it. `PUBLISHER_REPO_ROOT` names another root, and `PUBLISHER_MANIFEST`, `PUBLISHER_ENV_FILE`, `PUBLISHER_PROBE_SHEETS` and `MOODLE_RUN_DIR` each still move one file. The Moodle session stays outside git, in `~/.config/epf-moodle-publisher/`.

Playwright's browser binary is installed once per machine, as below. Working on the publisher itself, `npm run <command>` from this repository runs the same commands from source; this checkout holds no course, so point `PUBLISHER_REPO_ROOT` at one, and the run state follows it there.

## Running it

```bash
cp .env.example .env    # fill in the site and the course id

npm run setup           # reports how the gradebook would be configured for the Oral
npm run setup -- --apply  # creates the Bands scale and the three grade items

npm run plan            # reports what would happen; applies nothing
npm run apply           # publishes; opens a visible browser
npm run probes          # writes the Probe Sheets to probe-sheets.csv
                        # reads the live enrolment and the Submissions; changes nothing
npm run import          # reports what would enter the gradebook from that file
npm run import -- --apply  # puts it through Moodle's own gradebook import
npm run audit           # reads the course and checks it; writes nothing
                        # all of these open a visible browser and need a signed-in
                        # session, except `npm run import` without --apply, which
                        # reads the generated file and the manifest, not the course

npm run check:upload    # sends pictures into an activity form on the live course
                        # through the driver's own code, and abandons the form

npm run wipe -- --course <id>           # reports what emptying would delete
npm run wipe -- --course <id> --apply   # empties the course
```

Reporting the plan is the default. Applying is opt-in (`publish --apply`), so an exploratory invocation is always safe: a plan writes nothing to the course and nothing to the manifest.

`npm run probes` has no `--apply`, and that is not an omission: its whole output is a file. It writes one Probe Sheet per enrolled Student per Competency — the yes/no probes from the grid's front matter, that Student's submitted URL, an empty provisional band and an empty weakest point — to `probe-sheets.csv`, which is git-ignored because every line of it belongs to somebody. Read it before any of it enters the gradebook. Students are matched by **email**: it is the only identity field this Moodle populates, and nothing anywhere reads the part after the `@`. A Submission whose email matches nobody enrolled aborts the run, because the alternative is a sheet silently missing from the set.

It does, however, **read** the course, and so it opens the browser and needs a signed-in session exactly as an apply does. That is new, and it is the price of one line in the plan: whether instructor material somebody revealed has to be re-hidden is a fact about the live course, not about this repository, and a dry run that could not say so would be hiding the riskiest thing the run does until the moment it did it.

Configuration comes from the environment. If `MOODLE_BASE_URL` or `MOODLE_COURSE_ID` is missing the run aborts with a message naming it — there is no default course anywhere in the code. See [.env.example](./.env.example) for the variable names.

`.env` supplies those variables so they do not have to be retyped, and is git-ignored. It is the **lower** layer: the shell overrides it, always.

```bash
MOODLE_COURSE_ID=771 npm run apply   # goes to 771, whatever .env says
```

That ordering is the point of reading the file at all. Publishing to the wrong course is the expensive mistake here, and the way it would happen is a stale `.env` in the working copy quietly beating the id an instructor typed on purpose. A run with no `.env` at all works exactly as before. `PUBLISHER_ENV_FILE` names a different file; if that file does not exist the run aborts rather than silently falling back to whatever is left in the shell.

## The attended browser

EPF's Moodle authenticates exclusively through Office 365, and a web service token is not obtainable for the instructor's account, so writes go through a real browser driving the Moodle UI.

- The browser is **visible**, always. It never runs headless and refuses to run when `CI` is set.
- The instructor logs in to Microsoft **by hand, once**. This tool never reads, stores or transmits the EPF password; only Playwright's session state is persisted, to `~/.config/epf-moodle-publisher/session.json` by default — outside git, and revocable by logging out of Office 365. The run waits for `MOODLE_BASE_URL` itself and for a signed-in page, not merely for the browser to leave the Microsoft host: a real sign-in may hop through an intermediate identity host on its way back.
- If a run is ever bounced to `login.microsoftonline.com` it **aborts immediately** rather than half-writing content. The check starts once the hand login is done, so the login you were asked to perform is not itself mistaken for a bounce; every page the driver opens after that is watched, including the per-activity pages the audit reads.
- If the course in the browser is not `MOODLE_COURSE_ID`, it aborts. The course id is read from the page, not assumed from the URL requested.
- HTML goes in through the editor's **source view**: the driver switches the instructor's editor preference to the plain text area, fills the field, and restores the previous preference when the run ends. A document that shows a picture is written through Atto's source view instead, because the file picker is the only way a file gets into this Moodle — see [Pictures](#pictures). Nothing is typed character by character. If the preference cannot be set the run aborts, because filling a rich editor's hidden textarea produces an activity whose body is quietly wrong. The switch happens only when a run is about to write something — an audit never touches the preference, and so can never abort on it. If the restore fails the run still finishes, with a warning naming the value to set back by hand.
- An update opens **the same form on the existing activity** (`/course/modedit.php?update=<module id>`) and fills the name and the content and nothing else. Moodle keeps the module id, the section and the visibility, and the driver reads the course back afterwards: an update form a future Moodle stops honouring fails loudly instead of reporting a document republished while students carry on reading last week's version.
- The activity form is submitted with **save and return to course**, so the run lands back on the course page and reads the new module id from the same page the course check runs against. It waits for the course URL specifically, not for a load to settle: settling can be satisfied by the form page being left, and reading the module id from there would fail a run whose activity had actually been created — the one case that writes the course without writing the manifest.
- Every mutating action is captured **before and after** into a timestamped run directory under `runs/<timestamp>/`. The `after` capture is taken even when the action fails — that is the one worth looking at. An audit mutates nothing and so creates no run directory.
- A capture is a screenshot, **the page's HTML, and the URL**, and `run.txt` names every action with the page it started and ended on and the message of any abort. A screenshot shows what a page looked like; it does not say which page it was, and it cannot be searched for the markup a selector missed. A failed run against the live course is diagnosed from what it left behind, long after the terminal that printed the error has gone.

Playwright's browser binary is installed once:

```bash
npx playwright install chromium
```

### Selectors

The EPF theme sits behind SSO and cannot be inspected from outside, so the selectors in `src/packages/course/lib/selectors.ts` are confirmed — and adjusted — in an attended codegen session against a **scratch** course:

```bash
npx playwright codegen --load-storage ~/.config/epf-moodle-publisher/session.json \
  https://moodle.epf.fr/course/view.php?id=<scratch course id>
```

They deliberately favour core Moodle URLs and stable form ids over theme markup: the page activity is created through `/course/modedit.php`, not by clicking through the activity chooser, which is the part a theme is most likely to reskin.

The **gradebook CSV import** is the least verified of these paths, and it is the one run on the evening of the Orals. It drives Moodle's own three-step import form, and every option it picks — the identity field, each column's mapping, _Ignore_ — is chosen **by value** (`useremail`, `feedback_<id>`, `0`) and never by the label on screen, because this site is in French; a value the form does not offer aborts naming what the select did offer. None of those values has been confirmed against this Moodle yet: walk the form once in codegen before 10 September, and if it has moved, the manual steps below are the fallback and cost typing rather than the sheets.

Adding a section, deleting an activity and deleting a section are the newest and least verified of the rest: they go through `/course/changenumsections.php`, `/course/editsection.php` and `/course/mod.php`, and the confirmation button is matched by a list of the ids core Moodle has used rather than one known id. Each of them therefore **reads the course back afterwards** and aborts if what it asked for did not happen — a delete URL a future Moodle stops honouring fails loudly instead of reporting a clean course that is still full. Confirm them in codegen before the first real wipe; a run of `npm run wipe -- --course <scratch id>` without `--apply` exercises every read involved and deletes nothing.

## Re-running

Re-running is the normal case, not the exceptional one, so it is built to be dull. The plan compares the publishable table against the manifest **and the current content of each document**, and says `create`, `update` or `skip` per document before anything is applied:

```
Plan:
  skip   Assessment Grid — how you are graded
         section: Assessment   source: assessment-grid.md
  update Lecture 1 — Framing and decomposing work for a coding agent
         section: Lectures   source: lectures/lecture-1-framing.md

0 to create, 1 to update, 1 to skip.
```

An `update` **rewrites the existing activity in place**: same course module id, same section, same visibility. It is not a delete and a recreate, because the module id is what student bookmarks, links from elsewhere in the course and completion tracking are hung on. Editing one lecture and re-running therefore touches exactly one activity, and running again immediately afterwards reports zero changes.

**A document whose activity the course no longer holds is planned as a `create`, not an `update`.** The manifest records a module id, and a page deleted in Moodle — by hand, or by a rebuild the publisher was not part of — leaves that id naming nothing. Opening the update form on it gets Moodle's error page, which renders outside any course and so used to fail the course check with the wrong story: it reported the browser as being in course 1. The plan reads the course before it decides, so the record that outlived what it recorded is settled there, where the course is already in hand. The recreated activity sends every picture it shows again, because the files went with the activity that is gone, and the manifest follows it to the new module id. Examiner-only material is the one thing this cannot do quietly: an activity of the same name already standing in the section the table names aborts the run rather than putting a second copy of an answer key in the course.

The driver keeps its own guard for the same page, because an activity can be deleted between the snapshot and the write: Moodle's error page is recognised by `data-rel="fatalerror"` — the attribute, not its French prose — and the abort quotes Moodle's own message and error code.

Visibility is set **only on create**, for everything students see. Revealing a document is a human decision, and a publisher that reasserted visibility every run would quietly undo it the next time a typo was fixed. The update path has no way to express visibility at all.

Created visible is the default, not the rule. An entry may carry a **`revealedOn` date**, and the presence of that date is what makes the document ship **hidden**: it goes to Moodle with everything else and the instructor opens it by hand on the day — see [The C3 brief](#the-c3-brief). Nothing in this program reveals it on that date or any other. The date exists for the audit, which measures the course against it; no code path that writes to the course reads it, and there is **no command-line flag anywhere that changes visibility**.

The one exception is instructor material, which is created hidden and **re-hidden** by any later run that finds it showing — see [Instructor material](#instructor-material). The publisher only ever moves that material towards hidden: the driver call it uses to do so takes no argument and can only conceal, so there is no run, and no later edit above it, that reveals anything.

Moving a document from one section to another is not something the publisher does: the update rewrites the activity where it stands. Editing the table to send a published document elsewhere therefore **aborts**, naming both sections. It is not reported as `skip`: nothing about the document changed, so a verdict decided on content alone would say there was no work to do while the document sat in a section the table no longer names. Delete the activity in Moodle and run again to have it created in its new section.

## Sections

The course page's sections are a fixed list, in the order students read them: **Assessment, Deliverables, Lectures, Labs, Autonomy, Resources**. `Deliverables` is second so that the grid stating the Freeze and the section enforcing it are adjacent; it is also the one section no document may name, because what is in it is decided by the Deliverables the grid defines. A student looking for how they are graded should not have to scroll past every lab brief to find it, so the order is the publisher's, not the order the table happens to be written in.

**Every section the publisher creates is created visible**, including the ones holding an answer key. Hiding is a property of the page, not of the room it stands in — see [Instructor material](#instructor-material).

The order is a guarantee about **the sections the publisher creates**, and it creates a section only when something it is publishing needs one — never an empty one. `Deliverables` is the section nothing needs yet: no run creates it until there is a Devoir to put in it. On a course whose sections it made — an empty course, or one it built before — the page reads Assessment, Deliverables, Lectures, Labs, Autonomy, Resources, in that order as each arrives. A section that was already there keeps its place, so a course with a hand-made `Labs` above where `Assessment` will go keeps that arrangement, and the grid sits below the lab briefs until somebody moves one of them in Moodle. That is the deliberate trade: the publisher will not reorder a course an instructor is arranging, and rearranging it is a drag of two sections rather than an argument with a program.

Each entry names the section its document belongs in. The publisher **takes the section if it is there and adds it if it is not**, so a course that has never been built does not have to be prepared by hand first — an empty course plus `npm run apply` is a working course. Missing sections are added in the order above; a section the instructor made by hand keeps whatever place it already has, because publishing adds sections and never reshuffles the course.

Two sections with the same name is an **abort**, not a choice. Course imports leave repeated names behind (`Section 2` twice over is what the real course had after its import), and publishing into one of them at random would put the document somewhere nobody thought to look, with nothing in the output saying so. Rename or remove the duplicate and run again.

## Configuring the course for the Oral

`setup` is not `publish`. Publishing runs every time a document changes; this runs **once per course** and then does nothing again, which is why it is a command of its own rather than something attempted at the start of every routine run.

```bash
npm run setup             # lists what it would add
npm run setup -- --apply  # adds it
```

It puts two things in the gradebook:

- **The `Bands` scale**, with the five Bands lowest first — `Resit`, `Needs Work`, `Basic`, `Solid`, `Outstanding` — spelled as `CONTEXT.md` spells them. It is made by tooling and not by hand because a CSV of Bands is later matched against these strings character for character, and a scale that differs by a capital letter is an import that silently lands the wrong verdicts.
- **Three grade items**, one per Competency, each **hidden from Students** and each **kept out of the course total** (weight overridden to 0). A visible Grade Item is a provisional Band read the night before the Oral it was meant to be defended at. One that counts is Moodle aggregating three Bands into the /20 the assessment grid refuses, with `Resit` averaged in as though it were a low mark rather than work that was not done.

  Weight 0 asks something of the course first: Moodle puts "Weight adjusted" on the grade item form **only when the course's grade category aggregates naturally**, and a course that arrived from an import on "Simple weighted mean" (as 14707 did) weighs every item by its maximum grade with no way to say zero. `setup` does not change that setting — the aggregation decides what every other grade in the course means, and it is not this command's to reinterpret. It aborts naming the setting, and a run after the aggregation is set to Natural makes the three items.

A second run creates no second scale and no fourth grade item: it reports everything as already in place and stops. What it will not do is quietly correct one somebody made by hand — a grade item that is visible, that counts, that is valued on something other than the Bands, or that shares its name with another **aborts the run with instructions**, leaving the gradebook alone. A tool that silently reconfigured a Grade Item is a tool nobody can be sure has not also silently reconfigured something holding Bands.

The three grade items are recorded in the same manifest as the pages, keyed by Competency (`C1`, `C2`, `C3`) rather than by a source path, because a Grade Item comes from no file.

That record is also how a later run recognises one: **by the id the manifest holds**, and by name only when there is no id to go on. A Grade Item somebody has renamed in the gradebook is still that Competency's, and looked for by the name it was created under it would be invisible — the run would make a fourth beside it.

Two things are read that the gradebook's own table does not show plainly. A **`Hidden until` date** counts as visible: a Band that becomes readable on a day nobody is watching for is the failure this command exists to prevent, arriving late rather than early. And a **standard, site-wide scale** named `Bands` is not adopted as this course's — the scales page lists it beside the course's own, and three Grade Items valued on a scale an administrator can change under them is not something this course can be sure of.

## Putting the Probe Sheets in the gradebook

`npm run probes` writes the file. `npm run import` puts it in the gradebook. Two commands and not one, because the gap between them is where the sheets are read: the CSV is on disk to be looked at before any of it reaches a Student's row, and generating never touches Moodle.

```bash
npm run probes              # writes probe-sheets.csv; changes nothing
npm run import              # reports what would enter the gradebook
npm run import -- --apply   # puts it through Moodle's own import
```

It goes through **Moodle's own gradebook import** (`/grade/import/csv/index.php`) rather than the grading grid: thirty Students times three fields is one form rather than ninety AJAX interactions, and **one import covers C1, C2 and C3** — including C3, the Competency graded live, so that even its field is waiting rather than being made in the middle of a six-minute slot.

**Nothing it sends is a verdict.** The three band columns of the generated file are mapped to _Ignore_, so there is no mapping this program can make that carries a Band into a Grade Item (ADR-0002). What lands is the sheet, in the feedback beside the band cell; the cell itself appears empty, ready for the Instructor to pick from the Bands at the Oral. Nothing reads a filled-in Band back out, either: a verdict entered in Moodle stays there, and re-importing the sheets after a late enrolment leaves the ones already given alone.

Everything it can refuse over is checked before a browser opens — sheets that were never generated, a gradebook `setup` has not configured, a file that is not the one `probes` writes. Three more are checked against the live course before anything is sent: a Grade Item the manifest records and the course no longer holds; one somebody has **revealed**, which would publish what a Student is about to be asked; and an **enrolment the file no longer matches**. That last one is what makes the promise a promise about Students rather than about rows: somebody who enrolled after `probes` ran has no row in the file, and an import of it would report success and leave them with nothing waiting at their Oral. Run `npm run probes` again and import the file it writes — the Bands already entered survive it.

The file is **unchanged on disk** afterwards, byte for byte — it is uploaded as it is, never rewritten — which is what makes the fallback below a fallback rather than a second generation.

### Importing it by hand

Every abort this would answer prints these steps, because the evening they are needed is not an evening for reading a README. Two aborts deliberately do not print them, because importing this file by hand is not what they need: the enrolment has moved since the file was written, and — the only failure found after the sheets have gone in — the file changed on disk during the import. The point of writing them down twice is that a broken selector on 10 September costs typing and not the sheets:

1. Open **Grades → Import → CSV file** in the course (`/grade/import/csv/index.php`).
2. Upload `probe-sheets.csv`, leave the separator on comma, and continue.
3. Identify users by **Email address**, mapped from the file's `email` column — the only identity field this Moodle populates.
4. Map each `Feedback: …` column to the **feedback** of its grade item.
5. Leave every other column on **Ignore**, including the three band columns. They are empty on purpose: the Band is yours to enter at the Oral.
6. Import. Each Student then has a sheet waiting in all three grade items.

## Emptying the course

A course under design gets built more than once, so emptying it is a command rather than an afternoon of clicking:

```bash
npm run wipe -- --course 771            # lists what would go
npm run wipe -- --course 771 --apply    # does it
```

Everything else this tool does is additive; this is the exception, and it is shaped so the exception is hard to trigger by accident:

- **The course id is typed on the command line** and must equal the configured one, or the run aborts having touched nothing. It is deliberately not a yes/no prompt: a prompt gets answered by reflex, whereas a course id has to be looked up and typed, and it is precisely the thing that would be wrong if the wrong course were about to be emptied. A `.env` pointing somewhere unexpected therefore produces a mismatch and an abort, not a wiped course.
- **A Devoir holding Submissions stops the run outright**, before anything at all is deleted — not the Devoir, not the other activities, not the sections, not the manifest. Students' work is the one thing in this course that exists nowhere else in a form the course can read, and Moodle takes every Submission down with the activity. The refusal names each Devoir it refused over and how many Submissions it holds, and **there is no flag, prompt or environment variable that gets past it**: anything overridable is a thing that gets overridden at 23:00 while debugging something else. If the work really is finished with, delete the Devoir by hand in Moodle and the wipe runs. The counts are read through the browser session the run already holds, on the grading page that shows them; a count that cannot be established is the same refusal, because "I could not tell, so I deleted it" is never the outcome.
- **Reporting is the default.** `--apply` is opt-in, as with publishing.
- **Everything that will go is listed first**, by name — every activity and every section — so a leftover that should have been kept is visible before it is gone rather than after.
- **The manifest is cleared last.** A course emptied while the manifest still claims the documents are published would make the next `apply` skip everything and report a full course holding nothing.

"Empty" means Moodle's own **section 0** and nothing else: it cannot be deleted, so it survives with its name (`Objectifs pédagogiques`, in this course) and loses only its activities. Rename it by hand if you want it called something else. Every other section, and every activity anywhere in the course, is deleted.

There is no undo, and deleted Moodle activities do not come back. What there is instead: the `before` and `after` screenshots of every deletion, in `runs/<timestamp>/`.

## What may be published

**One table**, `PUBLISHED` in `src/packages/catalog/lib/table.ts`, reviewed in a diff. An entry names a document's source, the human title it is published under and its section, and may name a `revealedOn` date, which makes it ship hidden for the instructor to open by hand.

Membership is by explicit entry; nothing is discovered by walking a directory. **A document the table does not name is not published** — this program's own documentation, the C3 fixture generator under `script/`, notes nobody meant anyone to read — and a link to one of them is refused rather than published dead. There is no list of things that must never be published, because there is nothing a document has to be taken off.

**Who a document is for is not in the table.** A source path ending in `--instructor.md` is material for examiners, and nothing else says so: the file sits beside the student document it pairs with — `labs/lab-3-oral--instructor.md` next to `labs/lab-3-oral.md`, `c1-assessment-examples--instructor.md` next to `assessment-grid.md` — and everything that follows from the suffix is derived at publish time. See [Instructor material](#instructor-material).

**That question is also what decides a link.** See [Cross-references](#cross-references): the rules are written against who each end of a link is for, not against publishability and not against hiddenness.

### Every entry, every run

**There is no schedule.** Every document the table names is published on every run, and `publish` takes no argument that changes which ones. A document is live the moment its entry is added to the table.

That is the whole of it, and what it gives up is worth stating: nothing now guarantees that material cannot appear before its lecture. A document that must stay out of sight until a known day carries a `revealedOn` date and ships hidden for the instructor to open by hand — see [The C3 brief](#the-c3-brief). Everything else appears as soon as it is written down. Adding an entry is therefore a publishing decision, made in the diff that adds it. See [ADR 0007](https://github.com/xavxyz/epf-coding-agents-management/blob/master/docs/adr/0007-every-entry-publishes-on-every-run.md).

**Being on the page is not being assigned.** A course page students have from day one is not reading anybody is asked to do in advance, which is what [ADR-0006](https://github.com/xavxyz/epf-coding-agents-management/blob/master/docs/adr/0006-nothing-a-lecture-or-a-lab-depends-on-is-assigned-in-advance.md) forbids: what a taught session depends on is met inside that session. The table says what exists; the session says when it is read.

`publish` **aborts on any flag but `--apply`**, rather than ignoring it. `--phase` used to decide how much of the course a run published; a command line or a note that still carries it is refused by name instead of quietly reporting a full publish.

The real table is checked against the repository it names, so a source path that is a typo fails here rather than in front of a class. Every guard over the table fires before the browser is even opened.

## Deliverables

A **Deliverable** is something required from a student by a stated instant. This course has exactly two, and each is defined **once**, in the front matter of `assessment-grid.md` — the one document that already states every Freeze in its prose, one screen below. That is the point of putting them there: the instant students read and the instant Moodle will enforce are checked against each other by eye, in one diff. The alternative shipped `14:00` to the live course while two other files said `20:00`.

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

**No entry says where it goes.** There is one `Deliverables` section, it holds Devoirs and nothing else, and its membership is derived from this front matter ([ADR-0005](https://github.com/xavxyz/epf-coding-agents-management/blob/master/docs/adr/0005-devoirs-live-in-a-section-of-their-own.md)): a section whose contents are decided by what a thing _is_ does not take a field saying where it goes, and a field would invite a fixture to name another one. A published document that names `Deliverables` **aborts the run** — `Deliverables` is a real section, so the check that asks whether a section exists would pass it straight through, and this is the guard beside it that does not.

`id` is **authored, never computed from position**: it is what the published Devoir will be recorded under, so inserting a Deliverable above another one must not rename it. `visible` defaults to true and is the only defaulted field. There is no `link_kind`: both Deliverables are repository URLs, and nothing distinguishes them by link kind.

Which document defines the Deliverables is the catalog's `grid`: one assessment grid, from whose front matter the Oral's probes are read too. The same doctrine as the table above, for the same reason: nothing is discovered by noticing that a document happens to carry front matter, and a grid that defines no Deliverables aborts, naming it, rather than quietly publishing no Devoir.

`publish` reports both Deliverables and states each **Freeze in full** — the weekday, the date, the time, the zone and the instant — so a wrong date is caught by reading the plan rather than by a student at a deadline. The section is stated once, in the heading over them, rather than repeated down a column: it is the same constant for every Devoir, and what is worth checking against the timetable on that page is the Freeze.

Everything that can go wrong here **aborts, before the course is opened, naming the Deliverable**:

| The mistake | What happens |
| --- | --- |
| Two Deliverables share an `id` | Refuses, naming both by title and by the document they are written in |
| `due` has no offset, or an offset that is not `Europe/Paris`'s on that day | Refuses, saying which offset Paris was on |
| `due` cannot be read, or is absent | Refuses. Nothing is defaulted |
| A competency the course does not have | Refuses, naming it and the Deliverable |
| `visible` written as anything but `true` or `false` | Refuses. `visible: fasle` must not read as "visible" — `c3-1` is the one that ships hidden |
| A published document naming the `Deliverables` section | Refuses, naming the document. Nothing but a Deliverable lands there |

The front matter is read by the publisher and never published: the page a student reads starts at the first heading.

## Cross-references

A link from one document of this repository to another takes a student to that document **in Moodle**, and a link that would strand them **stops the run**.

A relative link ending in `.md` is resolved against the linking document's directory and rewritten to the target's Moodle URL, looked up in the manifest. **In-page anchors and absolute URLs are left exactly as written** — so an in-page `#section` link and Lecture 1's links out to aihero.dev both keep working — and so is a relative path that merely appears in a code span, because the rewrite is done to the rendered HTML, where a link is unambiguously an `href` attribute.

**A link that only spells its own path is published under the target's title.** Most cross-references in this repository are written ``[`../resources/model-effort-and-cost.md`](../resources/model-effort-and-cost.md)``, which publishes a working link labelled with a repository path a reader cannot act on — and labelled differently from the title the same document was published under. So when a link's text _is_ its own path, the text is replaced by the target's title from the table, and a code span wrapping that text goes with it, because a title is prose and not code. A link whose text is prose is published byte-for-byte as written: `[AI Coding Dictionary](…)` is already the target style, and so is a sentence that happens to end in a path. A code span in ordinary prose — which the lectures write constantly, often right beside the link itself — is still untouched; only a code span forming a link's whole text is replaced.

The title comes from the same table entry that decides whether the link may be published at all, never from the filename or from a heading in the target, so a retitled entry and a relinked page cannot disagree. It is folded into the document's content hash for the same reason the bytes of a picture are: rename an entry in the table and every page linking to it reads differently, which nothing in the linking document's markdown would show.

What a link is allowed to mean turns on **who each end of it is for**, not on publishability and not on hiddenness:

| Link from | Link to | Verdict |
| --- | --- | --- |
| student-facing | instructor material | **hard error** |
| instructor material | anything published, either kind | rewritten |
| anything | a document the table does not name | **hard error** |
| anything | a published document that is hidden | rewritten, with a **warning** |

Who it is for rather than whether it is hidden, because the C3 brief is the counterexample already in the table: it ships hidden and is student-facing all the same. A rule written about hidden documents would refuse the lecture that points at the brief and allow a brief that points at the answer key.

**The hidden-link warning fires in bulk by construction.** Every instructor activity is hidden, so every link between two of them warns. A run of this repository produces five at once, and they are reported as one count and one explanation over a list of links, rather than the same paragraph five times over.

**Every refusal happens while the plan is being built**, before anything is written to the course — so `npm run plan`, which applies nothing, is a complete link check.

**Some links can only be resolved after the pages exist.** A document and the document it links to can both be new — the second lecture and the C3 brief it points at, Lab 1 and the reading it sends students to — and a link becomes a URL only once Moodle has given its target a module id. The run therefore comes back at the end for the pages whose links it could not answer the first time, and says `relinked` when it does. Both passes go through the one rewrite, so a link's text does not depend on which of them answered it. The manifest is not rewritten for it: the content hash covers the repository paths a document links to and what the table calls them, not the ids they resolved to.

Two links in the repository came due with this: `c2-assessment-examples--instructor.md` pointed at the publisher's own `src/packages/README.md`, and both lectures pointed at `assets/crash-course/README.md`. Neither target is in the table, so nothing publishes them; each link was dropped and the sentence around it kept, exactly as `labs/lab-3-oral.md`'s pointer at the oral script is.

`PUBLISHER_CATALOG` can point the tests at a fixture table, and `PUBLISHER_NOW` can move the date the audit's reveal gate is measured against. Both are honoured **only when `PUBLISHER_DRIVER=fake`**: the table and the date used against a real course are always the ones in code and on the clock, whatever the environment says. A fixture catalog decides what a fixture repository publishes; it has no say over which of those documents are instructor material, because that is the filename's to say.

## Instructor material

Examiners need the banding anchors and the oral script on the day, in the same place they already go for the course. So they are published, by the same command as everything else, **hidden, into the section the student document they pair with sits in** — the anchors in `Assessment` beside the grid, the oral protocol in `Labs` beside the brief, the worked solution in `Autonomy` beside the exercise.

**The filename decides, and nothing else does.** A source path ending in `--instructor.md` is instructor material. From that one fact the publisher derives the whole of the treatment: the page is created hidden, it is re-hidden by any later run that finds it showing, its title is published under an `Instructor — ` prefix, and no student-facing document may link to it. Renaming a file is therefore the whole of the change — add the suffix and the same entry publishes hidden, drop it and the same entry publishes visible.

There is deliberately **no guard against listing an instructor document without its suffix**. It would publish visible, and the thing that would have to be checked against is the filename, which is the statement itself; a second place saying who a document is for is a second place to disagree with the first.

**What the guarantee is.** Moodle's role system, not obscurity. A hidden activity is refused to anyone without the capability to view hidden material; a student enrolled as a student does not have it, and a direct URL is refused too. Teachers and non-editing teachers do have it, which is the point — a co-examiner is already a teacher on the course.

**What it is not.** It is not encryption, and it is not a promise about anyone who is more than a student. A course-level role override, a student who is also a teacher on the course, or anyone with site-level rights can read every word of it. The seeded C3 bug's real protection remains the **private GitHub repository** until 8 September; hiding the page is what keeps it off the course page, not what makes it secret.

**Why the page and not a section.** Hiding a section is one click, covers everything in it, and one click the other way — made in a hurry on 8 September while a brief is being revealed — uncovers all of it at once and says nothing afterwards ([ADR-0004](https://github.com/xavxyz/epf-coding-agents-management/blob/master/docs/adr/0004-instructor-material-is-hidden-per-page.md)). So visibility is a property of the page. Every section the publisher creates is created visible, and no run hides a section.

Four things make the per-page lock enforceable rather than merely intended:

1. **Created hidden, in one submission.** There is no moment between an instructor page being created and being hidden: the activity form carries the visibility, so the page is never on the course page showing.
2. **Hidden, never stealthed.** "Available but not shown on the course page" leaves a URL that still works for anyone who has one. The publisher never sets stealth mode, and the audit **fails** if it finds instructor material stealthed.
3. **Self-healing, one way only.** A run that finds an instructor page visible **re-hides it and says so** in the output, so an accidental reveal is corrected at the next publish rather than persisting until a student finds it. The plan reports the `hide` before anything is applied, and a dry run performs none of it. The driver call it uses takes **no boolean**, so the publisher has no operation that reveals.
4. **Every visibility write is read back.** Creating an activity hidden and re-hiding one are each confirmed against the course page afterwards, and a write that quietly did nothing **aborts** with an instruction to hide it by hand. So does a write whose result cannot be read back at all: an activity the course page no longer lists is a question the run could not get an answer to, and "I cannot find the answer key" is not reported as "the answer key is hidden".

Instructor material is published from the first run, wherever it sits — including the oral protocol, beside the student-facing brief it is the examiner's half of. What keeps it from students is the hiding and the re-hiding, and nothing about _when_ a document is published has any say over it.

**Titles carry the prefix, derived rather than typed.** An examiner reads `Instructor — C3 worked solution`; the table entry says `C3 worked solution`. The prefix is what a section name used to say and nothing else now does, so it is derived from the suffix at publish time — there is no entry that can carry the prefix without the hiding, or the hiding without the prefix. Nothing in the publisher _recognises_ instructor material by its title: the audit finds these documents by module id, which is the only thing that still identifies an activity somebody has retitled by hand.

**Seeing it hold.** The test suite proves the mechanism; the guarantee is confirmed by hand, once, on the real course: publish, then use Moodle's **Switch role to… Student** and check that no instructor page, and no direct URL to one, is reachable. A guard never seen to fire is not a guard, and this is the guard that matters most.

## The manifest

`moodle-manifest.json` maps repository-relative source path to Moodle course module id, section, content hash and timestamps. It is committed — empty until the first real run, so the path is pinned and every publish shows up as a diff against it — so publishing from a second machine updates the existing activities rather than duplicating them, and a code review shows what publishing did. It is written as each item succeeds, not at the end of a run: an interrupted run leaves an accurate record, and recovery is running the same command again — what already succeeded is skipped and the rest completes.

Each picture published with a document is recorded too — its repository path, the URL the course served it at, and what the file hashes to — so a picture nobody can see is something the manifest can be asked about afterwards, and a picture that has not been redrawn is something a later run can leave where it is. A document that shows none records no such field at all, rather than an empty list, so its entry is byte-for-byte what it always was.

An update keeps the module id, the section and the first publication date, and refreshes the content hash and `updatedAt`. The hash answers "has this changed?" for what a reader reads — the markdown and the pictures it shows — so a run that changes nothing in the repository reports nothing to do.

**A retitle is the one change the hash cannot see.** Titles come from the table, not from the file, so renaming an entry leaves the hash identical. The plan compares the table's title against the name the activity carries in the course and plans an `update` when they differ; the activity is renamed where it stands, keeping its module id and its history. Without that, a title could only ever be corrected by deleting the activity and making it again.

**What the manifest records for a new activity is the module id that appeared**, never the one whose name matches. Two activities are allowed to share a name — a copy left behind in the section a document has just been moved out of is exactly that case — and the course page lists the older one first. Creating a page therefore reads the course before it writes and takes the id that was not there a moment ago, aborting if none appeared or more than one did. Matching by name recorded the older copy instead, which pointed the manifest at an activity the run had not created, and made the read-back that proves a page was created hidden prove it of the wrong page. It is the same reasoning as the section-add check, for the same reason.

## Pictures

A lecture that shows a diagram is not published until the diagram is. Nothing in this repository is a URL Moodle serves, so **every picture a document shows is uploaded with the page that shows it** — into that activity's own file area, and nowhere central.

That is a decision as much as a mechanism: a student who can open the page can fetch the picture, and one who cannot, cannot. The diagram in a hidden instructor page is exactly as hidden as the page. The cost is that two documents showing one diagram hold two copies of it, which is the right way round — the lab does not break the day the lecture is deleted.

The body Moodle stores says `@@PLUGINFILE@@/<name>`, which Moodle rewrites to a real URL every time the activity is rendered. The reference therefore **survives the activity being updated**, and being backed up and restored elsewhere. The publisher then reads the rendered page back and records the URL the course actually served each picture at, in the manifest: evidence rather than a prediction, and a reference Moodle did not resolve aborts the run instead of leaving a broken icon to be found in the lecture theatre.

A picture is stored under its repository path, flattened, because two pictures in one document may share a file name and uploading both under it would leave one file in the activity with both references showing the same drawing.

**A document naming a picture this repository does not hold aborts the run**, before anything is written to the course, naming the document and the path. A reference that climbs out of the repository is the same case. A student should never meet a broken image icon.

**A picture is uploaded once and then left alone.** Every picture carries its own content hash in the manifest, beside the URL, so a run compares each file on disk against the copy the course holds and sends only what differs: a typo fixed in Lecture 1 rewrites its text and moves none of its five megabytes. The plan says how many pictures a run would upload — per document, and as a total — **before it uploads any of them**, because that number is how long the run takes. An interrupted run leaves no record of the document it was in the middle of, so running the same command again sends that document's pictures again and nothing else. A document whose recorded pictures do not cover the ones it shows — an entry written before pictures were uploaded at all is the case that matters, and the committed manifest holds one — is republished rather than skipped: its hash says the text has not changed, which says nothing about whether the course ever received the drawings.

Uploading needs the editor's file picker, which only the rich editor has, so a document with a picture to send is written through **Atto** and everything else — including a document whose twenty-eight pictures are all already in the course — goes on being written through the plain textarea. The preference therefore moves within a run as well as at its ends; what is restored at the end is what the instructor had. The body is written as HTML source either way.

The activity form carries **two** rich editors — one for the Description, one for the body — with a toolbar and a draft file area each, and the Description's comes first on the page. A picture uploaded through the wrong one lands where the body's references cannot reach it, and the page publishes as broken icons; so every control the upload touches is looked for inside the body's editor, and among the dialogues actually on screen. Atto builds those dialogues after the click that asks for them, so each is waited for rather than asked about once.

The body is a second trap of the same kind: under Atto it goes in through a source view that is **CodeMirror's**, not the form's textarea, which stays hidden however the toolbar is clicked. The publisher writes the source, toggles back to the rich view — the toggle is what syncs it — and then reads the form field back and compares it to what was rendered, because everything in between belongs to Atto.

`npm run check:upload` is what says all of that still holds. It drives the driver's own upload code against a real activity form on the live course, asks Moodle which files the body's draft area ended up with, and abandons the form — nothing is submitted and the course is untouched. `COUNT=28 npm run check:upload` is Lecture 1's worth of pictures.

[docs/uploading-images.md](docs/uploading-images.md) is the rest of it: why the file lives where it does, the selectors Atto takes, and the checklist behind them. Expect the _first_ publish of a document with many pictures to be slow: `lectures/lecture-1-framing.md` shows 28, and each is a dialogue and an upload — about three minutes. The second is not, because none of them goes up again.

## The C3 brief

`autonomy/autonomy-2-c3-exercise-brief.md` is published with the day-one set, into its own **Autonomy** section, and **created hidden**. On 8 September the instructor reveals it with one click at the start of the autonomy slot — rather than running a publishing job in the middle of a lab, which is the thing this arrangement exists to avoid. The whole exercise depends on students meeting the seeded bug for the first time in that slot.

**Hidden means Moodle's hidden state**, never "available but not shown on the course page". A stealthed activity is missing from the page and its URL still works for whoever has one, so a student who guesses it is in; the audit fails on stealth as it does on visible.

**The tool cannot take the reveal back.** The brief's policy is `manual`, which is the same policy as every other student-facing document: visibility is chosen on create and never written again. The interface is what enforces it rather than discipline —

- creating an activity accepts an initial visibility, and that is the only place one is chosen;
- updating an activity has **no parameter capable of expressing visibility** at all;
- the one post-create visibility operation is the `hide` that guards [instructor material](#instructor-material). It takes **no boolean**, so it can only conceal, and it is reachable only for documents whose policy is `enforced-hidden` — which the brief's is not.

So no run reveals the brief, and no run re-hides it once a human has revealed it. Re-running the publisher on 8 September, or every day after, leaves it visible. A run that re-hides a revealed instructor page in the same course leaves the revealed brief alone: the two policies are separate fields on separate documents, and a test asserts exactly that.

**And no flag.** There is no `--reveal`, no `--visible` and no environment variable that changes visibility — `publish` takes `--apply` and nothing else, and anything further is refused by name — so there is nothing to fire by accident under time pressure.

**The audit's date gate.** Before 8 September, a brief found visible or stealthed **fails** the audit. On and after, the audit **reports what it saw and passes** — the reveal was always going to happen and the tool has no business fighting the instructor over it. It still says something either way: that the brief is now visible, as intended, or that it is still hidden and nothing but a human will open it. `PUBLISHER_NOW` moves the reference date.

## The audit

`npm run audit` runs standalone, reads the course and writes nothing — not to the course, and not to the instructor's account either. It asserts:

1. Everything the manifest claims is published is actually present in the course, in the section the manifest records. The section the audit compares is whatever the course calls it, including a name the publisher has never heard of: an activity dragged elsewhere is reported, not assumed to be where it was put.
2. Every instructor document is present, hidden and not stealthed — read back **by module id**, which is what survives the activity being renamed or dragged. Where it sits is named in the message and is not a failure: the section is not what keeps students out of it.
3. No instructor material is anywhere a student can reach — matched on activity **title** and on **body content**, so a hand-made copy survives being renamed, against every activity but the instructor pages themselves.
4. Every document with a `revealedOn` date is present, hidden and not stealthed — **until that date**. On and after it, the same reading is **reported and not a finding**: see [The C3 brief](#the-c3-brief).
5. Every Deliverable the front matter defines has a Devoir in the course, and that Devoir's **due date and cut-off date are the Freeze**, to the instant, and it collects **online text with file upload off**. A Devoir that is gone, a date somebody moved in Moodle, a cut-off switched off, a file upload switched back on — none of them shows on the course page, and all of them are otherwise found out by a student at the Freeze. Both instants are named in the message, so the fix — republish, or correct the front matter — is a decision the report is enough to make. The manifest is then read the other way round: a Devoir published for a Deliverable the front matter has since dropped is still on the course page collecting Submissions nothing grades, and no run of publish removes it, so the message sends you to Moodle rather than to `publish --apply`.
6. Each Devoir's **visibility is stated, never judged**: the C3 Devoir is created hidden and revealed by hand, exactly like the C3 brief, so the audit ends the 11 September checklist by saying what is open and what is not. A Devoir taken off the page that was published visible is said too, because nobody can hand in while it is off, and a **stealthed** Devoir is said as neither — it claims to be visible and is not on the page, which is the one state a reading of `visible` alone would report as revealed.

The dates are read by opening each published Devoir's own settings form, one page load per Devoir, and never submitting it. That is the only place they exist: the course page says what an activity is called and who can see it, and nothing about what it collects.

Every finding names the activity, its module id and the section it is in, so a finding can be fixed without hunting for it.

`PUBLISHER_NOW` overrides the date the fourth assertion is measured against, so both sides of the gate can be tested on any day. It is honoured **only when `PUBLISHER_DRIVER=fake`**, exactly like `PUBLISHER_CATALOG`: it writes nothing, but a stale value in an `.env` would turn a brief opened a week early into "Audit passed", and the guard that matters most is not where to accept that. A fake-driver run that uses it says so above its verdict, and a value that is not a date **aborts** rather than falling back to the clock.

### Seeing the guards fire

A guard never seen to fire is not a guard, so each is exercised:

- A student-facing document linking to instructor material makes the **publisher refuse to start**, naming both ends (`src/tests/cross-references.test.ts`), in markdown and in raw HTML, in either quote style. The startup guard is deliberately in front of everything else, so the signpost never reaches the course for the audit to find.
- Revealing an instructor activity in the fake course makes the next run **re-hide it and report it**, and only it (`src/tests/instructors.test.ts`); revealing a student-facing document proves the opposite rule still holds, and it stays revealed.
- Stealthing an instructor activity, or pasting its text into a lecture under an innocuous title, each make the **audit fail** (`src/tests/audit.test.ts`). That second one is the leak the audit exists to catch: a copy from an earlier manual upload, which no startup check can see.
- Renaming a document to add or drop the `--instructor` suffix, with no other edit, changes whether it publishes hidden and under the prefix (`src/tests/catalog.test.ts`).
- Moving a Devoir's cut-off, switching its cut-off off, switching file upload back on and deleting the activity outright each make the **audit fail** over a fake course that was published correctly and then edited by hand (`src/tests/devoir-audit.test.ts`). The same file asserts that a failing audit still leaves the course file and the manifest byte-for-byte as it found them — the property that makes it safe to run in the hour before a Freeze, which is the hour it exists for. Dropping a Deliverable from the front matter while its Devoir stays in the course fails it too, and stealthing the C3 Devoir is reported as off the page rather than as revealed.

## Development

```bash
npm run check     # typecheck + module boundaries + tests
```

Tests drive the command-line interface against the fake driver, with the repository root pointed at a temporary directory of fixture documents. Nothing below the driver seam is unit tested: the browser selectors are verified by the attended run, not by the suite. No test reads a real course's files.

The command line under test is the **packaged** publisher, not this checkout's sources: the suite's global setup (`src/tests/packaged.ts`) runs `npm pack`, installs the tarball into a scratch course repository, and the harness starts its `moodle-publisher` binary. What a course repository installs is therefore what the suite runs. For one file:

```bash
node --test --test-global-setup=src/tests/packaged.ts src/tests/publish.test.ts
```

There is no CI workflow, and none may touch Moodle: the browser driver refuses to run when `CI` is set (`src/tests/never-in-ci.test.ts`).

Packages under `src/packages/` are deep modules — see [src/packages/README.md](./src/packages/README.md).
