import type { Page } from "playwright";

import { MICROSOFT_LOGIN_HOST } from "../selectors.ts";
import { BouncedToMicrosoftLogin, WrongCourse } from "./errors.ts";
import type { Options } from "./options.ts";
import {
  TABLE_APPEARS_TIMEOUT_MS,
  TABLE_PAGE_TIMEOUT_MS,
} from "./timeouts.ts";

export function courseUrl(baseUrl: string, courseId: string): string {
  return new URL(`/course/view.php?id=${courseId}`, baseUrl).toString();
}

/**
 * A bounce to Microsoft can happen at any navigation, including one we did not
 * initiate. Latching it means the very next thing the driver does aborts,
 * rather than the run continuing until it happens to look.
 */
export interface LoginWatch {
  readonly bouncedTo: () => string | undefined;
  readonly watch: (page: Page) => void;
}

export function createLoginWatch(): LoginWatch {
  let bounced: string | undefined;
  return {
    bouncedTo: () => bounced,
    watch(page: Page) {
      page.on("framenavigated", (frame) => {
        if (
          frame === page.mainFrame() &&
          new URL(frame.url()).host.includes(MICROSOFT_LOGIN_HOST)
        ) {
          bounced ??= frame.url();
        }
      });
    },
  };
}

export function assertNotOnLoginHost(page: Page, watch: LoginWatch): void {
  const bounced = watch.bouncedTo();
  if (bounced !== undefined) throw new BouncedToMicrosoftLogin(bounced);
  if (new URL(page.url()).host.includes(MICROSOFT_LOGIN_HOST)) {
    throw new BouncedToMicrosoftLogin(page.url());
  }
}

/**
 * Every page of a paged Moodle table, in turn.
 *
 * A Devoir's grading table is read this way, for the count that guards a
 * delete, and the walk has three properties. Every page is visited, because a
 * reading that stopped at the first twenty rows understates what is about to
 * be deleted. Paging is followed by the
 * links the table itself renders, never by a page number this program
 * constructs, so a table that pages differently is followed rather than guessed
 * at. And a page whose table could not be found stops the walk: an empty table
 * and a page this failed to read are indistinguishable from out here, so it
 * refuses instead of calling either one empty.
 *
 * What each table's rows *mean* is the caller's, in `take`; this reads pages.
 */
export async function eachPageOf<
  Read extends { readonly understood: boolean; readonly links: string[] },
>(
  page: Page,
  watch: LoginWatch,
  start: string,
  /**
   * The table being read, waited for before the page is read. See
   * {@link TABLE_APPEARS_TIMEOUT_MS}: some of these arrive after the load
   * does, and reading too early looks exactly like a page this did not
   * understand. Waiting here and not in each `readPage` keeps the two in step
   * — the selector waited for is the selector read.
   */
  appears: string,
  readPage: () => Promise<Read>,
  cannotRead: (url: string) => string,
  take: (read: Read) => void
): Promise<void> {
  const visited = new Set<string>();
  let next: string | undefined = start;

  while (next !== undefined) {
    const url: string = next;
    visited.add(url);
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: TABLE_PAGE_TIMEOUT_MS,
    });
    assertNotOnLoginHost(page, watch);

    // Swallowed on purpose: a table that never appears is reported by
    // `cannotRead` below, which names the page and says what could not be
    // established. A Playwright timeout here would replace that with a stack
    // trace about a selector.
    await page
      .waitForSelector(appears, {
        state: "attached",
        timeout: TABLE_APPEARS_TIMEOUT_MS,
      })
      .catch(() => undefined);

    const read = await readPage();
    if (!read.understood) throw new Error(cannotRead(url));
    take(read);
    next = read.links.find((link) => !visited.has(link));
  }
}

/**
 * The course the browser is actually looking at, read from the page itself.
 *
 * It deliberately does not fall back to the id in the URL: that is the id we
 * asked for, so comparing it to the configured one would compare a value to
 * itself and could never fail. When the page carries no course identity at all
 * we abort rather than assume, because the point of the check is that a stray
 * session must not be able to edit another course the instructor teaches.
 */
async function courseIdInBrowser(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const fromBodyClass = /(?:^|\s)course-(\d+)(?:\s|$)/.exec(
      document.body.className
    );
    if (fromBodyClass?.[1] !== undefined) return fromBodyClass[1];
    const field = document.querySelector<HTMLInputElement>(
      "input[name='courseid'], input[name='course']"
    );
    if (field?.value) return field.value;
    const withData = document.querySelector("[data-courseid]");
    return withData?.getAttribute("data-courseid") ?? undefined;
  });
}

export async function gotoCourse(
  page: Page,
  options: Options,
  watch: LoginWatch
): Promise<void> {
  await page.goto(courseUrl(options.baseUrl, options.courseId), {
    waitUntil: "domcontentloaded",
  });
  assertNotOnLoginHost(page, watch);
  await assertInConfiguredCourse(page, options);
}

export async function assertInConfiguredCourse(
  page: Page,
  options: Options
): Promise<void> {
  const found = await courseIdInBrowser(page);
  if (found !== options.courseId) {
    throw new WrongCourse(options.courseId, found ?? "unknown");
  }
}

/** What every step of one open driver works on: its page, course and watch. */
export interface DriverSession {
  readonly page: Page;
  readonly options: Options;
  readonly watch: LoginWatch;
}
