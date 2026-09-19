---
name: feedback-letter
description: Read one Student's work against each Competency's Solid row in the Grid Source, argue for a Band per Competency, and draft or revise the Instructor's Feedback Letter as a secret gist.
disable-model-invocation: true
---

# Feedback Letter

One Student, one **Feedback Letter**, one secret gist. The Instructor grades. You read the work, argue, and write. A Band goes into the letter only after the Instructor has stated it (publisher ADR-0011).

The letter is drafted before the Oral and revised after it, in the same gist, so the gist's revisions show the verdict before and after. Letters are **always in English**, whatever language the course or the conversation is in.

## 0. Read the course

- **`publisher.json`**, for its `feedbackLetter` block: `course`, `prefix` and `signature`. If there is no block, ask the Instructor for the three values in chat and use them, then suggest adding the block so the next letter need not ask; `moodle-publisher check` validates it:

  ```json
  "feedbackLetter": { "course": "<course name>", "prefix": "<kebab-case-prefix>", "signature": "<first name>" }
  ```

- **The Grid Source**, the file `publisher.json` names under `grid`. It is the course's part of the Assessment Grid: the publisher prints the Grid Frame around it, and the Grid Frame's shared text (the Band legend, the Oral, the Feedback Letter, Resit) is not a standard to read work against, so it is not read here.
  - From its front matter, take the Competencies from `competencies:`: their ids are their places (`C1`, `C2`, …) and their titles are as written there. Take the Deliverables from `deliverables:`, each with the Competencies it serves and its `due`, which is its **Freeze**.
  - From its body, take each Competency's block, headed by its id alone (`## C1`), and in its Band table the **Solid** row and the row of the next Band up.
- **The Banding Anchors** for each Competency in scope, when the course has them: files listed in `publisher.json` or kept beside the Grid Source, usually named `<id>-banding-anchors--instructor.md`. They are read together with the Solid row. When a Competency has none, the Solid row alone is the standard.

Done when you can name every Competency in scope with its title, its Freeze, and the criteria of its Solid row as separate lines.

## 1. Take the brief

From the Instructor's message, collect:

- the Student's name as `NAME First-name` (family name in capitals), and the first name the letter uses;
- the Competencies in scope;
- whether this is the **first draft** (before the Oral) or a **revision** (after it), and for a revision the gist id or URL;
- whether the Student sat the **Oral**, and the Instructor's provisional Band and remarks, if any;
- every link to the evidence: the Student's Submissions, and whatever the Instructor points at (a repository, a branch, a PR, an issue, a document, a recording);
- the **angle**: a _verdict_ (these Bands, and why), or _hints_ (how to reach the next Band, without the answers);
- whether to offer a catch-up (only if told to).

When the Grid Source declares no Deliverable for a Competency in scope, there is no Freeze to read the work at: ask which instant to read it at. Ask for everything still missing in a single question.

Done when every item above has a value.

## 2. Read the evidence

The evidence is whatever the Submissions and the Instructor's links point to, and it is not always a repository. Read it with the tool that fits: clone a repository into a scratch directory, read issues, PRs and comments with `gh`, open a document or a page.

For a _verdict_, read the work as it stood at the Freeze of the Deliverable that serves the Competency, or at the Student's Extension, and name anything later that you set aside. For _hints_ after an Oral, read the current state and record the date you read it.

Read one Competency at a time, down to the Solid row, the Banding Anchors and the next Band up. Where a row asks for something that runs (a command that fails, a hook that blocks), run the Student's own command rather than trusting what their documents say about it.

Mark every Solid criterion of every Competency in scope as one of:

- **met**, with a citation: a file path, an issue or PR number, a commit, a quoted passage, or a command and its output;
- **unmet**, with the citation that shows what is there instead;
- **unverifiable**, when you could not reach the evidence: a private repository, a dead link, a recording you cannot open. Say what you tried.

An unverifiable criterion is reported to the Instructor in chat. It never goes into the letter, as met or as unmet.

Done when every Solid criterion in scope has one of the three marks.

## 3. Argue, then wait

In chat, give the Instructor the Band you would argue for on each Competency, the criteria table behind it, the one thing that keeps it from the next Band, and every unverifiable criterion with what would settle it. When the Instructor has already given a Band, test that Band instead of proposing a new one. Also flag anything in the evidence that puts the Student at risk, such as a committed `.env`.

Done when the Instructor has stated the Band (or chosen the hints angle) for every Competency in scope. Until then, write nothing the Student could read.

## 4. Draft the letter

For a **revision**, first read the gist as it stands now, because the Instructor may have edited it by hand since the last revision:

```sh
gh api gists/<id> --jq '.files[] | .filename, .content'
```

Start from that content, not from your earlier draft, and keep the Instructor's edits unless asked to change them.

Write by the conventions in [`LETTER.md`](LETTER.md), then show the full draft in chat. Every claim in it traces back to a citation from step 2. The letter names files, issues and passages; it never quotes the Banding Anchors, which are Instructor Material.

Done when the Instructor approves the draft.

## 5. Publish the gist

A **first draft** creates the gist:

```sh
gh gist create --desc "<description>" <file>   # secret is gh's default; never pass --public
```

A **revision** updates the same gist and never creates a second one for the same Student:

```sh
gh gist edit <id> --filename <file> <file>     # adds a revision to the same gist
```

Then check it is still secret:

```sh
gh api gists/<id> --jq .public                 # must print false
```

For the _hints_ angle with a hidden step 2, follow the two-revision recipe in `LETTER.md`.

The link is shared **after the Oral**: a Student who reads a provisional Band beforehand comes to defend a verdict instead of their work. Before the Oral, give the Instructor the URL and ask before handing it to the Student; sharing it early is the Instructor's exception to make, for that Student.

Done when `.public` prints `false` and the Instructor has the gist URL.
