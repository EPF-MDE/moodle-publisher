---
# A template, shipped with the publisher, for a course repository to copy and
# adapt by hand. Copy it to the path `publisher.json` names as its `grid`, then
# replace everything written <like this>, below and in the prose. Nothing
# generates or updates this file: once copied, it is the course's own.
#
# The Competencies this course is assessed on, one title per line. Each one's
# id is its place in this block — C1, C2, … — so a Competency is only ever
# added at the end: reordering the block renumbers them.
competencies:
  - <Competency title>
  - <Competency title>

# The Deliverables, defined once. The publisher reads this block; Students read
# the prose below, and the Freeze stated in each must be the one stated in the
# other.
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

# Assessment Grid — \<Course title>

**EPF · \<programme> · \<term>**

---

## How this course is assessed

Each Competency is assessed on its own, and given one of five Bands. There is no numeric scale and no average: one Competency's Band never makes up for another's.

| Band | What it means |
| --- | --- |
| **Resit** | The work was not done. This is an absence verdict, not a quality judgement. |
| **Needs Work** | The work exists but the Competency is not demonstrated. |
| **Basic** | The Competency is demonstrated mechanically. You did the thing; you could not yet do it under different conditions. |
| **Solid** | **The junior engineer I would hire.** You did the thing and you know why. |
| **Outstanding** | Judgement rather than compliance. You know where your approach stops holding, and can say why. |

The gap between **Basic** and **Solid** is _justification_. The gap between **Solid** and **Outstanding** is _knowing the limits_. Producing more artifacts moves you up the first gap, never the second.

## How the Bands are given

Your work is read before your Oral, and the Instructor arrives with a provisional Band per Competency. The Oral — \<length>, individual, on \<date or sittings> — does not discover your work: it **verifies** that the work is yours and that you understand it. A strong piece of work you cannot defend moves down. A modest one defended with real understanding moves up.

**Freeze:** \<what> must be handed in by **\<time> on \<date>**. Anything handed in later is not read. An Extension is granted to one named Student, in Moodle, and you are told so by name — there is no extra time anybody gets silently.

## Your Feedback Letter

The Bands reach you in a **Feedback Letter**: the Instructor's written account, to you alone, of your Band on each Competency and the reasons for it.

1. **Your work is read at the Freeze.** What you handed in to the Devoir is read as it stood at the Freeze, or at the end of your Extension. Anything pushed later is set aside.
2. **An agent reads it against this grid.** For each Competency, an agent checks your work against the **Solid** row, line by line, and cites the evidence for what it finds: a file, a commit, an issue or pull request, or the output of a command it ran on your work. What it cannot reach, such as a private repository or a dead link, is reported to the Instructor and never counted against you.
3. **The Instructor gives the Band, not the agent.** The agent argues for a Band; the Instructor checks the argument and decides. A Band appears in your letter only once the Instructor has stated it.
4. **The letter is a secret GitHub gist,** reachable only through its link. It gives each Band, what works with the evidence behind it, and what is missing for the next Band. Sometimes it gives leads towards the next Band instead, without the answers.
5. **It is drafted before your Oral and revised after it,** in the same gist, so its history shows the verdict before and after. You receive the link after the Oral, so that you come to defend your work, not a verdict.

Using an agent in your own work is not a reproach: working with agents is part of what is assessed. What is assessed is your ability to defend what the agent produced, and only the Oral shows that.

---

## C1 — \<Competency title>

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

---

## C2 — \<Competency title>

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

---

## Resit

A **Resit** Band means the work for that Competency was not done. It is an absence verdict, not the bottom of a quality scale, and it never averages with anything. It is remedied by doing the work: hand it in against the same grid, with a short written account of what changed. The other Competencies' Bands stand.
