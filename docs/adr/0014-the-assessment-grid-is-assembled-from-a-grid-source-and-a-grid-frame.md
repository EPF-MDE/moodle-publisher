---
status: accepted
---

# The Assessment Grid is assembled from a Grid Source and a Grid Frame

The publisher used to ship a grid template that a course copied by hand, after which nothing updated it. Every EPF grid carries the same Band legend, the same two gaps, the same account of the Oral, the Feedback Letter and Resit, so each copy froze that shared text at the day it was taken, and an improvement to it (the Feedback Letter section, #45) reached no course that had already copied it. The copy also stated each Freeze twice, in front matter and in prose, and relied on the two being checked against each other by eye.

So the Assessment Grid is now assembled at publish time. The course writes only the **Grid Source**: front matter declaring the Competencies, the Deliverables, the programme, the term and the Oral, and one block per Competency, headed by its id alone. The publisher owns the **Grid Frame**, everything else a Student reads, in a fixed order, and writes the course's facts into it from front matter: the title from `publisher.json`, each Freeze from its Deliverable, each Competency's title from the `competencies:` block. A course can neither drop nor reword the Frame. It changes when the pinned publisher does.

## Considered options

- **Generate the full grid into the course repository and commit it.** Rejected: a committed generated file is edited by hand sooner or later and drifts from what generated it. The review by eye it would allow is kept by a `render` command that prints the assembled PDF without Moodle.
- **Keep the Freeze written in prose too.** Rejected: a Freeze stated once cannot disagree with itself. The course loses its own phrasing of a Freeze, and a Deliverable's title says what is handed in.
- **Let a course override or place Frame sections.** Rejected, like the six Sections and the Band scale: what every EPF course shares changes in the publisher, for all of them.
- **Add the publisher's version to every Manifest hash.** Rejected: every upgrade would replace every PDF. The hash is taken over the assembled markdown instead, so a new Frame replaces the grid and nothing else, and an upgrade that leaves the Frame alone reports `skip`.

## Consequences

- **The template's doctrine is reversed.** The README's "nothing generates, installs or updates it" and its Freeze checked by eye no longer hold. `docs/assessment-grid-template.md` becomes a Grid Source starter, and the Frame ships in the package as markdown that people and the `feedback-letter` skill can read.
- **Existing grids are migrated once, by hand.** An agent in each course repository extracts the Competency blocks and the values the Frame now needs, writes the Grid Source, and deletes the rest. The publisher carries no migration code and no guard. The source path is unchanged, so the first publish afterwards is a `replace` that keeps the module id.
- **`check` enforces the Grid Source's shape:** exactly one block per declared Competency, each with its five Band rows, since the Solid row is what a Student's work is read against (ADR-0011).
- **The Frame is written in English only**, as Feedback Letters are.
- **The pattern has a next use.** A Student-facing lecture document produced from its runbook (#46) is the same target by a different mechanism, and is designed on its own.
