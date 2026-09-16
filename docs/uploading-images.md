# Getting a picture into the course

A lecture that shows a diagram is not published until the diagram is. Nothing in this repository is a URL Moodle serves, so every `<img>` a document renders has to be pointed at something the course itself holds — and putting the file there is a step of its own, not a change to how markdown is rendered.

This is the record of where an uploaded picture lives, what URL Moodle serves it at, and whether that URL survives the activity being updated. It is also the list of selectors that step needs, and it is where an attended run against a scratch course is written down when one of them turns out to be wrong.

> **Status.** The selectors in the table at the end are **confirmed against moodle.epf.fr**, by `npm run check:upload` — see [Checking the upload without publishing](#checking-the-upload-without-publishing), which is the thing to run when a picture stops arriving.

## Where the file lives

**The picture rides in the activity that shows it.** Uploading through the editor's file picker puts the file in that activity's own file area (`mod_page`, `content`), and nowhere else.

That is a decision as much as a mechanism. The alternative — one shared place that every document points at — has to answer a permissions question this one answers for free: a student who can open the page can fetch the picture, and one who cannot, cannot. The diagram in a hidden instructor page is as hidden as the page. Nothing has to be kept in step.

The cost is that two documents showing one diagram hold two copies of it. That is the right way round: the lab does not break the day the lecture is deleted.

## What the HTML says

The stored body says `@@PLUGINFILE@@/<name>`. Moodle rewrites that to a real URL — `…/pluginfile.php/<context>/mod_page/content/<revision>/<name>` — every time the activity is rendered.

So **the reference survives the activity being updated**, and being moved, and the course being backed up and restored somewhere else: what is stored names the file, and Moodle works out the URL. Writing the URL we saw once would tie the document to a course context that is free to change under it — and it is free to change: the revision number in the path goes up whenever the activity's files do.

The publisher writes `@@PLUGINFILE@@` and then **reads the rendered page back** (`/mod/page/view.php?id=<module id>`) to find the URL the course actually served each picture at. That URL is what the manifest records. It is evidence, not a prediction: a reference Moodle failed to resolve has no `<img>` behind it and the run aborts there, rather than recording a document as published and leaving the broken icon to be found in the lecture theatre.

## The name a file is stored under

Its repository path, flattened: `assets/lecture-1/06-dumb-zone.png` is uploaded as `assets-lecture-1-06-dumb-zone.png`.

Not the file's own name. One document may show `assets/before/diagram.png` and `assets/after/diagram.png`; uploading both as `diagram.png` leaves one file in the activity, both references show the same drawing, and the document reads as if nothing had changed between the two.

## The size a picture is shown at

Every `<img>` is published carrying `style="max-width: 100%; height: auto;"`.

A slide exported from Keynote is two or three thousand pixels wide and the body of a Moodle page is a few hundred. Nothing in the theme caps a picture that is wider than the column it lands in, so it runs off the right-hand edge and is cut there — and on an annotated slide the right-hand edge is where the annotation is. `max-width` shrinks the pictures that are too wide and leaves the smaller ones at their own size; `height: auto` keeps the shrunk ones in proportion rather than squashing them to whatever height the markup asked for.

It is a style and not a class because a class only means something if the theme defines it, and the course's theme is not this program's to know. A document that sets its own `style` on a picture keeps it: the fit goes in first and the author's declarations after it, so the author's is the one that applies.

**The rule is part of the document's hash.** A change to how a picture is shown is a change to what students see, so folding it in is what makes a fix here reach the documents that are already published — otherwise the plan reports nothing to do and the old, cut-off rendering stays up. Only documents that actually show a picture are affected: one that shows none still hashes to its markdown alone.

## Why Atto, when everything else uses the plain text editor

The activity form has no way in for a file except the editor's own picker, and this site has no web service token to be had. So a document that shows a picture is written through **Atto**, and everything else goes on being written through the plain textarea — which is the path this program has proven against the live course, and the shorter one.

The editor preference therefore moves _within_ a run, not only at its ends. The value restored when the run finishes is the one the instructor had, not whatever the last document happened to need.

The body is still written as HTML source either way: Atto is switched into its own HTML view before the body is filled. Atto is here for the file picker, not to have opinions about the markup this program renders.

Uploads are done **before the form is submitted**, so the page and its pictures are saved together. There is no moment in which an activity is in the course showing pictures it does not hold.

## The form carries two rich editors

The page form has an editor for the **Description** and an editor for the **body**, and only the body's is the one to touch. They are identical markup twice over: two toolbars, two image buttons, two sets of dialogues, and two separate draft file areas. The Description's comes first on the page.

That matters because a picture uploaded through a toolbar goes into **that editor's** draft area. Uploading through the Description's toolbar puts the file somewhere the body's `@@PLUGINFILE@@` references cannot reach it, and the published page is a wall of broken icons — which is precisely the failure that sent 28 of Lecture 1's pictures into the Description in August 2026.

So every control the upload uses is looked for **inside the body's editor** (`.editor_atto:has(#id_pageeditable)`), and every dialogue control is looked for among the **visible** ones. A dialogue that nobody opened is still in the DOM, and clicking a control inside it does nothing at all.

## Everything here has to be waited for

Atto's dialogues and the file picker's panes are built by JavaScript after the click that asks for them, and the picker's panes come from the server. Asking the page how many of a control it has is the one question a browser answers instantly, and instantly is before the answer exists: a run that counted rather than waited aborted on controls that were about to appear, differently each time — "no file picker", "no Save as field", "the HTML source field is not showing". None of them was a theme that had moved a control, which is what the messages say and what they sent the next reader off to check.

Two waits in particular:

- **After clicking a repository**, the upload pane is fetched. Asking straight away says "no file input here", the loop runs out of repositories, and the abort blames a Moodle that in fact offers one.
- **After uploading**, the picker closes but Atto's image dialogue stays up, and it lays a mask over the toolbar. One `Escape` dismisses one dialogue; the next picture's button is then unclickable, and the run spends thirty seconds timing out on a click before failing without naming the picture. Dialogues are closed until none is on screen.
- **The first press of "Browse repositories…" can do nothing at all.** The picker is a JavaScript module the page fetches after it has rendered, so on the first picture of a run the button may not have a handler bound yet: the click takes the focus and no picker appears. Ten seconds of waiting does not help, because there is nothing on its way. The button is pressed again, up to five times, until the picker is on screen. This is the one failure `npm run check:upload` cannot be relied on to catch — by the second run of a session the module is cached, and the check is always the second run.

## The source view is CodeMirror's, not the form's

The body goes into Moodle as HTML source under either editor, but under Atto the field it goes into is not the form's textarea. This site runs Atto's HTML plugin **with CodeMirror**, so pressing the toolbar's HTML button hides the rich area and shows an editor of its own; the form's `#id_page` stays hidden the whole time. A run that filled the textarea aborted saying the source field was "on the form but not showing" — which reads like a theme that has moved a control, and was nothing of the kind.

Two more things that path needs:

- **The editor has to be clicked first.** The toolbar acts on the editor the caret is in, so the HTML button does nothing at all until the body's editable area has been clicked.
- **Toggling back to the rich view is what syncs the source** into the field that is submitted. So the body is written, the view is toggled back, and the field is then **read back and compared to what was rendered** — everything in between is Atto's, including its own cleaning of the markup, and a body that did not arrive is a page published empty.
- **The comparison is of markup, not of characters.** The source view is a parser and a serialiser: it hands back `"` where the renderer wrote `&quot;`, and `'` for `&#39;`. Across Lecture 1 that is 339 characters of difference and not one character a student would see, and comparing the strings stopped the publish dead, reporting a body Moodle had supposedly mangled. Both sides are parsed and re-serialised by the page that is about to submit one of them, so whatever the browser does to entities it does to both; what is left is a real difference, and the run still stops on it, saying where.

`npm run check:upload` writes a body as well as sending pictures, so both halves are checked without publishing anything.

## Checking the upload without publishing

```bash
npm run check:upload            # three pictures
COUNT=28 npm run check:upload   # what Lecture 1 actually asks for
```

It opens a real activity form on the live course, runs **the driver's own upload code** for that many pictures, asks Moodle which files the body's draft area now holds, and then abandons the form. Nothing is submitted, so the course is left as it was found; the instructor's editor preference is put back too.

This is the only honest test of this path. Nothing below the driver seam is unit tested — a fake of a YUI file picker would only ever agree with whatever this program already believed — and the check is what caught both bugs above and what proves a selector change still works. Each picture goes up under a name stamped with the run's timestamp, because Moodle hands the same draft area back for the whole of a session, and a file an earlier run left there would answer "yes, it arrived" for a run that never sent it.

## What goes up on a re-run: nothing that has not changed

Every picture carries **its own content hash** in the manifest, beside the URL the course served it at. A run compares the file on disk against that hash and sends only what differs.

This is decided from the manifest, above the driver seam, and it is what lets the plan say how many pictures a run would upload **before it uploads any**:

```
  update      Lecture 1 — Framing and decomposing work for a coding agent
              section: Lectures   source: lectures/lecture-1-framing.md   pictures: 1 of 28 to upload

  0 to create, 1 to update, 8 to skip, 0 to hide, 1 picture to upload.
```

Trusting a record rather than the course is safe here because of what the record is: written per document, as that document succeeded, from what the driver read off the published page. So an interrupted run leaves **no** record of the document it was in the middle of, and the next run sends that document's pictures again — the same recovery as everything else in this program, which is to run the same command.

A picture that is not sent is not thereby removed: opening the activity form puts the files it already holds back into the draft area, and saving keeps them. Every picture the body shows is still checked on the rendered page afterwards, sent or not, so a file that went missing in Moodle aborts the run rather than becoming a broken icon.

**A picture the record cannot vouch for republishes the document, whatever its text says.** A document's hash answers "is this the same document?"; it says nothing about whether the course ever received the drawings. An entry written before pictures were uploaded at all has a hash that matches to the byte and no pictures recorded against it, and skipping it would leave a page of broken icons that no later run ever repaired, because every later run would compare the same two matching hashes. So an entry whose recorded pictures do not cover every picture the document shows — none recorded, some recorded, or recorded without a hash by a run older than hashes — is an `update`, and the pictures it cannot vouch for go up.

The 2026 course's Manifest was in exactly that state when this was written. Lecture 1 is recorded there with no pictures at all, and the plan against it says:

```
0 to create, 3 to update, 6 to skip, 0 to hide, 28 pictures to upload.
```

The first real run after this change sends those 28. No run after it sends any.

**Two documents showing one picture still hold two copies.** They are two file areas, and the second copy is what keeps the lab working the day the lecture is deleted; issue #18 asks for one upload between them, and the only way to have it would be to point one document at the other activity's URL, which is the coupling this design refused. What is deduplicated is a picture shown twice in one document (one upload) and a picture already in an activity (no upload). Moodle's file picker does offer a "server files" repository that copies an existing file into another activity's draft area without sending the bytes again; if the size of a re-published pair ever matters, that is the thing to try, and it needs an attended run to confirm.

## What stops the run

A document naming a picture this repository does not hold **aborts before anything is written to the course** — during the plan, which is where publishing reads. The message names both halves of the fix: the document to open, and the path to put a file at. A reference that climbs out of the repository is the same case; there is nothing to upload either way.

This is the same shape as the cross-reference rules: a student should never meet a broken image icon, and finding out in front of a class is the outcome the plan exists to prevent.

## The attended run

Against a **scratch** course, never the real one:

```bash
npx playwright codegen --load-storage ~/.config/epf-moodle-publisher/session.json \
  https://moodle.epf.fr/course/view.php?id=<scratch course id>
```

What to publish: a scratch document with **one** picture in it — a markdown file with a single `![…](…)` and a catalog entry naming it. One picture, so that a step that went wrong is the step you are looking at. `npm run apply` against the scratch course, watching the browser, is the run.

Confirm each line:

- [ ] `/user/editor.php` offers `atto` as a value of `#id_preference_htmleditor` (if this Moodle's rich editor is TinyMCE rather than Atto, `RICH_EDITOR` in `selectors.ts` is wrong and every selector below it needs redoing)
- [ ] the page form's toolbar has an image button, and it opens a dialogue with a "Browse repositories…" button
- [ ] the file picker offers a repository that uploads from this machine, and its "Save as" field sets the stored name
- [ ] uploading a name that is already there offers **Overwrite**
- [ ] the picture lands in the **body's** draft area and not the Description's — `npm run check:upload` answers this one without publishing anything
- [ ] **dismissing Atto's image dialogue with `Escape` leaves the file in the draft area** — this is the assumption everything else hangs on. The driver never completes the dialogue: it wants the file, not the `<img>` Atto would insert. Upload, press Escape, save the activity, and check the activity's files in Moodle
- [ ] the toolbar's HTML button opens a source view — CodeMirror's on this site, the form's own textarea on a Moodle where that setting is off — and what is put in it is what gets saved
- [ ] the saved page renders the picture, and its `<img src>` is a `pluginfile.php` URL ending in the flattened name
- [ ] **updating the same activity leaves that URL working** — publish, edit the document's prose, publish again, and reload the page as a student
- [ ] running twice in a row leaves the course and the manifest unchanged
- [ ] **editing the prose of a document with a picture in it, and publishing again, uploads nothing** — the plan says `0 pictures to upload`, the run reports no upload, and the saved page still serves the picture. This is what makes re-publishing Lecture 1 cheap, and the thing it depends on is that an activity keeps its files when its text is rewritten

Record what you find here. A run that had to change a selector is worth a line saying which and why; that is what this file is for.

## The selectors

All of these live in `src/packages/course/lib/selectors.ts`. They are Atto's rather than core Moodle's, and a theme is free to have moved any of them — so each one is **required**: a missing control aborts the run naming the selector, rather than being skipped. A picture that quietly did not upload leaves a page whose reference resolves to nothing, which is the broken image icon this whole path exists to prevent.

| What | Selector |
| --- | --- |
| The body's editor, which every control below is looked for inside | `.editor_atto:has(#id_pageeditable)` |
| Image button on Atto's toolbar | `.atto_image_button, button[data-plugin='image']` |
| "Browse repositories…" | `button.openimagebrowser:visible` |
| HTML source button | `.atto_html_button, button[data-plugin='html']` |
| The body Atto edits, clicked to give the toolbar something to act on | `#id_pageeditable` |
| The source view that button opens | `.CodeMirror` |
| The file picker | `.file-picker:visible, .moodle-dialogue:visible .fp-repo-area` |
| One repository in its list | `.fp-repo` |
| The upload pane's file input | `input[type='file']` |
| "Save as" name | `.fp-saveas:visible input[type='text']` |
| Upload | `.fp-upload-btn:visible` |
| "Overwrite" | `button.fp-dlg-butoverwrite` |
| A dialogue still on screen | `.moodle-dialogue:visible` |

The `:visible` halves are not decoration. Each editor keeps its dialogues in the DOM whether they are open or not, so on this form every one of these selectors matches at least twice, and the first match is usually a dialogue nobody opened.

The upload pane is found by **what it holds** — a file input — rather than by the repository's name in the list beside it: that name is in whatever language the site is set to, and this one is French.

## One thing to expect

`lectures/lecture-1-framing.md` shows 28 pictures. Each is a dialogue, a picker, an upload and a dismissal, so publishing that one document the first time is a couple of minutes of watching a browser work. That is the price of a site with no token, and it is paid per picture that has actually changed: the second publish of that lecture uploads nothing at all, and does not even switch the editor to Atto.
