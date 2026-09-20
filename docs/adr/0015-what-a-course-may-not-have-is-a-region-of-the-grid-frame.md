---
status: accepted
---

# What a course may not have is a region of the Grid Frame

The Grid Frame states the course's facts by writing them into `{{slots}}` (ADR-0014). A slot is filled or the run aborts: a Frame with an empty slot would tell Students something nobody wrote down. That works while every course has every fact — a programme, a term, an Oral — and stops working the moment a fact is one a course may not have.

Three of them are (#67): the **Rehearsal**, the **Reading Day** and the **Oral's timetable**. Coding Agents Management runs its Oral in sittings across the term, with no Rehearsal and no single Reading Day; Complex Web Services holds both. The shared wording still belongs to the Frame — an Instructor improves how the Rehearsal is explained once, and moving the pinned tag carries it to every course — but the Frame has to be able to say nothing at all.

So the Frame carries **regions**: the prose about one of the three, between `<!-- if rehearsal -->` and `<!-- end if -->`, with a blank line below it. A course that declares the block in its Grid Source's front matter is printed the whole region, its slots filled as any other; a course that declares none is printed nothing in its place — no heading, no placeholder, no empty table. A slot inside a region is therefore only ever read when its fact exists, and the existing rule stands untouched: a slot that survives to printing and has nothing to fill it is a mistake, and so is an `<!-- if … -->` left standing.

## Considered options

- **Build the three blocks' prose in TypeScript, and slot in the whole paragraph.** Rejected: it splits the Frame's words across a markdown file people read and a source file they do not, and the reason the Frame exists is that its wording is read, reviewed and improved in one place. The generated `{{freezes}}` list is a line per Deliverable, not prose.
- **Drop the paragraph a slot sits in when the slot is empty.** Rejected: implicit, and it cannot reach the timetable, whose lead-in sentence is a paragraph of its own above the table.
- **Make the three required, with a way to write "none".** Rejected: it makes every course state the shape of a course it does not run, and makes the release a breaking one for courses that have nothing to say.
- **Let a course supply the prose and have the Frame place it.** Rejected for the reason ADR-0014 rejects rewording the Frame at all: what every EPF course shares changes in the publisher, for all of them.

## Consequences

- **The Frame gains a second mechanism, and only one.** Regions are a presence test on a declared fact, named in one place; there is no expression, no negation and no nesting. A fourth optional fact is another region and another front-matter block.
- **A declared block is validated whole.** Leaving `rehearsal:` out is not a mistake; writing it without a `length` is, and is refused by `check` and `publish` in the same words, naming the field. A half-written block cannot print a gap.
- **None of the three is a date this program reads.** Each is printed as the course writes it. Only a Deliverable's `due` is an instant, because only a Devoir enforces one; a Rehearsal and a Reading Day are read, not collected.
- **The note the Frame opens with may now quote the markers.** It ends at the first `-->` on a line of its own, so that the comment describing the regions does not close itself.
- **The release is additive for authors, not for the published grid.** No course has to declare anything, but this tag's Frame also states the Oral below the Freezes, so every course's assembled markdown changes and the first publish replaces the Assessment Grid, keeping its module id and its place, exactly as any new Frame does.
