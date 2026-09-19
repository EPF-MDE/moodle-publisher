---
name: banding-anchors
description: Write the Banding Anchors for one Competency of the Assessment Grid, from its block in the Grid Source, as worked example oral answers for the Instructor.
disable-model-invocation: true
---

# Banding Anchors

Turn one Competency of the Assessment Grid into its **Banding Anchors**: a file of worked example answers — what Basic sounds like, what Solid sounds like, what Outstanding adds — so an instructor can band a student in the ninety seconds an oral gives them. The `feedback-letter` skill reads them too, beside the Competency's Solid row, when it drafts a Feedback Letter.

One competency per run. The argument names it (`C2`, `the hooks one`). If it names none, list the Competencies the Grid Source's `competencies:` declares, with their ids, and ask which.

The Banding Anchors exist to make the Assessment Grid's Bands **audible**. The Solid row states criteria; a student speaks sentences. Everything below is in service of the instructor hearing the gap between two bands in a live room.

## 1. Read the source documents

Read the **Grid Source**, the file `publisher.json` names as `grid`, and the interview script if one exists. The Grid Source holds the course's part of the Assessment Grid: the Competencies in its front matter, and one block per Competency, headed by its id alone (`## C2`); its title is the one `competencies:` gives it. Everything else a Student reads in the Assessment Grid is the Grid Frame, the same in every EPF course, and holds no criterion. Extract from the chosen Competency's block:

- The **oral question**, verbatim.
- The **Solid row**, split into its separate clauses — each is a criterion you will have to satisfy in a sentence.
- The **Outstanding row**, which is an increment on Solid, not a different answer.
- Any **conditions of grading** peculiar to this competency: graded live, no pre-read, same repository for everyone, a freeze deadline.

Read any instructor notes that already exist for this competency (a solution file, a marking key). They are **assumed read, referenced, and not repeated** — your file is the same material as spoken answers.

Done when you can list the Solid clauses as separate lines and quote the question verbatim.

## 2. Ground the answer in a real artifact

Pick one real subject — a repository, a change, a bug — that genuinely exercises this competency, and then **open it**. Every file path, quoted line, number, command output and piece of pointer wording in the finished file is a byte-for-byte copy of something you read, or the output of something you ran.

- Quoting a document? `cat` it and copy the exact words.
- Claiming code behaves a certain way? Run it and copy what it printed.
- Naming a line range or an identifier? Verify it resolves right now.

The line to hold: **the student's voice may invent; the world may not.** Inside a quoted answer the student can say "here are both versions in git" or describe a session that never happened — that is the hypothetical speaker. A file, a number, a command output or a wording that does not exist in the real artifact is not acceptable at any point, quoted or not.

Done when every artifact you intend to cite has been opened or run in this session.

## 3. Extract the discriminator per clause

For each Solid clause, write yourself a one-liner: *what a Basic student says* versus *what a Solid student says*. The distinction is nearly always concrete and small — the Solid row says "resolves an ambiguity", and the split is that Basic names the **feature** while Solid names the **question**.

The Solid answer must then **contain** that discriminator as a spoken sentence, not describe it. Paraphrasing the Solid row back is the failure this step exists to prevent.

Done when every Solid clause has a Basic-says / Solid-says line.

## 4. Write the file

Name it `<id>-banding-anchors--instructor.md` (for example `c2-banding-anchors--instructor.md`), unless the course already names its Banding Anchors otherwise. The name is a default, not a rule: `publisher.json` gives each published file its title. Whatever name the Instructor chooses, keep the `--instructor` suffix: it is what makes the publisher publish the file hidden, as Instructor Material (publisher ADR-0004). Keep the file beside the Grid Source unless the course keeps its Banding Anchors elsewhere, and tell the Instructor to list it in `publisher.json` if they want it in Moodle.

Follow [the shape](#the-shape) below, in order. Write the spoken answers in the student's voice, out loud, at a length the clock allows.

## 5. Verify

Check, by executing rather than by reading:

- Every link target resolves from the file's own location.
- Every quoted wording matches its source exactly.
- Every claim about running something holds when run.
- No criterion has been copied out of the Grid Source or the interview script — both are **linked**, so a criterion changes in one place.

Done when all four have been checked, each with a command.

## The shape

Six parts. Each earned its place in practice; a file missing one is missing a way of banding.

**Header.** A line saying the file is for Instructors only, with its reason — these describe repositories students can read, so shown to students they become a script to imitate rather than a standard to meet. Then links to the Grid Source and the interview script, saying explicitly that neither is restated. Then the oral question in full, the subject used, and any condition peculiar to grading this competency.

**Basic — what falls short.** A plausible answer that does everything asked and justifies nothing: the artifacts are all present, and the band is capped by what is missing. Follow it with **the tells**, as a short list, in the order they appear in the answer. Close on **the follow-up question that resolves the band** — the one question that separates a Basic student from a Solid one — and say what each would answer.

**Solid.** The full spoken answer, in the student's voice, at the length the oral allows (~90 seconds), broken into named beats. Stage directions where the student would act: `[_runs it_]`, `[_shows the issue_]`. Close, outside the quote, on one line naming **which beat is doing the discriminating work** and why.

**Outstanding — what to add.** Not a new answer: the increment **volunteered** on top of Solid, as another quoted passage. Then one line naming what is being demonstrated. If the Outstanding row offers alternative routes to it, give one passage each and say either earns it.

**Where each clause lands.** A table: each criterion of the Solid row, and the sentence of the answer that satisfies it. This is the audit that the answer contains the criteria rather than gesturing at them.

**Near-misses.** A table: "Looks like Solid" / "Why it isn't". Answers that pattern-match to the band and fail on one property, each with the follow-up question that settles it. This is where live judgement actually happens, so it is the part worth the most rows.

## Adapting to another course's scheme

The shape is band-based, not course-based. Outside an EPF Assessment Grid, map the vocabulary onto whatever the assessment scheme uses: **bands** are its ordered achievement levels, **competency** its independently-graded strand, and the **question** whatever prompt the student answers. Write Banding Anchors for the three bands around the pass line — the one that falls short, the target, and the one above it — and skip the absence bands, which need no worked answer.

If the scheme has no oral question, the spoken answer becomes whatever the student produces under observation, and the follow-up becomes the check the assessor applies to it.

[`EXAMPLE-OUTPUT.md`](EXAMPLE-OUTPUT.md) is one finished file from another course, for register and length. The shape above is authoritative; the example only shows what it sounds like.
