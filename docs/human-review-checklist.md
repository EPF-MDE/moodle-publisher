# Reviewing the course by eye

The publisher writes the course; it does not check it afterwards. What a human did by hand in Moodle — a page of Instructor Material revealed, a Freeze moved, file upload switched back on, a Devoir deleted — shows up nowhere in a run's output. This checklist is how it is found: read the live course against the course repository, by eye, and fix what disagrees.

It replaces the retired `audit` command ([ADR-0012](./adr/0012-the-course-is-reviewed-by-eye.md)). Nothing here writes to the course, so it is safe to go through at any time. The times it matters most are after a publish, before a document's reveal date, and in the hour before each Freeze.

## What to have open

- The course in Moodle, signed in as the Instructor, with editing on so hidden and stealthed activities are marked.
- The course repository's `publisher.json`: every Published Document, its title, its Section and any `revealedOn` date.
- The front matter of the assessment grid `publisher.json` names: every Deliverable, its title, its `due` (the Freeze) and whether it is `visible`.
- `moodle-manifest.json`: the module id each document and each Devoir was published as. A module id is in the activity's URL (`…?id=<module id>`), and it stays the same when somebody renames or moves the activity.

## The checklist

### Published Documents

- [ ] **Every Published Document is present in its Section.** For each entry in `publisher.json`, the course has an activity with the entry's title in the Section the entry names. A document that is missing, or that somebody dragged into another Section, is a finding. A document missing from the course comes back with `publish --apply`. A document in the wrong Section has to be moved back by hand, because the publisher never moves an activity.

### Instructor Material

Instructor Material is every entry whose source ends in `--instructor.md`. Its title in the course starts with `Instructor — `.

- [ ] **Every Instructor Material item is hidden and not stealthed.** Moodle marks each one **Hidden from students**. It must not be shown, and it must not be **Available but not shown on course page**: a stealthed activity is off the course page, but its URL still works for anyone who has it. A visible or stealthed item is re-hidden by the next `publish --apply`: the publisher uses Moodle's own hide action, which also takes an activity out of stealth.

### Documents with a reveal date

- [ ] **Any document with a reveal date is still hidden before that date.** For each entry with `revealedOn`: before that day, Moodle marks it **Hidden from students**, and not stealthed. Found visible or stealthed early, it is a leak: hide it by hand. From that day on, either state is fine. The Instructor opens it by hand, and no run of the publisher reveals it or hides it again.

### Devoirs

Every Devoir is in the `Deliverables` Section. Open each one's **Settings** to check it, and leave without saving.

- [ ] **Every Devoir is present, closes at the Freeze its front matter states, and collects online text and no file.** For each Deliverable in the grid's front matter:
  - the course has its Devoir, under the Deliverable's title, at the module id the manifest records;
  - **Due date** and **Cut-off date** are both enabled, and both are the Deliverable's `due`, to the minute, read in `Europe/Paris`;
  - under **Submission types**, **Online text** is ticked and **File submissions** is not.

  A date somebody moved, a cut-off switched off or file submissions switched back on has to be put right **by hand**, in the Devoir's settings. `publish --apply` skips a Devoir whose Deliverable has not changed in the repository, so it does not see the edit. A Devoir that is gone is created again by `publish --apply`. The Submissions it held are not coming back, so find out why it went.

  Whether a Devoir is shown is not checked here. A Deliverable with `visible: false` is created hidden and revealed by hand. Just note which Devoirs are open, and make sure the Devoir students must hand in to is not hidden or stealthed.

- [ ] **The course holds no Devoir that the front matter no longer defines.** Every Devoir in `Deliverables` matches a Deliverable in the front matter. The manifest can list one under `deliverable:<id>` for a Deliverable that has since been dropped. That Devoir still collects Submissions that nothing grades, and no run of the publisher removes it. Delete it in Moodle, or put the Deliverable back in the front matter.

### As a Student

- [ ] **Switch role to… Student** and look at the course page. No `Instructor — ` activity is listed. Opening a direct URL to one is refused. Documents with a future reveal date aren't listed either.
