// Implementation: private to the course package, and to the browser driver
// within it.
//
// Getting a file into Moodle: a file resource's PDF through the form's file
// manager, the file picker behind it, and the thing that goes wrong there —
// asking the page a question before it can have an answer.
//
// Like the driver it serves, nothing here is unit tested. It is verified
// against a scratch course by `npm run check:file-resource`, which drives the
// driver's file resource operations in an attended run.
import type { Locator, Page } from "playwright";

import { SELECTORS } from "./selectors.ts";

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
 * A theme is free to have moved any control on a form. A missing one has to
 * stop the run rather than be skipped: a file that quietly did not upload
 * leaves a resource holding nothing, or holding last week's PDF.
 */
export async function required(
  scope: Locator | Page,
  selector: string,
  what: string,
  timeout: number = DIALOGUE_TIMEOUT_MS
): Promise<Locator> {
  const found = scope.locator(selector);
  // Waited for, not asked about once. Most controls here belong to a
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
        `that has moved or replaced Moodle's controls. Confirm the selectors with ` +
        `an attended run (npm run check:file-resource).`
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
      `this site, and the selectors, with an attended run ` +
      `(npm run check:file-resource).`
  );
}

/**
 * Presses `button` until Moodle's file picker is on screen.
 *
 * Pressed more than once because the first press of a run can land on a
 * button that does not do anything yet: the picker is a JavaScript module the
 * page fetches after it has rendered, and until it has arrived the button is
 * a button with nothing bound to it. A click then takes the focus and nothing
 * else — no picker after ten seconds. Later uploads never see it, because by
 * then the module is loaded, which is why this cannot be caught by a check
 * run against a warm session.
 *
 * Pressing again is safe: the button is behind the picker once the picker is
 * up, so there is no second press to make once the wait has been satisfied.
 * The button is looked up afresh on each press.
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
      `Confirm the picker with an attended run (npm run check:file-resource).`
  );
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
  const input = await openUploadPane(page, what);
  await input.setInputFiles(file);
  // The name the file is stored under is the publisher's, not whatever the
  // picker would make of the bytes: it is what a Student's download is called.
  await (
    await required(page, SELECTORS.filePickerSaveAs, what)
  ).fill(file.name);
  await (await required(page, SELECTORS.filePickerUploadButton, what)).click();

  // Only the dialogue's absence is swallowed. A click that failed is not the
  // same thing as a question that was never asked, and taking it for one
  // would leave the old file in the resource while the run went on reporting
  // the new one published.
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
 * An open dialogue lays a mask over the form, so the submit button behind it
 * is not clickable — which is a thirty-second wait ending in a timeout, not a
 * message naming the file, and the whole document is then unpublished.
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
      `close it, and it covers the form behind it. Confirm the dialogue's controls ` +
      `with an attended run (npm run check:file-resource).`
  );
}
