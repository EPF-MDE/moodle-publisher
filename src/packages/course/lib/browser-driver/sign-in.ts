import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { BrowserContext, Page } from "playwright";

import { SELECTORS } from "../selectors.ts";
import { assertNotOnLoginHost, courseUrl } from "./navigation.ts";
import type { LoginWatch } from "./navigation.ts";
import type { Options } from "./options.ts";
import { LOGIN_TIMEOUT_MS } from "./timeouts.ts";

/**
 * Reuses the persisted session if it still works; otherwise hands the browser
 * to the instructor for one hand-typed Microsoft login and persists the
 * resulting cookies. The tool never sees the password.
 *
 * The wait is for Moodle itself, not merely for "somewhere that is not the
 * Microsoft login host". A real Office 365 sign-in can hop through an
 * intermediate identity host and come back, and treating the first such hop as
 * "signed in" would arm the bounce latch mid-login — aborting the run on the
 * login it just asked for.
 */
export async function ensureSignedIn(page: Page, options: Options): Promise<void> {
  await page.goto(courseUrl(options.baseUrl, options.courseId), {
    waitUntil: "domcontentloaded",
  });
  const moodleHost = new URL(options.baseUrl).host;
  if (new URL(page.url()).host === moodleHost) {
    await page
      .locator(SELECTORS.loggedIn)
      .first()
      .waitFor({ state: "attached" });
    return;
  }

  process.stderr.write(
    "\nMicrosoft login required. Log in in the browser window that just opened;\n" +
      "this tool never reads, stores or transmits your EPF password.\n" +
      "Waiting for the course page…\n\n"
  );
  await page.waitForURL((url) => url.host === moodleHost, {
    timeout: LOGIN_TIMEOUT_MS,
  });
  // Back on Moodle, but Moodle can serve its own "you are not logged in" page:
  // the run only proceeds once the page says a user is signed in.
  await page.locator(SELECTORS.loggedIn).first().waitFor({ state: "attached" });
}

export async function persistSession(
  context: BrowserContext,
  path: string
): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  await context.storageState({ path });
}

/**
 * Sets the instructor's editor preference and returns the value it had before.
 *
 * Both the switch to plain text and the restore afterwards are this one
 * operation, so the form is driven in exactly one place. If the control cannot
 * be found we abort: filling a rich editor's hidden textarea silently produces
 * an activity whose body is wrong, which is worse than not publishing.
 */
export async function setEditorPreference(
  page: Page,
  baseUrl: string,
  value: string,
  watch: LoginWatch
): Promise<string | undefined> {
  await page.goto(new URL("/user/editor.php", baseUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  assertNotOnLoginHost(page, watch);

  const select = page.locator(SELECTORS.editorPreferenceSelect);
  if ((await select.count()) === 0) {
    throw new Error(
      `Aborting: the editor preference control (${SELECTORS.editorPreferenceSelect}) was not ` +
        `found at /user/editor.php, so HTML cannot be entered as source. Confirm the selector ` +
        `in an attended codegen session (see the publisher's README.md).`
    );
  }

  const previous = await select.inputValue();
  if (previous === value) return undefined;
  await select.selectOption(value);
  await page.locator(SELECTORS.editorPreferenceSubmit).click();
  await page.waitForLoadState("domcontentloaded");

  // The preference is read back rather than assumed from a load state, because
  // the next thing that happens is a Devoir's description being filled on the
  // strength of it. A silent no-op here produces a description that is wrong.
  await page.goto(new URL("/user/editor.php", baseUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  const saved = await page
    .locator(SELECTORS.editorPreferenceSelect)
    .inputValue();
  if (saved !== value) {
    throw new Error(
      `Aborting: the editor preference did not take — it is still "${saved}" after ` +
        `setting it to "${value}". Confirm the form at /user/editor.php in an attended ` +
        `codegen session (see the publisher's README.md).`
    );
  }
  return previous;
}
