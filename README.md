# Moodle publisher

Pushes named course documents from a course repository into a Moodle course, one way and repeatably. Git stays canonical; Moodle is a rendered mirror. Re-running it is meant to be boring.

It was built inside the 2026 Coding Agents Management curriculum ([xavxyz/epf-coding-agents-management]), whose history holds how it came to be, and moved here so that any EPF course repository can install it. The publisher holds no course's data: what a course publishes is in that course repository's own `publisher.json`. The examples below are drawn from the 2026 course, the first course repository to install it.

[xavxyz/epf-coding-agents-management]: https://github.com/xavxyz/epf-coding-agents-management

## Installing it

A course repository depends on the publisher as a git dependency pinned to a tag. There is no registry and no build step: the package is TypeScript that Node runs directly, and it needs Node 24 or later.

```bash
npm install --save-dev github:epf-mde/moodle-publisher#<tag>
npx moodle-publisher publish      # the binary takes the commands below
```

**Moving the pin is the upgrade.** A release that asks a course repository to change something says what, once, in [docs/upgrading.md](./docs/upgrading.md), which ships in the package: an agent upgrading a course reads it at `node_modules/@epf-mde/moodle-publisher/docs/upgrading.md`.

**Run it from the course repository's root.** The directory the command is started in is the repository root: the documents are read from there, and the course's run state is kept there — `moodle-manifest.json` (committed), `.env` and `runs/` (both git-ignored in the course repository: the configuration and a session's captures). Nothing is kept beside the publisher, which once installed is inside `node_modules`, where the next install would delete it. `PUBLISHER_REPO_ROOT` names another root, and `PUBLISHER_MANIFEST`, `PUBLISHER_ENV_FILE` and `MOODLE_RUN_DIR` each still move one file. The Moodle session stays outside git, in `~/.config/epf-moodle-publisher/`.

The browser the publisher drives is installed once per machine, by the publisher, as [below](./docs/attended-browser.md#the-browser). Working on the publisher itself, `npm run <command>` from this repository runs the same commands from source; this checkout holds no course, so point `PUBLISHER_REPO_ROOT` at one, and the run state follows it there.

## Running it

```bash
cp .env.example .env    # fill in the site and the course id
npx moodle-publisher install-browser  # once per machine: the Chromium the publisher launches
npx moodle-publisher install-skills   # once per course repository: links the publisher's agent skills

npx moodle-publisher check  # checks the course repository; no Moodle, no browser, writes nothing
npx moodle-publisher render assessment-grid.md
                        # prints one document as it would be uploaded; no Moodle, no session

npm run plan            # reports what would happen; applies nothing
npm run apply           # publishes
                        # both open a visible browser and need a signed-in session

npm run check:file-resource
                        # creates a hidden PDF file resource on the course and
                        # replaces its file, then lists what to check by hand;
                        # point MOODLE_COURSE_ID at a scratch course

npm run wipe -- --course <id>           # reports what emptying would delete
npm run wipe -- --course <id> --apply   # empties the course
```

`check` refuses everything a plan would refuse short of reading the course — a `publisher.json` or a Grid Source that does not read, a Section the course page does not have, a picture that is not there, a Student-facing document linking to Instructor Material, a Grid Source that still has the retired `probes:` block, a Grid Source missing its programme, term or Oral, one whose Rehearsal, Reading Day or Oral timetable is half-written, or one whose Competency blocks are wrong ([below](./docs/assessment-grid.md#the-assessment-grid)) — with the message the run would print, and exits non-zero. It needs neither `MOODLE_BASE_URL` nor `MOODLE_COURSE_ID` nor a session, never opens a browser and writes nothing: no manifest, no run capture. It is what a course repository's pre-commit hook runs. (In this repository `npm run check` is the publisher's own typecheck and test suite, so the command is spelled out.)

`render <source>` prints one Published Document as the PDF a publish would upload, so it can be read before it is published: the Assessment Grid assembled from the Grid Frame and the Grid Source ([below](./docs/assessment-grid.md#the-assessment-grid)), or any other document. `<source>` is a path the `published` table lists, as the table writes it; any other path is refused, naming it. The repository is read exactly as `check` reads it, with the same refusals, so a repository `check` refuses renders nothing. The PDF is written beside the run captures, as `runs/<run>/<name>.pdf`, or to the path given with `--out <path>`, and the command prints where it went. It needs neither `MOODLE_BASE_URL` nor `MOODLE_COURSE_ID` nor a session, prints in a headless Chromium ([installed once](./docs/attended-browser.md#the-browser)) that opens no Moodle page, and writes nothing to the manifest or the course. Its footer is dated today.

`check` also requires the course repository's **context pointer**. The publisher's glossary ([GLOSSARY.md](./GLOSSARY.md)) and its ADRs ([docs/adr/](./docs/adr/)) ship in the package and are never copied, so upgrading the pinned tag is the sync. A course repository reaches them from the `GLOSSARY-MAP.md` at its root, which names its own glossary and ADRs beside the installed publisher's:

```markdown
# Glossary map

- [Course](./GLOSSARY.md) and its [ADRs](./docs/adr/): this course.
- [Publisher](./node_modules/@epf-mde/moodle-publisher/GLOSSARY.md) and its
  [ADRs](./node_modules/@epf-mde/moodle-publisher/docs/adr/): publishing and grading.
```

The map is required, as `publisher.json` is. `check` fails when the course repository has no `GLOSSARY-MAP.md` (a `CONTEXT-MAP.md` left from before v5.0.0 counts for nothing; see [upgrading](./docs/upgrading.md)), and when the map does not link to the installed publisher's `GLOSSARY.md` or to its `docs/adr/`, giving the links to add. A link counts however it is written: inline or reference-style, with or without `./`, with or without the trailing `/`, with an anchor. Every link in the map that goes into `node_modules/@epf-mde/moodle-publisher/` also has to name something there, and `check` fails, naming the path, when one does not — a typo, or a publisher that is not installed. The course's own links are its business: a course with no glossary or ADRs of its own need not name any. Only `check` reads the map; no other command needs it.

`check` also requires the publisher's **agent skills** to be linked, and fails, naming the link and saying to run `npx moodle-publisher install-skills`, when either is missing or leads anywhere but the installed skill. See [Agent skills](#agent-skills).

When `publisher.json` has a `feedbackLetter` block, `check` fails on one whose `course`, `prefix` or `signature` is not a non-blank string, or whose `prefix` is not lower-case kebab-case. See [Agent skills](#agent-skills).

What it leaves out is only what depends on the live course: a document whose section was changed after it was published, and instructor material already in the course that the manifest has no record of. `npm run plan` still says those.

Reporting the plan is the default. Applying is opt-in (`publish --apply`), so an exploratory invocation is always safe: a plan writes nothing to the course and nothing to the manifest.

It does, however, **read** the course, and so it opens the browser and needs a signed-in session exactly as an apply does. That is new, and it is the price of one line in the plan: whether instructor material somebody revealed has to be re-hidden is a fact about the live course, not about the course repository, and a dry run that could not say so would be hiding the riskiest thing the run does until the moment it did it.

Configuration comes from the environment. If `MOODLE_BASE_URL` or `MOODLE_COURSE_ID` is missing the run aborts with a message naming it — there is no default course anywhere in the code. See [.env.example](./.env.example) for the variable names.

`.env` supplies those variables so they do not have to be retyped, and is git-ignored. It is the **lower** layer: the shell overrides it, always.

```bash
MOODLE_COURSE_ID=771 npm run apply   # goes to 771, whatever .env says
```

That ordering is the point of reading the file at all. Publishing to the wrong course is the expensive mistake here, and the way it would happen is a stale `.env` in the working copy quietly beating the id an instructor typed on purpose. A run with no `.env` at all works exactly as before. `PUBLISHER_ENV_FILE` names a different file; if that file does not exist the run aborts rather than silently falling back to whatever is left in the shell.

## Agent skills

The package ships two skills for the agent an Instructor grades with, under `skills/`:

- **`feedback-letter`** reads one Student's work against each Competency's Solid row in the Grid Source and its Banding Anchors, argues for a Band per Competency, and drafts the Instructor's Feedback Letter as a secret gist, always in English. It is drafted before the Oral and revised in the same gist after it. A Band goes into the letter only once the Instructor has stated it (ADR-0011).
- **`banding-anchors`** writes the Banding Anchors for one Competency: worked example oral answers, as Instructor Material, named `<id>-banding-anchors--instructor.md` by default.

Both are invoked only by the user (`/feedback-letter`, `/banding-anchors`). A course repository links them rather than copying them, so moving the pinned tag updates them, as it updates the glossary:

```bash
npx moodle-publisher install-skills             # --dry-run prints what it would link, and links nothing
```

It creates `.claude/skills/feedback-letter` and `.claude/skills/banding-anchors` as relative symlinks to `node_modules/@epf-mde/moodle-publisher/skills/<name>`, and commits nothing for you: commit the two links. It never reads the configuration and never touches Moodle. A second run finds the links in place and changes nothing. It refuses, and links nothing, when the publisher is not installed in the course repository, or when something it did not make is where a link goes: a directory, a file, or a link to anywhere else. A link it made that leads nowhere, as a renamed skill would leave, is replaced.

The letter skill reads what it needs about the course from a `feedbackLetter` block in `publisher.json`, instead of hard-coding it:

```json
"feedbackLetter": { "course": "Software Craft 2027", "prefix": "craft-2027", "signature": "Ada" }
```

`course` opens every gist description: `<course> — <NAME First-name> : <Competencies> — <angle>`. `prefix` opens every letter's filename: `<prefix>-<name>-<first-name>-feedback.md`, so it is lower-case kebab-case. `signature` signs the letter. The block is optional, and no run reads it; `check` validates it when it is there.

## More

The rest of this guide ships in the package, under `docs/`:

- [The attended browser](./docs/attended-browser.md): the visible, signed-in browser the publisher drives, installing it, confirming its selectors in an attended codegen session, and emptying the course.
- [Re-running](./docs/re-running.md): what a repeated run creates, replaces and skips, the Sections, the manifest, pictures and documents with a reveal date.
- [What may be published](./docs/what-may-be-published.md): the `published` table, cross-references, instructor material, reviewing the course and seeing the guards fire.
- [The assessment grid](./docs/assessment-grid.md): the Grid Source and Grid Frame, Competencies and Deliverables.

## Development

```bash
npm run check     # typecheck + module boundaries + tests
```

Tests drive the command-line interface against the fake driver, with the repository root pointed at a temporary directory of fixture documents. Nothing below the driver seam is unit tested: the browser selectors are verified by the attended run, not by the suite. No test reads a real course's files.

The command line under test is the **packaged** publisher, not this checkout's sources: the suite's global setup (`src/tests/packaged.ts`) runs `npm pack`, installs the tarball into a scratch course repository, and the harness starts its `moodle-publisher` binary. What a course repository installs is therefore what the suite runs. For one file:

```bash
node --test --test-global-setup=src/tests/packaged.ts src/tests/publish.test.ts
```

There is no CI workflow, and none may touch Moodle: the browser driver refuses to run when `CI` is set (`src/tests/never-in-ci.test.ts`).

Packages under `src/packages/` are deep modules — see [src/packages/README.md](./src/packages/README.md).
