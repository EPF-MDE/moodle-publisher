import type { Locator } from "playwright";

import { required, uploadIntoFileManager } from "../file-upload.ts";
import { printPdf } from "../print-pdf.ts";
import { RESOURCE_DISPLAY_OPEN, SELECTORS } from "../selectors.ts";
import type {
  CourseItem,
  FileReplacement,
  NewFileResource,
} from "../../index.ts";
import { assertNotMoodleError } from "./errors.ts";
import type { FormFields } from "./form-fields.ts";
import { assertInConfiguredCourse, assertNotOnLoginHost } from "./navigation.ts";
import type { DriverSession } from "./navigation.ts";
import { readItems } from "./read-course.ts";
import { FILE_MANAGER_TIMEOUT_MS } from "./timeouts.ts";

/**
 * What is typed into the file resource form. Creating and replacing are the
 * same form, opened at a different URL, and a replace touches the file and the
 * name and nothing else: how it is displayed and who can see it are on the
 * create arm only.
 *
 * Written from the two seam types, as {@link DevoirForm} is, so that
 * visibility is unwritable on a replace rather than merely unwritten.
 */
type FileResourceForm =
  | ({ readonly kind: "create" } & Omit<NewFileResource, "section">)
  | ({ readonly kind: "replace" } & Omit<FileReplacement, "moduleId">);

/** Printing a PDF and putting it, alone, into a file resource's form. */
export function createFileResourceForm(
  session: DriverSession,
  fields: FormFields
) {
  const { page, options, watch } = session;
  const { writableField, saveAndReturnToCourse, selectPossiblyCollapsed } =
    fields;

  /**
   * The resource form's file manager, once it has listed what it holds.
   *
   * Waited for before anything is counted in it: the listing arrives after
   * the form, and a file manager read too early reads as empty — which on a
   * replace would leave the old file in place beside the new one.
   */
  async function loadedFileManager(what: string): Promise<Locator> {
    const manager = await required(page, SELECTORS.resourceFiles, what);
    await required(
      manager,
      SELECTORS.fileManagerIdle,
      what,
      FILE_MANAGER_TIMEOUT_MS
    );
    return manager;
  }

  /**
   * Waits until the file manager has finished a fetch and lists fewer than
   * `held` files. Neither alone will do: a redraw empties the listing before
   * it refills it, and the manager is idle for a moment before the fetch a
   * delete starts.
   */
  async function listsFewerThan(
    manager: Locator,
    held: number
  ): Promise<boolean> {
    const idle = manager.locator(SELECTORS.fileManagerIdle);
    const files = manager.locator(SELECTORS.fileManagerFile);
    const deadline = Date.now() + FILE_MANAGER_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if ((await idle.count()) > 0 && (await files.count()) < held) {
        return true;
      }
      await page.waitForTimeout(250);
    }
    return false;
  }

  /**
   * Deletes every file the file manager holds, one at a time, each through
   * the dialogue the file opens and the confirmation behind it.
   *
   * Delete-then-upload rather than an upload over the top: Moodle only offers
   * to overwrite a file of the same name, and a replacement under a new name
   * would leave the resource holding two.
   */
  async function emptyFileManager(
    manager: Locator,
    what: string
  ): Promise<void> {
    const files = manager.locator(SELECTORS.fileManagerFile);
    for (let held = await files.count(); held > 0; held -= 1) {
      await files.first().click();
      await (await required(page, SELECTORS.fileManagerDelete, what)).click();
      await (await required(page, SELECTORS.fileManagerConfirm, what)).click();
      if (!(await listsFewerThan(manager, held))) {
        throw new Error(
          `Aborting: ${what} — deleted a file from the resource form and the file ` +
            `manager still lists ${held}. Nothing was submitted. Confirm the file ` +
            `manager's controls in an attended codegen session.`
        );
      }
    }
  }

  /**
   * Requires the file manager to hold `fileName` and nothing else before the
   * form is submitted. The resource is exactly its one file: a second one
   * beside it, or the upload stored under another name, is what a Student
   * would open instead.
   */
  async function assertHoldsOnly(
    manager: Locator,
    fileName: string,
    what: string
  ): Promise<void> {
    const names = manager.locator(SELECTORS.fileManagerFileName);
    await names
      .filter({ hasText: fileName })
      .first()
      .waitFor({ state: "attached", timeout: FILE_MANAGER_TIMEOUT_MS })
      .catch(() => undefined);
    const held = (await names.allTextContents()).map((name) => name.trim());
    if (held.length !== 1 || held[0] !== fileName) {
      const listed =
        held.length === 0
          ? "nothing"
          : held.map((name) => `"${name}"`).join(", ");
      throw new Error(
        `Aborting: ${what} — after the upload the file manager holds ${listed}, ` +
          `not "${fileName}" alone. Nothing was submitted. Check the resource's ` +
          `files in Moodle, and the file manager's selectors.`
      );
    }
  }

  /**
   * Prints the HTML, opens the file resource form, puts the PDF in its file
   * manager in place of whatever was there, and saves it.
   *
   * The PDF is printed before the form is opened, so a document that cannot
   * be printed writes nothing. The file manager is checked to hold exactly
   * the new file before the form is submitted, because what Moodle saves is
   * whatever the draft area holds at that moment.
   */
  async function submitFileResourceForm(
    formUrl: string,
    fields: FileResourceForm,
    what: string
  ): Promise<readonly CourseItem[]> {
    const pdf = await printPdf(fields.html);
    await page.goto(formUrl, { waitUntil: "domcontentloaded" });
    assertNotOnLoginHost(page, watch);
    await assertNotMoodleError(page, `opening the resource form: ${what}`);
    await assertInConfiguredCourse(page, options);

    await page.locator(SELECTORS.activityName).fill(fields.name);
    const manager = await loadedFileManager(what);
    await emptyFileManager(manager, what);
    await uploadIntoFileManager(
      page,
      manager,
      { name: fields.fileName, mimeType: "application/pdf", buffer: pdf },
      what
    );
    await assertHoldsOnly(manager, fields.fileName, what);

    // How it opens and who can see it: decided once, when it is created. Not
    // reached from a replace, which carries neither.
    if (fields.kind === "create") {
      const display = await writableField(
        SELECTORS.resourceDisplay,
        what,
        "the PDF cannot be set to open in the browser"
      );
      await display.selectOption(RESOURCE_DISPLAY_OPEN);
      await selectPossiblyCollapsed(
        SELECTORS.activityVisible,
        fields.visible ? "1" : "0",
        `${what} ${fields.visible ? "visible" : "hidden"}`
      );
    }

    await saveAndReturnToCourse(what);
    assertNotOnLoginHost(page, watch);
    await assertInConfiguredCourse(page, options);
    return readItems(page);
  }

  return { submitFileResourceForm };
}

export type FileResourceFormSteps = ReturnType<typeof createFileResourceForm>;
