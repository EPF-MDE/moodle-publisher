import type { Page } from "playwright";

import { SELECTORS } from "../selectors.ts";

export class BouncedToMicrosoftLogin extends Error {
  constructor(url: string) {
    super(
      `Aborting: the browser was sent to the Microsoft login host (${url}). ` +
        `The session has expired. Re-run and log in by hand; nothing was written.`
    );
    this.name = "BouncedToMicrosoftLogin";
  }
}

export class WrongCourse extends Error {
  constructor(expected: string, found: string) {
    super(
      found === "unknown"
        ? `Aborting: the page carries no course identity, so it cannot be confirmed to be course ${expected}.`
        : `Aborting: the browser is in course ${found}, but the configured course is ${expected}.`
    );
    this.name = "WrongCourse";
  }
}

/**
 * Moodle answered with its error page where a form was expected.
 *
 * Worth a name of its own, because the guard that used to catch this said
 * something untrue: an error page renders outside any course, carrying
 * `course-1 context-1` in its body class, so {@link WrongCourse} read it as a
 * session that had wandered into another course and reported the browser as
 * being in course 1. It had not wandered anywhere — the activity it asked for
 * is gone. Quoting Moodle's own message and error code is what makes the
 * difference readable at the point the run stops.
 */
export class MoodleErrorPage extends Error {
  constructor(
    url: string,
    what: string,
    said: string,
    code: string | undefined
  ) {
    super(
      `Aborting: ${what} — ${url} is Moodle's error page, not the form. ` +
        `Moodle says${code === undefined ? "" : ` (${code})`}: "${said}". ` +
        `An activity that is no longer in the course is the usual cause; ` +
        `open the course in Moodle to see what it actually holds.`
    );
    this.name = "MoodleErrorPage";
  }
}

/**
 * Reads Moodle's error page, if that is what we are looking at.
 *
 * Called on the activity form, which is the one page this driver opens at an
 * id it was told rather than one it just read off the course — so it is the
 * one that can ask Moodle for something that is not there. The course check
 * would otherwise fail on the error page for the wrong reason, and send the
 * reader looking for a session problem they do not have.
 */
export async function assertNotMoodleError(page: Page, what: string): Promise<void> {
  const error = page.locator(SELECTORS.moodleErrorPage).first();
  if ((await error.count()) === 0) return;
  const said = (
    (await page
      .locator(SELECTORS.moodleErrorMessage)
      .first()
      .textContent()
      .catch(() => null)) ?? "no message on the page"
  ).trim();
  const href = await page
    .locator(SELECTORS.moodleErrorCode)
    .first()
    .getAttribute("href")
    .catch(() => null);
  const code = href?.split("/").pop();
  throw new MoodleErrorPage(page.url(), what, said, code || undefined);
}
