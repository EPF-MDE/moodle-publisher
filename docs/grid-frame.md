<!--
  The Grid Frame (ADR-0014): everything a Student reads in the Assessment Grid
  that is the same in every EPF course. The publisher prints it around the
  course's Competency blocks, which it writes in place of the slot below the
  Feedback Letter, each headed `## Cn — <title>` from the Grid Source's `competencies:`.

  Every other `{{slot}}` is one of the course's facts, written as the course
  states it: the course from `publisher.json`, the programme, the term and the
  Oral from the Grid Source's front matter, and one Freeze line per Deliverable,
  in `due` order, its time and date in Europe/Paris.

  A course can neither drop nor reword it: it changes when the pinned publisher
  does. It prints no title of its own: the PDF opens with the title the
  `published` table gives the grid (ADR-0013).
-->

**{{course}} · EPF {{programme}} · {{term}}** · how your work in this course is assessed, how each Band is given, and what each Competency asks of you.

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

Your work is read before your Oral, and the Instructor arrives with a provisional Band per Competency. The Oral — individual, {{oral length}}, {{oral when}} — does not discover your work: it **verifies** that the work is yours and that you understand it. A strong piece of work you cannot defend moves down. A modest one defended with real understanding moves up.

Each Deliverable must be handed in to its Devoir by its Freeze, in Paris time:

{{freezes}}

Anything handed in later is not read. An Extension is granted to one named Student, in Moodle, and you are told so by name — there is no extra time anybody gets silently.

## Your Feedback Letter

The Bands reach you in a **Feedback Letter**: the Instructor's written account, to you alone, of your Band on each Competency and the reasons for it.

1. **Your work is read at the Freeze.** What you handed in to the Devoir is read as it stood at the Freeze, or at the end of your Extension. Anything pushed later is set aside.
2. **An agent reads it against this grid.** For each Competency, an agent checks your work against the **Solid** row, line by line, and cites the evidence for what it finds: a file, a commit, an issue or pull request, or the output of a command it ran on your work. What it cannot reach, such as a private repository or a dead link, is reported to the Instructor and never counted against you.
3. **The Instructor gives the Band, not the agent.** The agent argues for a Band; the Instructor checks the argument and decides. A Band appears in your letter only once the Instructor has stated it.
4. **The letter is a secret GitHub gist,** reachable only through its link. It gives each Band, what works with the evidence behind it, and what is missing for the next Band. Sometimes it gives leads towards the next Band instead, without the answers.
5. **It is drafted before your Oral and revised after it,** in the same gist, so its history shows the verdict before and after. You receive the link after the Oral, so that you come to defend your work, not a verdict.

Using an agent in your own work is not a reproach: working with agents is part of what is assessed. What is assessed is your ability to defend what the agent produced, and only the Oral shows that.

---

{{competency blocks}}

---

## Resit

A **Resit** Band means the work for that Competency was not done. It is an absence verdict, not the bottom of a quality scale, and it never averages with anything. It is remedied by doing the work: hand it in against the same grid, with a short written account of what changed. The other Competencies' Bands stand.
