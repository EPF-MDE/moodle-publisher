// An entry point: the browser driver. This is the production path, because
// moodle.epf.fr authenticates through Office 365 and no web service token is
// obtainable. The browser is visible, always, and never runs in CI.
import { openBrowserCourse } from "./lib/browser-driver.ts";

import type { Options as BrowserDriverOptions } from "./lib/browser-driver.ts";
import type { CourseDriver } from "./index.ts";

/**
 * `baseUrl` and `courseId` come from the environment; `sessionStatePath` is
 * where Playwright's storage state lives, outside git and treated as a secret;
 * `runDir` is the timestamped directory that receives before/after screenshots,
 * created only if the run actually mutates something.
 */
export type { Options as BrowserDriverOptions } from "./lib/browser-driver.ts";

/**
 * Opens the configured Moodle course in a visible browser, reusing the
 * persisted session if it is still valid and asking the instructor to log in to
 * Microsoft by hand if it is not. The password is never read, stored or sent by
 * this tool: only Playwright's cookie/storage state is persisted.
 *
 * The driver aborts rather than half-writing if the browser is bounced to the
 * Microsoft login host mid-run, or if the course it lands in is not the
 * configured one.
 */
export function createBrowserDriver(
  options: BrowserDriverOptions
): Promise<CourseDriver> {
  return openBrowserCourse(options);
}
