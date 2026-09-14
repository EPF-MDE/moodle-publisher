// Drives the picture upload against the live course, and never submits the
// form it drives it on.
//
// Nothing below the driver seam can be unit tested: the file picker is YUI
// dialogues on a themed Moodle behind SSO, and a fake of it would only ever
// agree with whatever this program already believed. So the check is this —
// open a real activity form, run the real upload through Atto for as many
// pictures as asked for, and ask Moodle itself which files the form's draft
// area now holds. The form is abandoned at the end, so the course is left
// exactly as it was found.
//
//     npm run check:upload          # three pictures
//     COUNT=28 npm run check:upload # what Lecture 1 actually asks for
//
// Green means every picture named went up, under the name the published HTML
// addresses it by, into the body's draft area rather than the Description's.
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { chromium } from "playwright";

import { readConfig } from "../src/config.ts";
import {
  fillRichBody,
  firstDifference,
  uploadImage,
} from "../src/packages/course/lib/atto-upload.ts";
import {
  RICH_EDITOR,
  SELECTORS,
} from "../src/packages/course/lib/selectors.ts";

/**
 * The pictures the check sends up: the first `COUNT` of the crash course's.
 *
 * Each is stored under a name carrying this run's stamp, and that is what
 * makes the check mean anything. Moodle hands the same draft area back for the
 * whole of a session, so a picture left there by an earlier run answers "yes,
 * it is in the body's draft area" for a run that in fact uploaded it into the
 * Description's. A name no earlier run can have used cannot be answered for.
 */
function fixtures(repoRoot: string, count: number, stamp: string) {
  const directory = resolve(repoRoot, "assets/crash-course");
  return readdirSync(directory)
    .filter((file) => file.endsWith(".png"))
    .sort()
    .slice(0, count)
    .map((file) => ({
      path: `assets/crash-course/${file}`,
      // Shaped like the flattened name the publisher stores a picture under —
      // one path segment, no directories — with the stamp in front of it.
      name: `check-${stamp}-assets-crash-course-${file}`,
      absolutePath: join(directory, file),
      contentHash: "",
    }));
}

const config = readConfig();
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const images = fixtures(
  config.repoRoot,
  Number(process.env["COUNT"] ?? 3),
  stamp
);

const browser = await chromium.launch({
  headless: process.env["HEADED"] !== "1",
});
const context = await browser.newContext({
  storageState: config.sessionStatePath,
});
const page = await context.newPage();

/**
 * The names Moodle holds in one of the form's draft areas, asked of Moodle
 * rather than read off the screen: the draft area is the thing that becomes
 * the activity's files when the form is submitted, and it is not rendered
 * anywhere on the form.
 */
async function draftFileNames(field: string): Promise<readonly string[]> {
  return page.evaluate(async (name: string) => {
    const itemid = document.querySelector<HTMLInputElement>(
      `input[name='${name}[itemid]']`
    )?.value;
    if (itemid === undefined) throw new Error(`no draft item id for ${name}`);
    const response = await fetch(
      "/repository/draftfiles_ajax.php?action=list",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          sesskey: (
            globalThis as unknown as { M: { cfg: { sesskey: string } } }
          ).M.cfg.sesskey,
          client_id: "check-image-upload",
          itemid,
          filepath: "/",
        }),
      }
    );
    const listed = (await response.json()) as { list?: { filename: string }[] };
    return (listed.list ?? []).map((file) => file.filename);
  }, field);
}

let failed = false;
let previousEditor: string | undefined;
try {
  // Atto, because the file picker is the editor's and the plain textarea has
  // none. Whatever the instructor had is put back at the end.
  await page.goto(new URL("/user/editor.php", config.baseUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  const preference = page.locator(SELECTORS.editorPreferenceSelect);
  previousEditor = await preference.inputValue();
  await preference.selectOption(RICH_EDITOR);
  await page.locator(SELECTORS.editorPreferenceSubmit).click();

  await page.goto(
    new URL(
      `/course/modedit.php?add=page&course=${config.courseId}&section=1`,
      config.baseUrl
    ).toString(),
    { waitUntil: "domcontentloaded" }
  );

  for (const [at, image] of images.entries()) {
    process.stdout.write(`${at + 1}/${images.length} ${image.name}\n`);
    await uploadImage(page, image);
  }

  // The other half of what these runs kept hitting: the body itself. It goes
  // in as HTML source, through a source view that is Atto's rather than the
  // form's, and a run that could not write it aborted saying the field was
  // "on the form but not showing".
  //
  // The prose carries `&quot;` and `&#39;` deliberately. Atto's source view is
  // a parser and a serialiser, so it hands those back decoded, and a run that
  // compared the raw strings called Lecture 1's real body corrupted and
  // stopped 339 characters short of publishing it.
  const body =
    `<h2>check:upload ${stamp}</h2>\n` +
    `<p>Someone asks <em>&quot;but what <strong>is</strong> the harness&quot;</em>, ` +
    `and that is the lecture&#39;s first picture.</p>\n` +
    images
      .map(
        (image) =>
          `<p><img src="@@PLUGINFILE@@/${image.name}" alt="${image.path}"></p>`
      )
      .join("\n");
  await fillRichBody(page, body, "writing the body");

  // And the guard still has teeth: markup that really is not the same markup
  // has to be reported, or the check above passes on a body Moodle mangled.
  const planted = await firstDifference(
    page,
    body,
    body.replace("</h2>", "</h2><p>Not what was rendered.</p>")
  );
  if (planted === undefined) {
    throw new Error(
      "the body read-back no longer notices a body that differs: it would " +
        "pass a document Moodle had rewritten on the way in."
    );
  }

  const held = await draftFileNames("page");
  const missing = images.filter((image) => !held.includes(image.name));
  if (missing.length > 0) {
    // Named individually: where a picture went is the whole question, and the
    // Description's draft area is where it goes when the toolbar clicked was
    // the wrong editor's.
    const strayed = (await draftFileNames("introeditor")).filter((name) =>
      name.startsWith(`check-${stamp}-`)
    );
    throw new Error(
      `${missing.length} picture(s) are not in the body's draft area: ` +
        `${missing.map((image) => image.name).join(", ")}. ` +
        `${strayed.length} of them went into the Description's instead.`
    );
  }
  process.stdout.write(
    `\nOK: all ${images.length} pictures are in the body's draft area, ` +
      `and the body that shows them is in the form field.\n`
  );
} catch (error) {
  failed = true;
  process.stderr.write(
    `\nFAILED: ${error instanceof Error ? error.message : String(error)}\n`
  );
} finally {
  if (previousEditor !== undefined && previousEditor !== RICH_EDITOR) {
    await page.goto(new URL("/user/editor.php", config.baseUrl).toString(), {
      waitUntil: "domcontentloaded",
    });
    await page
      .locator(SELECTORS.editorPreferenceSelect)
      .selectOption(previousEditor);
    await page.locator(SELECTORS.editorPreferenceSubmit).click();
  }
  await browser.close();
}
process.exit(failed ? 1 : 0);
