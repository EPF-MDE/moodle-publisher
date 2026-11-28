# Re-running, sections and the manifest

What a repeated run does to the course and records about it. Part of the [Moodle publisher README](../README.md).

## Re-running

Re-running is the normal case, not the exceptional one, so it is built to be dull. Every Published Document is a PDF in a Moodle file resource ([ADR-0013](./adr/0013-the-course-is-published-as-pdfs.md)). The plan compares the publishable table against the manifest, the course **and the current content of each document**, and says, per PDF, `create`, `replace` or `skip` before anything is applied:

```
Plan:
  skip        Assessment Grid — how you are graded
              section: Assessment   source: assessment-grid.md
  replace     Lecture 1 — Framing and decomposing work for a coding agent
              section: Lectures   source: lectures/lecture-1-framing.md   pdf: lecture-1-framing.pdf

0 PDFs to create, 1 to replace, 1 to skip, 0 to hide.
```

A document has changed when the hash of its markdown and the pictures it shows differs from the one in its manifest entry. The rendered PDF never decides this, because a render is free to vary. A picture redrawn on its own is a change to every document that shows it, and to no other. An unchanged document uploads nothing.

A `replace` **swaps the file inside the existing file resource**: same course module id, same place in its section, same visibility. It is not a delete and a recreate, because the module id is what student bookmarks, Moodle's logs and completion tracking are hung on. Editing one lecture and re-running therefore touches exactly one PDF, and running again immediately afterwards reports zero changes.

**Retitling an entry in the table is a `replace` too.** The title is not in the hash, but it is in the manifest entry and it is printed at the top of the PDF, so a document whose published title — `Instructor — ` prefix included — differs from the one recorded is replaced even when its markdown is unchanged. The replace sets the resource's name to the new title and reprints the PDF under it; the module id, the section, the visibility and the PDF's file name stay as they were. The plan line says which title it had, before anything is applied:

```
  replace     Lecture 1 — Framing and decomposing
              section: Lectures   source: lectures/lecture-1-framing.md   pdf: lecture-1-framing.pdf   retitled from "Lecture 1 — Framing"
```

**A document whose activity the course no longer holds is planned as a `create`, not a `replace`.** The manifest records a module id, and a PDF deleted in Moodle — by hand, or by a rebuild the publisher was not part of — leaves that id naming nothing. The plan reads the course before it decides, so the record that outlived what it recorded is settled there, where the course is already in hand. The recreated PDF is uploaded afresh, and the manifest follows the document to its new module id. Examiner-only material is the one thing this cannot do quietly: an activity of the same name already standing in the section the table names aborts the run rather than putting a second copy of an answer key in the course.

The driver keeps its own guard for an activity deleted between the snapshot and a write: Moodle's error page is recognised by `data-rel="fatalerror"` — the attribute, not its French prose — and the abort quotes Moodle's own message and error code.

Visibility is set **only on create**, for everything students see. Revealing a document is a human decision, and a publisher that reasserted visibility every run would quietly undo it the next time a typo was fixed. The replace path has no way to express visibility at all: a PDF created hidden stays hidden, and one the Instructor opened by hand stays open.

Created visible is the default, not the rule. An entry may carry a **`revealedOn` date**, and the presence of that date is what makes the document ship **hidden**: it goes to Moodle with everything else and the instructor opens it by hand on the day — see [A document with a reveal date](#a-document-with-a-reveal-date). Nothing in this program reveals it on that date or any other. The date is what a [review of the course](./what-may-be-published.md#reviewing-the-course) measures it against; no code path that writes to the course reads it, and there is **no command-line flag anywhere that changes visibility**.

The one exception is instructor material, which is created hidden and **re-hidden** by any later run that finds it showing — see [Instructor material](./what-may-be-published.md#instructor-material). The publisher only ever moves that material towards hidden: the driver call it uses to do so takes no argument and can only conceal, so there is no run, and no later edit above it, that reveals anything.

Moving a document from one section to another is not something the publisher does: a replace swaps the file where the PDF stands. Editing the table to send a published document elsewhere therefore **aborts**, naming both sections. It is not reported as `skip`: nothing about the document changed, so a verdict decided on content alone would say there was no work to do while the document sat in a section the table no longer names. Delete the activity in Moodle and run again to have it created in its new section.

## Sections

The course page's sections are a fixed list, in the order students read them: **Assessment, Deliverables, Lectures, Labs, Autonomy, Resources**. `Deliverables` is second so that the Assessment Grid stating each Freeze and the section enforcing it are adjacent; it is also the one section no document may name, because what is in it is decided by the Deliverables the Grid Source defines. A student looking for how they are graded should not have to scroll past every lab brief to find it, so the order is the publisher's, not the order the table happens to be written in.

**Every section the publisher creates is created visible**, including the ones holding an answer key. Hiding is a property of the activity, not of the room it stands in — see [Instructor material](./what-may-be-published.md#instructor-material).

The order is a guarantee about **the sections the publisher creates**, and it creates a section only when something it is publishing needs one — never an empty one. `Deliverables` is the section nothing needs yet: no run creates it until there is a Devoir to put in it. On a course whose sections it made — an empty course, or one it built before — the page reads Assessment, Deliverables, Lectures, Labs, Autonomy, Resources, in that order as each arrives. A section that was already there keeps its place, so a course with a hand-made `Labs` above where `Assessment` will go keeps that arrangement, and the grid sits below the lab briefs until somebody moves one of them in Moodle. That is the deliberate trade: the publisher will not reorder a course an instructor is arranging, and rearranging it is a drag of two sections rather than an argument with a program.

Each entry names the section its document belongs in. The publisher **takes the section if it is there and adds it if it is not**, so a course that has never been built does not have to be prepared by hand first — an empty course plus `npm run apply` is a working course. Missing sections are added in the order above; a section the instructor made by hand keeps whatever place it already has, because publishing adds sections and never reshuffles the course.

Two sections with the same name is an **abort**, not a choice. Course imports leave repeated names behind (`Section 2` twice over is what the 2026 course had after its import), and publishing into one of them at random would put the document somewhere nobody thought to look, with nothing in the output saying so. Rename or remove the duplicate and run again.

## The manifest

`moodle-manifest.json` maps repository-relative source path to Moodle course module id, section, content hash and timestamps. It is committed — empty until the first real run, so the path is pinned and every publish shows up as a diff against it — so publishing from a second machine updates the existing activities rather than duplicating them, and a code review shows what publishing did. It is written as each item succeeds, not at the end of a run: an interrupted run leaves an accurate record, and recovery is running the same command again — what already succeeded is skipped and the rest completes.

The hash answers "has this changed?" for what a reader reads — the markdown and the pictures it shows — and never covers the PDF's bytes, which a render is free to vary. Entries an earlier publisher wrote for Moodle pages are still read, as pages, and skipped.

A replace keeps the module id, the section and the first publication date, and refreshes the title, the content hash and `updatedAt`. The hash answers "has this changed?" for what a reader reads — the markdown and the pictures it shows — so a run that changes nothing in the repository reports nothing to do.

**A retitle is the one change the hash cannot see**, so the plan compares the title too. Titles come from the table, not from the file, so renaming an entry leaves the hash identical; the recorded title differing is what makes the run replace the PDF and rename it. See [Re-running](#re-running).

**What the manifest records for a new activity is the module id that appeared**, never the one whose name matches. Two activities are allowed to share a name — a copy left behind in the section a document has just been moved out of is exactly that case — and the course page lists the older one first. Creating a PDF therefore reads the course before it writes and takes the id that was not there a moment ago, aborting if none appeared or more than one did. Matching by name recorded the older copy instead, which pointed the manifest at an activity the run had not created, and made the read-back that proves an activity was created hidden prove it of the wrong one. It is the same reasoning as the section-add check, for the same reason.

## Pictures

A lecture that shows a diagram is not published until the diagram is. Nothing in a course repository is a URL Moodle serves, so **every picture a document shows is embedded in the HTML its PDF is printed from**: the PDF carries the drawing, and a printed or offline copy is never missing one. A diagram shown by two documents is inside both PDFs.

**A document naming a picture the course repository does not hold aborts the run**, before anything is written to the course, naming the document and the path. A reference that climbs out of the repository is the same case. A student should never meet a broken image icon.

A picture hosted elsewhere — an `https://` URL — is left where it is. The bytes of every picture a document embeds are part of the content hash the manifest records.

## A document with a reveal date

What a `revealedOn` date is for. A document that carries one is published with everything else, into the section its entry names, and **created hidden**. The instructor reveals it with one click on the day — rather than running a publishing job in the middle of a lab, which is the thing this arrangement exists to avoid.

_In the 2026 course: `autonomy/autonomy-2-c3-exercise-brief.md` carries `revealedOn: 2026-09-08`, is published into **Autonomy**, and is revealed at the start of the autonomy slot on 8 September, because the exercise depends on students meeting the seeded bug for the first time in that slot._

**Hidden means Moodle's hidden state**, never "available but not shown on the course page". A stealthed activity is missing from the page and its URL still works for whoever has one, so a student who guesses it is in; a [review of the course](./what-may-be-published.md#reviewing-the-course) treats stealth before the reveal date as a leak, as it does visible.

**The tool cannot take the reveal back.** Such a document's policy is `manual`, the same policy as every other student-facing document: visibility is chosen on create and never written again. The interface is what enforces it rather than discipline —

- creating an activity accepts an initial visibility, and that is the only place one is chosen;
- updating an activity has **no parameter capable of expressing visibility** at all;
- the one post-create visibility operation is the `hide` that guards [instructor material](./what-may-be-published.md#instructor-material). It takes **no boolean**, so it can only conceal, and it is reachable only for documents whose policy is `enforced-hidden`, which a document with a reveal date does not have.

So no run reveals such a document, and no run re-hides it once a human has revealed it. Re-running the publisher on its reveal date, or every day after, leaves it visible. A run that re-hides a revealed instructor PDF in the same course leaves it alone: the two policies are separate fields on separate documents, and a test asserts exactly that.

**And no flag.** There is no `--reveal`, no `--visible` and no environment variable that changes visibility — `publish` takes `--apply` and nothing else, and anything further is refused by name — so there is nothing to fire by accident under time pressure.
