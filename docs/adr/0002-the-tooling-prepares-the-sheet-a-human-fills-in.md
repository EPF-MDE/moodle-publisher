---
status: supersedes the earlier "this system collects, it does not assess"
---

# The tooling prepares the sheet a human fills in

An earlier decision drew the assessment boundary at persistence: no Competency, Band or grade would be stored or displayed anywhere, because EPF's own assessment system is the school's record of a result and a second store would be a second source of truth. That boundary broke the moment the Instructor wanted the Oral's Probe Sheet prepared in advance, because a note and a provisional Band have to live somewhere. The boundary that actually holds is narrower: **no tool here ever computes or publishes a verdict; it prepares the sheet a human fills in.**

Bands are therefore persisted — in Moodle's own gradebook, typed by the Instructor, into hidden Grade Items generated from a template.

## Consequences

- Grade Items are hidden from Students permanently, not until some reveal. A Student who reads a provisional Band before the Oral arrives to defend a verdict instead of their work, which inverts what the Oral is for.
- Grade Items carry the five-value Band scale and are excluded from the course total. Aggregation would produce exactly the /20 the assessment grid refuses, and would average `Resit` — an absence verdict — as though it were a low mark.
- The tooling generates the prompts and the empty fields. It never suggests a Band, and nothing reads the filled-in Bands back out.
