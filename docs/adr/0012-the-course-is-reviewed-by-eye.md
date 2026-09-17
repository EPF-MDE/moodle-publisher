---
status: amends ADR-0003, ADR-0004 and ADR-0007, where they rely on the audit
---

# The course is reviewed by eye, not audited

The `audit` command read the live Course and compared it with the course repository. It was built to catch what a human did by hand in Moodle: a page of Instructor Material revealed, a Freeze moved, file upload switched back on. Most of the machinery behind it existed only because documents are pages. It opened every activity's page on every snapshot, and it fingerprinted page bodies to find Instructor Material pasted somewhere a Student could read it. It also opened each Devoir's settings form and read five date selects back into an instant. After one run of the Course, the Instructor would rather look at the course than keep all of that working through Moodle upgrades.

So the audit is retired. A written checklist, [docs/human-review-checklist.md](../human-review-checklist.md), says what to look at and what fixes each finding. The publisher now writes the course and nothing checks it afterwards.

## Considered options

- **Keep the audit, drop only the fingerprints.** Rejected: the Devoir-settings read is the most fragile part left, since it reads a form this program also writes. A check that fails because of its own selectors gets ignored in the hour before a Freeze, which is the hour it was for.
- **Have `publish` repair what it finds.** Rejected for now: a Devoir is skipped when its Deliverable is unchanged in the repository. Rewriting every Devoir on every run would mean a settings form per Devoir per run, which is the same fragility in a place that writes.

## Consequences

- **Hand edits are found by a human or not at all.** A moved Freeze, a cut-off switched off and file upload switched on are on the checklist, and each is fixed by hand. A page of Instructor Material that was revealed or stealthed is still re-hidden by the next publish (ADR-0004), and a Devoir deleted in Moodle is still created again.
- **ADR-0003's claim that a hand-edited cut-off "is caught rather than invisible"** now holds only when somebody goes through the checklist.
- **ADR-0004's "audit failure"** and **ADR-0007's note about the audit** describe a check that no longer runs. What they say about publishing still stands.
- **The following leave the publisher:** the `audit` command; its fingerprints; the driver's Devoir-settings read and the date conversion that only it used; the snapshot's read of each activity's body; and `PUBLISHER_NOW`. (`PUBLISHER_NOW` has since come back, still honoured only under the fake driver, to date the footer of every PDF: #26.)
