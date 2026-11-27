// Implementation of the browser driver: private to the course package.
//
// Nothing below the driver seam is unit tested. This file is verified by the
// attended run against a scratch course, which is why every step it takes is
// visible on screen and captured to disk.
import { existsSync } from "node:fs";

import { chromium } from "playwright";
import type { Browser } from "playwright";

import { browserMissing } from "./browser-install.ts";

import type { CourseDriver, CourseSnapshot } from "../index.ts";

import { createActivityChecks } from "./browser-driver/activity-checks.ts";
import { createDevoirForm } from "./browser-driver/devoir-form-steps.ts";
import { createDevoirMethods } from "./browser-driver/devoir-methods.ts";
import { createFileResourceForm } from "./browser-driver/file-resource-form.ts";
import { createFileResourceMethods } from "./browser-driver/file-resource-methods.ts";
import { createFormFields } from "./browser-driver/form-fields.ts";
import { createMutations } from "./browser-driver/mutations.ts";
import { createLoginWatch, gotoCourse } from "./browser-driver/navigation.ts";
import type { DriverSession } from "./browser-driver/navigation.ts";
import type { Options } from "./browser-driver/options.ts";
import { readItems, readSections } from "./browser-driver/read-course.ts";
import { createRemovalMethods } from "./browser-driver/removal-methods.ts";
import { createSectionSteps } from "./browser-driver/section-steps.ts";
import {
  ensureSignedIn,
  persistSession,
  setEditorPreference,
} from "./browser-driver/sign-in.ts";

export type { Options } from "./browser-driver/options.ts";
export {
  BouncedToMicrosoftLogin,
  MoodleErrorPage,
  WrongCourse,
} from "./browser-driver/errors.ts";

export async function openBrowserCourse(
  options: Options
): Promise<CourseDriver> {
  if (process.env["CI"] !== undefined) {
    throw new Error(
      "Aborting: the browser driver is attended only and never runs in CI."
    );
  }

  // A missing browser names the publisher's command, not Playwright's: see
  // browser-install.ts.
  const browser: Browser = await chromium
    .launch({ headless: false })
    .catch((error: unknown) => {
      throw browserMissing(error) ?? error;
    });
  const context = await browser.newContext(
    existsSync(options.sessionStatePath)
      ? { storageState: options.sessionStatePath }
      : {}
  );
  const page = await context.newPage();
  const watch = createLoginWatch();

  // The watch is armed only once sign-in is done. The hand login navigates this
  // very page to the Microsoft host on purpose, and the latch never clears, so
  // arming it any earlier would make every run that actually logs in abort on
  // the login it was asked to perform.
  await ensureSignedIn(page, options);
  watch.watch(page);
  await persistSession(context, options.sessionStatePath);
  await gotoCourse(page, options, watch);

  const session: DriverSession = { page, options, watch };
  const mutations = createMutations(session);
  const { ensureSectionOn } = createSectionSteps(session, mutations);
  const fields = createFormFields(session);
  const steps = {
    ...mutations,
    ensureSectionOn,
    ...createActivityChecks(session),
    ...createDevoirForm(session, fields),
    ...createFileResourceForm(session, fields),
  };

  return {
    async snapshot(): Promise<CourseSnapshot> {
      await gotoCourse(page, options, watch);
      const sections = await readSections(page);
      const items = await readItems(page);
      return {
        courseId: options.courseId,
        sections: sections.map(({ number, name, visible }) => ({
          number,
          name,
          visible,
        })),
        items,
      };
    },

    ensureSection: ensureSectionOn,

    ...createRemovalMethods(session, steps),
    ...createFileResourceMethods(session, steps),
    ...createDevoirMethods(session, steps),

    async close(): Promise<void> {
      const previousEditor = mutations.previousEditor();
      // Closing must not throw over a run that otherwise succeeded, but a
      // preference left switched is the instructor's problem the next time they
      // edit anything by hand, so it is said out loud rather than swallowed.
      if (previousEditor !== undefined) {
        await setEditorPreference(
          page,
          options.baseUrl,
          previousEditor,
          watch
        ).catch((error: unknown) => {
          process.stderr.write(
            `Warning: could not restore your Moodle editor preference to "${previousEditor}". ` +
              `Set it back at ${new URL("/user/editor.php", options.baseUrl).toString()} ` +
              `(${error instanceof Error ? error.message : String(error)}).\n`
          );
          return undefined;
        });
      }
      await persistSession(context, options.sessionStatePath).catch(
        () => undefined
      );
      await browser.close();
    },
  };
}
