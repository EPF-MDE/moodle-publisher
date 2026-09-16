# C1 — Banding Anchors

_Reference output for the `banding-anchors` skill: one finished file from another EPF course, about agent-assisted software work. Its links have been flattened, since the repository it belongs to is not this one. Read it for register and length; the shape in `SKILL.md` is authoritative._

**Instructor notes. Not for Students:** these are worked answers about a repository students can read. Shown to students, they become a script to imitate rather than a standard to meet.

Use them for calibration — mine against the band you provisionally assigned — and as the source of the follow-up when an answer stalls. Criteria live in `assessment-grid.md`; discriminators in `interview-script.md`. Neither is restated here.

**Question:** _"Walk me through how you framed this work. Show me one unit you would hand to a fresh agent session, and tell me what it blocks."_

**Subject used below:** the Moodle publisher (`publisher/`) — publishing a course from git to Moodle, repeatably. A real change with a real blocking edge.

---

## Basic — what falls short

> "The request was to publish my course to Moodle. I wrote a spec describing the publisher: it reads a manifest, creates the sections, uploads the documents. Then I split it into three issues — parse the manifest, create sections, upload documents — and did them in that order, because you need sections before you can put documents in them. For context I started a fresh session for each issue so it wouldn't get confused."

Everything asked for is present, and nothing is justified. The tells, in the order they appear:

- The spec **describes the feature**. There is no question in it — no point where the request was silent and the student decided.
- The three "units" are the **sequential steps of one indivisible task**. Nothing here could go to a fresh session on its own; each needs the shape the previous one invented.
- "You need sections before documents" **restates the arrow**. It names no failure.
- A fresh session per issue is a real decision taken for a folk reason. "So it wouldn't get confused" is not a boundary; it is a habit.

**Follow-up that resolves it:** _"What breaks if I do them the other way round?"_ A Solid student answers with a symptom. A Basic student answers with the arrow again.

---

## Solid

> **The framing.**
> The request I started from was "publish my course to Moodle." I interviewed it, and the thing it never answered was: **what does a second publish do to a section that exists in Moodle but is no longer in my manifest?** The request only imagined the first run. There are three defensible answers — leave it, delete it, or refuse and make the human decide — and they produce completely different code, so I could not write a single ticket until I picked one.
>
> I picked **delete, but only sections the publisher created itself**, tracked by an ID we write at creation. That line is in the spec and not in the request. It is why the spec is two pages rather than a restatement.
>
> **The unit.**
> This one — `#7: reconcile sections against the manifest`. [_shows the issue_] It states its input: a course ID and a parsed manifest. It states the rule I just gave. It states done: given a course with one stale publisher-created section and one hand-made section, running it removes the first and leaves the second. A fresh session gets that issue and nothing else and can execute it. It never has to ask me what stale means, because that was resolved upstream, in the spec, once.
>
> **What it blocks.**
> It blocks `#9: publish documents into sections` — a **true dependency, not an ordering preference**. Documents attach to a section by ID. If #9 runs first, it attaches documents to sections that #7 is then about to delete, so the run exits zero and the content is gone. That is the failure: not "messier", but silent data loss. The edge is written on the issue as `blocked by #7`, not held in my head.
>
> And one that **is not** a true dependency: #8 renames sections. I do it after #7 because the diff reads better that way, but nothing breaks if I swap them. I keep the two kinds of edge visually distinct so nobody reads my preference as a constraint.
>
> **Context.**
> I ran #7 and #8 in one session and started fresh for #9. Not because #9 was long — because the reconciliation session had two abandoned approaches in it, and I did not want a fresh agent's first move to be re-litigating a design I had already rejected. I considered compacting instead and ruled it out: compaction would have kept a summary of exactly the reasoning I wanted gone.

The move doing the most work is the **last two beats**: a preferred edge held next to a true one, and a context boundary justified by what it excluded. That is what separates a student who wrote dependencies down from one who can tell them apart.

## Outstanding — what to add

Same answer, plus one of these, volunteered:

> "The cost: three tickets took about forty minutes to write, and #8 was not worth its ticket — it is a two-line rename I could have folded into #7. I deliberately did **not** decompose the Moodle client itself, even though it is the biggest file, because there is no seam in it that a fresh session could hold on its own; splitting it would have produced two tickets that each needed the other's context to make sense. Decomposition buys independent execution and it costs you the ability to see the whole shape at once. Below about half a day of work it does not pay."

Two things are being demonstrated: a **place the method does not apply**, and its **price**. Either alone is enough.

---

## Where each clause lands

| Solid criterion                                      | Satisfied by                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Resolves an ambiguity, and can **name the question** | "What does a second publish do to a section no longer in the manifest?" — asked as a question, with the live alternatives |
| Unit executable from its own description             | Input, rule, and a done-condition checkable without asking the student                                                    |
| Blocking edge is a **true** dependency               | Violated ordering attaches documents to about-to-be-deleted sections                                                      |
| Can say **what breaks**                              | Silent data loss on a green run — a symptom, not "it'd be messy"                                                          |
| Context boundaries deliberate                        | Fresh session to exclude two rejected approaches; compaction considered and ruled out                                     |

## Near-misses

| Looks like Solid                                                                                 | Why it isn't                                                                          |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| "The spec says stale sections get deleted."                                                      | A feature description. The grid asks for the **question**, not the answer.            |
| "Should it be TypeScript or Python?"                                                             | A real decision, but not one the request left open in a way that changes the tickets. |
| "Each ticket is independent." — but the unit only works because the student remembers a decision | Not a unit. Test it live: _"hand me #7 right now."_                                   |
| "It blocks #9 because sections come before documents."                                           | True and shallow. The mark is on the breakage.                                        |
| A cost named only when asked                                                                     | Solid, not Outstanding. The tell for Outstanding is that it is **volunteered**.       |
