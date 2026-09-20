---
# A Grid Source starter, shipped with the publisher (ADR-0014). Copy it to the
# path `publisher.json` names as its `grid`, then replace everything written
# <like this>, below and in the prose, and run `moodle-publisher check`. Once
# copied, it is the course's own Grid Source.
#
# It is not the Assessment Grid a Student reads: the publisher assembles that at
# publish time, printing the Grid Frame, `docs/grid-frame.md` in the installed
# publisher, around the Competency blocks below. Moving the pinned tag brings
# its new Grid Frame, and the next publish replaces the Assessment Grid. So
# write here only what is the course's own: nothing the Grid Frame says.
#
# The course's facts the Grid Frame states, each printed as written: the grid
# opens with "<course> · EPF <programme> · <term>", and its account of the Oral
# reads "The Oral — individual, <length>, <when> — …". None is defaulted.
programme: <programme, e.g. Ingénieur 4A>
term: <term, e.g. Autumn 2026>
oral:
  length: <length, e.g. 20 minutes>
  when: <when, e.g. 14 and 15 December 2026>
  # The Oral minute by minute, printed as the table it is, in this order.
  # Optional, like the two blocks below: leave it out and the grid says nothing
  # about how the Oral goes. Each row states both `at` and `what`, as written.
  # timetable:
  #   - at: 0:00–2:00
  #     what: C1 question
  #   - at: 6:00–8:00
  #     what: "A twist: one constraint of your system changes, and you say what your design does about it"

# The Rehearsal: the supervised lab, before the Freeze, where a Student puts
# every Competency into practice on their own work, and which does not count
# towards a Band. Optional — a course that holds none leaves this out, and the
# grid says nothing about one. Both fields are printed as written.
# rehearsal:
#   when: <when, e.g. 11 December 2026>
#   length: <how long, e.g. 3 hours>

# The Reading Day: the day the Instructor reads every Student's work as it
# stands, after which nothing pushed is read. Optional, and printed as written.
# readingDay:
#   when: <when, e.g. 4 January 2027 at 09:00>

# The Competencies this course is assessed on, one title per line. Each one's
# id is its place in this block — C1, C2, … — so a Competency is only ever
# added at the end: reordering the block renumbers them. Each has one block
# below, headed by its id alone: the publisher writes the title beside it.
competencies:
  - <Competency title>

# The Deliverables, defined once. The publisher publishes a Devoir for each,
# and the Grid Frame states each one's Freeze, by its title, from its `due`:
# the Freeze a Student reads is the one the Devoir enforces.
#
# Ids are written down, never computed from position: renaming one makes a new
# Devoir. Each `due` is a Freeze, written in Europe/Paris time with the offset
# Paris is on that day (+01:00 in winter, +02:00 in summer). `visible: false`
# ships the Devoir hidden, to be revealed by hand; leave it out otherwise.
deliverables:
  - id: <deliverable-id>
    title: <Deliverable title>
    competencies: [C1]
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
