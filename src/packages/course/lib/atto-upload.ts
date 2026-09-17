// Implementation: private to the course package, and to the browser driver
// within it.
//
// Getting a file into Moodle: a picture through Atto's image dialogue, a file
// resource's PDF through the form's file manager, the file picker behind both,
// and the two things that go wrong there. Both are the same mistake made
// twice — asking the page a question before it can have an answer, and asking
// it of the whole page when the form carries two rich editors.
//
// Like the driver it serves, nothing here is unit tested. It is verified
// against the live course by `npm run check:upload`, which drives these very
// functions and never submits the form it drives them on.
import type { Locator, Page } from "playwright";

import { SELECTORS } from "./selectors.ts";

import type { PageImage } from "../index.ts";

/**
 * How long a dialogue gets to appear before the driver stops waiting for it.
 *
 * Short, because every wait of this length is also the wait for a dialogue
 * that will never appear — Moodle only asks about overwriting a file when
 * there is one to overwrite.
 */
const DIALOGUE_TIMEOUT_MS = 5 * 1000;

/**
 * How long one file-picker repository gets to show its pane.
 *
 * Longer than a dialogue: the pane is fetched from the site, and one of these
 * repositories is a remote drive. It is also spent once per repository the
 * upload pane is not behind, so it is not spent lightly.
 */
const PANE_TIMEOUT_MS = 10 * 1000;

/** How many times a dialogue is asked to close before the run gives up. */
const DISMISS_ATTEMPTS = 10;

/** How many times the picker's button is pressed before the run gives up. */
const BROWSE_ATTEMPTS = 5;

/**
 * The one control this step cannot do without, or an abort naming it.
 *
 * Every selector this module uses is Atto's rather than core Moodle's, and
 * a theme is free to have moved any of them. A missing one has to stop the
 * run rather than be skipped: a picture that quietly did not upload leaves a
 * page whose reference resolves to nothing, which is the broken image icon
 * this whole path exists to prevent.
 */
export async function required(
  scope: Locator | Page,
  selector: string,
  what: string,
  timeout: number = DIALOGUE_TIMEOUT_MS
): Promise<Locator> {
  const found = scope.locator(selector);
  // Waited for, not asked about once. Every control here belongs to a
  // dialogue YUI builds after the click that asks for it, and counting the
  // page's nodes is the one thing Playwright does not wait for — so the
  // question was being put a tenth of a second before the answer existed,
  // and the abort below fired on a control that was about to appear. The
  // selectors are `:visible` ones, so waiting to be attached is waiting to
  // be on screen.
  await found
    .first()
    .waitFor({ state: "attached", timeout })
    .catch(() => {});
  if ((await found.count()) === 0) {
    throw new Error(
      `Aborting: ${what} — no "${selector}" on the page. That is usually a theme ` +
        `that has moved or replaced Atto's controls. Confirm the selectors in an ` +
        `attended codegen session (see docs/uploading-images.md).`
    );
  }
  return found.first();
}

/**
 * Puts Moodle's file picker on its "upload a file" pane.
 *
 * The pane is found by what it holds — a file input — rather than by the
 * repository's name in the list beside it, because that name is in whatever
 * language the site is set to, and this one is French.
 */
async function openUploadPane(
  page: Page,
  what: string
): Promise<Locator> {
  // The longer wait: the picker's panes come from the site, not from markup
  // already on the page, and a slow answer here aborts the whole document.
  const picker = await required(
    page,
    SELECTORS.filePicker,
    what,
    PANE_TIMEOUT_MS
  );
  const input = picker.locator(SELECTORS.filePickerUploadInput);
  const repositories = picker.locator(SELECTORS.filePickerRepository);
  const count = await repositories.count();
  // From -1, which is the pane the picker opened on: it may already be the
  // upload one, and clicking a repository we are on reloads it for nothing.
  for (let at = -1; at < count; at += 1) {
    if (at >= 0) {
      await repositories.nth(at).click();
    }
    // Waited for: clicking a repository fetches its pane, so asking straight
    // away is asking before it can have arrived. Every repository answered
    // "no file input here", the loop ran out, and the abort blamed a Moodle
    // that in fact offers one.
    const shown = await input
      .first()
      .waitFor({ state: "visible", timeout: PANE_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    if (shown) return input.first();
  }
  throw new Error(
    `Aborting: ${what} — none of this Moodle's ${count} file-picker repositories ` +
      `offers a file to upload from this machine. Check the repositories enabled for ` +
      `this site, and the selectors, in an attended session ` +
      `(see docs/uploading-images.md).`
  );
}

/**
 * Presses `button` until Moodle's file picker is on screen.
 *
 * Pressed more than once because the first press of a run can land on a
 * button that does not do anything yet: the picker is a JavaScript module the
 * page fetches after it has rendered, and until it has arrived the button is
 * a button with nothing bound to it. A click then takes the focus and nothing
 * else — which is exactly what the run that made this necessary captured, a
 * dialogue open, the button focused, and no picker after ten seconds. Later
 * pictures never see it, because by then the module is loaded, which is why
 * this cannot be caught by a check run against a warm session.
 *
 * Pressing again is safe: the button is behind the picker once the picker is
 * up, so there is no second press to make once the wait has been satisfied.
 * The button is looked up afresh on each press, because it is Atto's
 * "Browse repositories…" for a picture and the file manager's "Ajouter…" for
 * a file resource.
 */
async function openPicker(
  page: Page,
  button: () => Promise<Locator>,
  what: string
): Promise<void> {
  const picker = page.locator(SELECTORS.filePicker);
  for (let attempt = 0; attempt < BROWSE_ATTEMPTS; attempt += 1) {
    await (await button()).click();
    const opened = await picker
      .first()
      .waitFor({ state: "visible", timeout: PANE_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    if (opened) return;
  }
  throw new Error(
    `Aborting: ${what} — Moodle's file picker did not open after pressing its ` +
      `button ${BROWSE_ATTEMPTS} times, ` +
      `${(BROWSE_ATTEMPTS * PANE_TIMEOUT_MS) / 1000} seconds apart in all. ` +
      `Confirm the picker in an attended codegen session ` +
      `(see docs/uploading-images.md).`
  );
}

/**
 * Uploads one picture into the draft file area of the activity form on
 * screen, under the name the HTML addresses it by.
 *
 * The dialogue is dismissed rather than completed. Atto's image dialogue
 * would insert an `<img>` of its own into the rich area, and the body is
 * about to be replaced wholesale with the HTML this program rendered; what
 * the upload is for is the file, which the picker has already put in the
 * draft area by the time the dialogue is closed.
 */
export async function uploadImage(page: Page, image: PageImage): Promise<void> {
  const what = `uploading "${image.path}" for "${image.name}"`;
  const editor = await required(page, SELECTORS.attoBodyEditor, what);
  await (await required(editor, SELECTORS.attoImageButton, what)).click();
  await openPicker(
    page,
    () => required(page, SELECTORS.attoBrowseRepositories, what),
    what
  );
  await sendThroughPicker(page, image.absolutePath, image.name, what);
}

/**
 * Uploads one file into the file manager of the activity form on screen —
 * the resource form's, which is where a file resource's PDF goes.
 *
 * The bytes are handed to the file input as they are, under `name`: a PDF
 * printed a moment ago has no reason to be written to disk first.
 */
export async function uploadIntoFileManager(
  page: Page,
  manager: Locator,
  file: { readonly name: string; readonly mimeType: string; readonly buffer: Buffer },
  what: string
): Promise<void> {
  await openPicker(
    page,
    () => required(manager, SELECTORS.fileManagerAdd, what),
    what
  );
  await sendThroughPicker(page, file, file.name, what);
}

/**
 * The upload pane, the file, the name it is stored under, and whatever the
 * picker asks afterwards: everything after the picker is open, which is the
 * same whichever button opened it.
 */
async function sendThroughPicker(
  page: Page,
  file: Parameters<Locator["setInputFiles"]>[0],
  storedAs: string,
  what: string
): Promise<void> {
  const input = await openUploadPane(page, what);
  await input.setInputFiles(file);
  // The name the file is stored under is the publisher's, not the disk's:
  // two pictures in one document may share a file name, and the second would
  // otherwise land on top of the first. Required, like every other control
  // here — a picture that went up under its own name is one every
  // `@@PLUGINFILE@@` reference to it then resolves to nothing.
  await (
    await required(page, SELECTORS.filePickerSaveAs, what)
  ).fill(storedAs);
  await (await required(page, SELECTORS.filePickerUploadButton, what)).click();

  // Asked on every re-publish rather than as an edge case: opening the form
  // puts the activity's existing files back into the draft area, so a
  // picture that has not changed is always uploaded over itself.
  // Only the dialogue's absence is swallowed. A click that failed is not the
  // same thing as a question that was never asked, and taking it for one
  // would leave the old picture in the activity while the run went on
  // reporting the new one published.
  const overwrite = page.locator(SELECTORS.filePickerOverwrite).first();
  const asked = await overwrite
    .waitFor({ state: "visible", timeout: DIALOGUE_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (asked) await overwrite.click();

  await dismissDialogues(page, what);
}

/**
 * Closes every dialogue the upload opened, and confirms they are gone.
 *
 * One `Escape` is not enough: the picker and Atto's image dialogue are two
 * dialogues, and dismissing the picker leaves the image one up. It lays a
 * mask over the toolbar, so the next picture's button is not clickable —
 * which is a thirty-second wait ending in a timeout, not a message naming
 * the picture, and the whole document is then unpublished.
 */
async function dismissDialogues(page: Page, what: string): Promise<void> {
  const open = page.locator(SELECTORS.openDialogue);
  for (let attempt = 0; attempt < DISMISS_ATTEMPTS; attempt += 1) {
    if ((await open.count()) === 0) return;
    await page.keyboard.press("Escape");
    await open
      .last()
      .waitFor({ state: "hidden", timeout: DIALOGUE_TIMEOUT_MS })
      .catch(() => {});
  }
  throw new Error(
    `Aborting: ${what} — a dialogue is still open after ${DISMISS_ATTEMPTS} attempts to ` +
      `close it, and it covers the toolbar the next picture is uploaded through. ` +
      `Confirm the dialogue's controls in an attended session ` +
      `(see docs/uploading-images.md).`
  );
}

/**
 * Writes the rendered HTML into the body, through Atto's own source view.
 *
 * Atto is only on the form because the file picker is, and the body still goes
 * in as source — but the source is not the form's textarea. This site runs the
 * HTML plugin with CodeMirror, so the textarea stays hidden and what is on
 * screen is CodeMirror's own editor; a run that filled the textarea aborted
 * saying the source field was "on the form but not showing", which read like a
 * theme problem and was not one.
 *
 * The value is set and then read back off the form field, because everything
 * between the two is Atto's: the toggle back to the rich view, its own
 * cleaning of the markup, and the sync into the field that is actually
 * submitted. A body that did not arrive there is a page published empty, and
 * that is worth one more question to the page.
 */
export async function fillRichBody(
  page: Page,
  html: string,
  what: string
): Promise<void> {
  const editor = await required(page, SELECTORS.attoBodyEditor, what);
  // Clicked first: the toolbar acts on the editor with the caret in it, and
  // without that the HTML button is pressed to no effect at all.
  await (await required(editor, SELECTORS.attoBodyEditable, what)).click();
  const htmlButton = await required(editor, SELECTORS.attoHtmlButton, what);
  await htmlButton.click();

  const source = await required(page, SELECTORS.attoSourceView, what);
  await source.evaluate((node, value) => {
    const editing = (
      node as HTMLElement & { CodeMirror?: { setValue: (of: string) => void } }
    ).CodeMirror;
    if (editing === undefined) throw new Error("no source editor on the view");
    editing.setValue(value);
  }, html);

  // Back to the rich view: that is the toggle Atto syncs the source through,
  // and leaving the form in source view is not what a human would hand in.
  await htmlButton.click();

  const stored = await (
    await required(page, SELECTORS.activityContentTextarea, what)
  ).inputValue();
  const difference = await firstDifference(page, html, stored);
  if (difference !== undefined) {
    throw new Error(
      `Aborting: ${what} — the body was written into Atto's source view and the form ` +
        `field came back with markup that is not what was rendered. ` +
        `${stored.length} characters instead of ${html.length}, first differing at ` +
        `${difference.at}:\n  rendered: ${difference.rendered}\n  stored:   ${difference.stored}\n` +
        `Publishing now would save something other than what was rendered ` +
        `(see docs/uploading-images.md).`
    );
  }
}

/**
 * Where the body Atto handed back stops being the body that went in, or
 * `undefined` when the two are the same markup.
 *
 * Compared as markup rather than as text, because Atto's source view is a
 * parser and a serialiser and not a box the string comes back out of: it hands
 * back `"` where the renderer wrote `&quot;`, and `'` for `&#39;`. Those are
 * the same document — 339 characters of difference across Lecture 1, and not
 * one of them a character a student would see — and comparing the raw strings
 * called it a corrupted body and stopped the run.
 *
 * The canonical form is the browser's own: both sides are parsed and
 * re-serialised by the page that is about to submit one of them, so whatever
 * this browser does to entities it does to both. What is left is a real
 * difference, and the run still stops on it, now saying where.
 */
export async function firstDifference(
  page: Page,
  rendered: string,
  stored: string
): Promise<{ at: number; rendered: string; stored: string } | undefined> {
  return page.evaluate(
    ([a, b]: [string, string]) => {
      const canonical = (markup: string): string => {
        const holder = document.createElement("div");
        holder.innerHTML = markup;
        return holder.innerHTML.trim();
      };
      const left = canonical(a);
      const right = canonical(b);
      if (left === right) return undefined;
      let at = 0;
      while (at < left.length && at < right.length && left[at] === right[at]) {
        at += 1;
      }
      // Enough either side of the divergence to recognise the element it is
      // in, which is what a reader needs to say whether it matters.
      const around = (of: string) => of.slice(Math.max(0, at - 40), at + 80);
      return { at, rendered: around(left), stored: around(right) };
    },
    [rendered, stored] as [string, string]
  );
}
