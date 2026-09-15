# Devoirs are published from the repository, not hand-authored

Moodle exposes no web service that creates or configures a course activity — there is no `core_course_create_modules`, and `core_courseformat_*` is empty — so a Deliverable cannot be brought into existence over the API by any token, however privileged. The alternatives were to hand-author each Devoir once in Moodle's UI, or to extend the publisher's existing visible-browser driver to create them from front matter. We chose the publisher.

## Considered options

Hand-authoring was recommended in an earlier handoff on the grounds that browser automation breaks silently on a Moodle upgrade nobody here controls, and that a missing Deliverable at a Freeze is the worst available failure. That reasoning treated the driver as hypothetical. It is not: every page a Student reads is already created by it, behind a plan gate, an audit and a wipe rollback, so the marginal risk is one already carried and the marginal cost is one more set of selectors.

The decisive argument against hand-authoring is drift. A Freeze written in a markdown brief and a cut-off date typed separately into Moodle are two values that must agree forever, and this repository has already shipped a grid saying `14:00` while two other documents said `20:00`.

## Consequences

- A Devoir's due date and cut-off date are both set from the single `due` in the front matter, so a late Submission is not merely flagged — it does not exist.
- A malformed or missing date fails the run loudly. Nothing falls back to a default, because the wrong Freeze is this system's most expensive defect.
- The audit compares the live Devoir's dates against the front matter, so a hand-edited cut-off in Moodle is caught rather than invisible.
- The prefilled Probe Sheet reaches the gradebook the same way: the driver drives Moodle's own CSV import, not its grading grid, because importing a file is one form where typing is thirty Students times three fields.
- The Course must be configured before any Probe Sheet can be imported: the Band scale and the three hidden Grade Items are created by a setup step, not by hand, because the CSV import matches scale values by exact string and a hand-made scale reading `Needs work` maps Bands one notch off in silence.
