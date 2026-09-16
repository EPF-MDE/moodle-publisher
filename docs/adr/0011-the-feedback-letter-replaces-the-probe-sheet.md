---
status: supersedes ADR-0002 (the tooling prepares the sheet a human fills in)
---

# The Feedback Letter replaces the Probe Sheet

ADR-0002 prepared the Oral in Moodle's gradebook. It created a Band scale and a hidden Grade Item per Competency, generated a CSV of Probe Sheets from the enrolment, and imported that CSV through the browser driver on the evening of the Orals. In the course where it first ran, this was a mess: the least verified path in the publisher was the one used on the evening with the least time to spare, and what came out of it was a column the Student never saw. What the Instructor actually did instead was read each Student's work with an agent, decide the Bands, and write the Student a letter in a secret gist.

So the publisher now supports the letter and drops the sheet. A **Feedback Letter** is drafted before the Oral and revised after it, and the gist's revision history is the before and after. It is the Instructor's correspondence with one Student, not course material. Nothing is typed into Moodle's gradebook, and final Bands go into EPF's own assessment system by hand.

## Considered options

- **Keep the Grade Items as the place Bands are typed.** Rejected: it keeps `setup`'s gradebook configuration and the Moodle weight trap, all for a column that nobody reads back.
- **Keep the `probes:` block as the agent's checklist.** Rejected: the Probes were drawn from the grid's Solid column, so they were a copy of it, and a copy drifts. The agent reads the Solid column directly.
- **Put the letter in Moodle,** as feedback on a Devoir. Rejected: a letter often covers Competencies from more than one Devoir, and the publisher writes one way and never touches Submissions. A secret gist is shared by link and needs no sign-in, so it adds nothing to what the course's rule that Moodle is the only student-facing surface guards against: a second place to sign in, and material scattered outside Moodle.

## Consequences

- **What survives from ADR-0002 is the human verdict.** An agent may argue for a Band to the Instructor in conversation. A Band is written into a letter only after the Instructor has stated it, and no tool writes one anywhere else.
- **The link is shared after the Oral.** A Student who reads a provisional Band beforehand comes to defend a verdict instead of their work. Sharing it earlier, for example with an absent Student offered a catch-up, is an exception the Instructor chooses for that Student.
- **The package ships the letter skill,** and a course links it into `.claude/skills/`, so moving the pinned tag updates it like the glossary. A course declares what the letter needs in `publisher.json`. Letters are always written in English.
- **The following leave the publisher:** the grid's `probes:` block; the `probes` and `import` commands; `setup`'s Band scale and Grade Items; the Enrolment read; and the part of the audit that checks Grade Items.
