---
# A template, shipped with the publisher, for a course repository to copy and
# adapt by hand. Copy it to the path `publisher.json` names as its `grid`, then
# replace everything written <like this>, below and in the prose. Once copied,
# it is the course's own. Everything else a Student reads in the Assessment Grid
# is the Grid Frame, `docs/grid-frame.md`, which the publisher prints around the
# Competency blocks below (ADR-0014).
#
# The Competencies this course is assessed on, one title per line. Each one's
# id is its place in this block — C1, C2, … — so a Competency is only ever
# added at the end: reordering the block renumbers them. Each block below is
# headed by its id alone: the publisher writes the title beside it.
competencies:
  - <Competency title>
  - <Competency title>

# The Deliverables, defined once. The publisher reads this block.
#
# Ids are written down, never computed from position: renaming one makes a new
# Devoir. Each `due` is a Freeze, written in Europe/Paris time with the offset
# Paris is on that day (+01:00 in winter, +02:00 in summer). `visible: false`
# ships the Devoir hidden, to be revealed by hand; leave it out otherwise.
deliverables:
  - id: <deliverable-id>
    title: <Deliverable title>
    competencies: [C1, C2]
    due: 2026-12-11T18:00:00+01:00
---

## C1

> _Fiche statement: "\<the Competency as the fiche states it>"_

\<What this Competency asks of a Student, in two or three sentences: the discipline it is about, and what demonstrating it looks like.>

**Subject:** \<what the Student works on to demonstrate it, and where that work is handed in.>

**Expected evidence**

- \<A concrete artifact the work leaves behind.>
- \<Another one.>

| Band | What it looks like |
| --- | --- |
| **Resit** | \<The work was not done: which artifact does not exist.> |
| **Needs Work** | \<The work exists, and the Competency is not demonstrated: the usual way it falls short.> |
| **Basic** | \<The thing is done, mechanically: what exists and can be shown.> |
| **Solid** | \<The thing is done, and justified: what the Student can say about why. This row is what the work is read against.> |
| **Outstanding** | All of Solid, plus \<knowing the limits: where the approach stops holding, and why.> |

**Oral question:** _"\<The one question the Oral opens this Competency with.>"_

## C2

> _Fiche statement: "\<the Competency as the fiche states it>"_

\<What this Competency asks of a Student.>

**Subject:** \<what the Student works on to demonstrate it.>

**Expected evidence**

- \<A concrete artifact the work leaves behind.>

| Band | What it looks like |
| --- | --- |
| **Resit** | \<The work was not done.> |
| **Needs Work** | \<The work exists, and the Competency is not demonstrated.> |
| **Basic** | \<The thing is done, mechanically.> |
| **Solid** | \<The thing is done, and justified.> |
| **Outstanding** | All of Solid, plus \<knowing the limits.> |

**Oral question:** _"\<The one question the Oral opens this Competency with.>"_
