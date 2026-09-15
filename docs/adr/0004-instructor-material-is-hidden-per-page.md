# Instructor material is hidden per page, in the Section it belongs to

The oral protocol and the banding anchors are the two documents a Student must never read, and Moodle offers two ways to keep them out of reach: hide the Section they sit in, or hide each activity. Hiding the Section is one click and covers everything in it, which is exactly what makes it the wrong choice — one click the other way, made in a hurry on 11 September while a brief is being revealed, uncovers every document at once and says nothing about it afterwards.

So visibility is a property of the page, not of the room it stands in. Each instructor document is created hidden and re-hidden on every later run that finds it visible, which is the only case in which the publisher writes visibility outside a create, and it can only ever conceal. A Section is never hidden to protect what is in it.

The Section itself follows from that. Once hiding is per page, a Section of their own buys nothing and costs the thing it was hiding behind: a room whose name says an answer key exists. So each instructor document sits in the Section its Student counterpart sits in — the anchors beside the grid, the protocol beside the oral brief, the solution beside the exercise — and the entry says where, like every other entry.

What says who a document is _for_ is its filename. A source path ending `--instructor.md` is instructor material, and nothing else says so: the suffix is what makes the page hidden, what puts `Instructor — ` in front of its title, and what refuses a Student-facing link to it.

## Consequences

- **`--instructor` is a rule over the path, not a field on an entry.** Renaming a document is the whole of the change. An instructor document listed without its suffix would publish visible, and nothing guards against it: a second place saying who a document is for is a second place to disagree with the filename.
- **The title prefix is derived at publish time.** The entry carries `C1 banding anchors`; an examiner reads `Instructor — C1 banding anchors`. There is no entry that can carry the prefix without the hiding, or the hiding without the prefix.
- **Every Section the publisher creates is created visible**, and no run hides a Section. There is no course-format setting to check either: what a hidden Section shows a Student stopped being a question this program has to ask.
- **A planned Section change aborts rather than moving anything.** Publishing adds Sections and never reshuffles the Course. A table that now names a different Section for an already-published document raises `SectionMoved` — an update rewrites an activity where it stands, and reporting `skip` would claim there was no work to do while the document sat where the table no longer names.
- **A revealed instructor page is both an audit failure and a thing the next run fixes.** The audit fails on it — read back by module id, which survives the activity being renamed or dragged — and a publish re-hides it and says what it re-hid. The plan states the re-hide before it happens, so a dry run reports it and changes nothing. The audit still matters: it is what catches the reveal on a day nobody is publishing.
- **Instructor material with no Student counterpart sits where its reader already is.** The rule above pairs a document with the one it is an answer key to, and most instructor material is exactly that. The crash-course quiz is not: it is what an examiner uses to rehearse their own knowledge, and there is no Student document it is the key to. It publishes into `Assessment`, where the rest of the examiner's material already is, because the point of the rule is that an examiner finds what they need where they are looking — not that a pair exists.
- **Where an instructor page sits is reported, never judged.** The Section is not what keeps Students out of it, so an activity somebody dragged elsewhere is named in the audit's message and is not a finding of its own.

_Amended by issue #54, which removed the `Instructors` Section. The decision this ADR records — visibility is a property of the page — is what made removing it possible._

_Amended by issue #66, which added the crash-course quiz: the first instructor material with no Student counterpart to sit beside._
