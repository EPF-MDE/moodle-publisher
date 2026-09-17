# Every entry publishes on every run

**Out of scope: Phase is a retired concept and is not to be implemented again.** It is named in the history below only as the mechanism this decision removed. Nothing in the publisher implements it, `publish` aborts on `--phase` by name rather than ignoring it, and `CONTEXT.md` lists it among the terms not to reintroduce.

There is one table, and every document it names is published on every run.

## History: the mechanism this replaced

_This section is history. Nothing in it is a rule, and the concept it describes is retired._

The publisher was built in the weeks before a course it had to publish, and Phase was how it was rolled out without ever putting material in front of a class early. Each catalog entry carried a phase; `--phase` said how far a run should go, defaulting to 1; the plan reported what the requested phase had held back. The first phase was the day-one set and the second was the rest of the term, and until the second was published the difference was real: half the table was material the publisher was deliberately not yet trusted with.

That ended once the manifest recorded the whole of the table as published, with no entry waiting on a later run. What was left of the mechanism was a decision every run had to make and every run made the same way, plus a default that had become the wrong answer: `--phase` defaulted to 1, so the plainest invocation of the tool would withhold half the course.

_Context: the decision was taken in the 2026 course, at the point the last of its material had been published and the flag had no work left to do._

## The decision

Phase comes out, and the `--phase` flag is removed outright rather than accepted and ignored: `publish` refuses any argument but `--apply`, naming it. A flag that used to decide how much of the course a run published, silently swallowed, would report a full publish to somebody who believed they had asked for half of one — and the only caller is the Instructor, whose notes and shell history are exactly where a stale `--phase` would survive.

## Consequences

- **Nothing guarantees that material cannot appear before its lecture.** This is given up knowingly, and it is the whole cost of the decision. A document is live the moment its entry is added to the table, so adding an entry _is_ the publishing decision, made in the diff that adds it rather than deferred to a flag at run time.
- **`revealedOn` stays, and is what remains of the idea.** The retired mechanism was the coarse, all-at-once version of "this must not be seen yet"; a reveal date is the precise, per-document version, and it is the stronger of the two — the document ships hidden and a human opens it on the day, rather than being absent from the Course and appearing whenever somebody remembers to re-run. A brief that must not be read before its date is the case that needs it, and it is unaffected.
- **A cross-reference can fail to find its target exactly one way.** `LinkToWithheldDocument` is gone: no document is withheld, so a link that does not resolve is a link to a document the table does not name, which is the typo case and still a hard error. The rule that decided which Resources shipped first — a link to withheld material is a dead link, so the transitive closure of the day-one reading had to ship with it — has no work left to do, because the closure is published either way.
- **The audit no longer has a hole in it.** Its check that every document with a reveal date is present in the Course assumed such a document was one the default run already published, and a reveal date on a document the run held back would have made the audit report it missing after a perfectly good run. Every entry is published, so presence can be asked of every dated document unconditionally.
- **Instructor Material loses a caveat it never needed.** It was published wherever it sat, because the retired mechanism governed what Students were shown and this is material Students are never shown. What keeps it from them is the hiding and the re-hiding of ADR-0004, which never had anything to do with it.
- **The plan is shorter and says less.** No heading naming a batch of material, and no list of what was held back — that list existed so a document missing from the Course page could not be mistaken for a table somebody forgot to fill in, and now a document missing from the Course page _is_ a table somebody forgot to fill in.
