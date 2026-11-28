# The attended browser and emptying the course

How the publisher drives Moodle through a visible, signed-in browser, and the one command that deletes from a course. Part of the [Moodle publisher README](../README.md).

## The attended browser

EPF's Moodle authenticates exclusively through Office 365, and a web service token is not obtainable for the instructor's account, so writes go through a real browser driving the Moodle UI.

- The browser is **visible**, always. It never runs headless and refuses to run when `CI` is set.
- The instructor logs in to Microsoft **by hand, once**. This tool never reads, stores or transmits the EPF password; only Playwright's session state is persisted, to `~/.config/epf-moodle-publisher/session.json` by default — outside git, and revocable by logging out of Office 365. The run waits for `MOODLE_BASE_URL` itself and for a signed-in page, not merely for the browser to leave the Microsoft host: a real sign-in may hop through an intermediate identity host on its way back.
- If a run is ever bounced to `login.microsoftonline.com` it **aborts immediately** rather than half-writing content. The check starts once the hand login is done, so the login you were asked to perform is not itself mistaken for a bounce; every page the driver opens after that is watched.
- If the course in the browser is not `MOODLE_COURSE_ID`, it aborts. The course id is read from the page, not assumed from the URL requested.
- A document goes in as a **PDF**: the driver prints the rendered HTML with Chromium and uploads it through the resource form's file manager, the only way a file gets into this Moodle. A Devoir's description goes in as HTML source: the driver switches the instructor's editor preference to the plain text area, fills the field, and restores the previous preference when the run ends. Nothing is typed character by character. If the preference cannot be set the run aborts, because filling a rich editor's hidden textarea produces a description that is quietly wrong. The switch happens only when a run is about to write something — a plan never touches the preference, and so can never abort on it. If the restore fails the run still finishes, with a warning naming the value to set back by hand.
- A Devoir update opens **the same form on the existing activity** (`/course/modedit.php?update=<module id>`) and fills the name, the description and the dates and nothing else. Moodle keeps the module id, the section and the visibility, and the driver reads the course back afterwards: an update form a future Moodle stops honouring fails loudly instead of reporting a Devoir rewritten while students carry on reading last week's version.
- The activity form is submitted with **save and return to course**, so the run lands back on the course page and reads the new module id from the same page the course check runs against. It waits for the course URL specifically, not for a load to settle: settling can be satisfied by the form page being left, and reading the module id from there would fail a run whose activity had actually been created — the one case that writes the course without writing the manifest.
- Every mutating action is captured **before and after** into a timestamped run directory under `runs/<timestamp>/`. The `after` capture is taken even when the action fails — that is the one worth looking at. A plan mutates nothing and so creates no run directory.
- A capture is a screenshot, **the page's HTML, and the URL**, and `run.txt` names every action with the page it started and ended on and the message of any abort. A screenshot shows what a page looked like; it does not say which page it was, and it cannot be searched for the markup a selector missed. A failed run against the live course is diagnosed from what it left behind, long after the terminal that printed the error has gone.

### The browser

A course repository never depends on Playwright, and never runs a Playwright command: Playwright is the publisher's dependency, pinned to an exact version. Its browser is not part of any install, though — it is a download into a per-machine cache (`~/Library/Caches/ms-playwright/` on a Mac) keyed by Chromium revision. The publisher installs the one it launches, Chromium alone, through its own Playwright:

```bash
npx moodle-publisher install-browser             # --dry-run prints what it would download, and where
```

A course repository can name it in its `package.json`, as `"browser": "moodle-publisher install-browser"`, and run `npm run browser`. It is needed once per machine, and again when a new publisher tag moves Playwright to another Chromium revision; a run that finds the browser missing aborts before opening a window and names this command. Nothing downloads it on install: that would be about 180 MB on every `npm install`, CI's included, where only `check` runs and no browser is ever opened.

### Selectors

The EPF theme sits behind SSO and cannot be inspected from outside, so the selectors in `src/packages/course/lib/selectors.ts` are confirmed — and adjusted — in an attended codegen session against a **scratch** course:

```bash
npx playwright codegen --load-storage ~/.config/epf-moodle-publisher/session.json \
  https://moodle.epf.fr/course/view.php?id=<scratch course id>
```

They deliberately favour core Moodle URLs and stable form ids over theme markup: a file resource is created through `/course/modedit.php`, not by clicking through the activity chooser, which is the part a theme is most likely to reskin.

Adding a section, deleting an activity and deleting a section are the newest and least verified of these paths: they go through `/course/changenumsections.php`, `/course/editsection.php` and `/course/mod.php`, and the confirmation button is matched by a list of the ids core Moodle has used rather than one known id. Each of them therefore **reads the course back afterwards** and aborts if what it asked for did not happen — a delete URL a future Moodle stops honouring fails loudly instead of reporting a clean course that is still full. Confirm them in codegen before the first real wipe; a run of `npm run wipe -- --course <scratch id>` without `--apply` exercises every read involved and deletes nothing.

## Emptying the course

A course under design gets built more than once, so emptying it is a command rather than an afternoon of clicking:

```bash
npm run wipe -- --course 771            # lists what would go
npm run wipe -- --course 771 --apply    # does it
```

Everything else this tool does is additive; this is the exception, and it is shaped so the exception is hard to trigger by accident:

- **The course id is typed on the command line** and must equal the configured one, or the run aborts having touched nothing. It is deliberately not a yes/no prompt: a prompt gets answered by reflex, whereas a course id has to be looked up and typed, and it is precisely the thing that would be wrong if the wrong course were about to be emptied. A `.env` pointing somewhere unexpected therefore produces a mismatch and an abort, not a wiped course.
- **A Devoir holding Submissions stops the run outright**, before anything at all is deleted — not the Devoir, not the other activities, not the sections, not the manifest. Students' work is the one thing in a course that exists nowhere else in a form the course can read, and Moodle takes every Submission down with the activity. The refusal names each Devoir it refused over and how many Submissions it holds, and **there is no flag, prompt or environment variable that gets past it**: anything overridable is a thing that gets overridden at 23:00 while debugging something else. If the work really is finished with, delete the Devoir by hand in Moodle and the wipe runs. The counts are read through the browser session the run already holds, on the grading page that shows them; a count that cannot be established is the same refusal, because "I could not tell, so I deleted it" is never the outcome.
- **Reporting is the default.** `--apply` is opt-in, as with publishing.
- **Everything that will go is listed first**, by name — every activity and every section — so a leftover that should have been kept is visible before it is gone rather than after.
- **The manifest is cleared last.** A course emptied while the manifest still claims the documents are published would make the next `apply` skip everything and report a full course holding nothing.

"Empty" means Moodle's own **section 0** and nothing else: it cannot be deleted, so it survives with its name (`Objectifs pédagogiques`, in the 2026 course) and loses only its activities. Rename it by hand if you want it called something else. Every other section, and every activity anywhere in the course, is deleted.

There is no undo, and deleted Moodle activities do not come back. What there is instead: the `before` and `after` screenshots of every deletion, in `runs/<timestamp>/`.
