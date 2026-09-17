// Implementation of the browser driver: private to the course package.
//
// Nothing below the driver seam is unit tested. This file is verified by the
// attended run against a scratch course, which is why every step it takes is
// visible on screen and captured to disk.
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { chromium } from "playwright";
import type { Browser, BrowserContext, Locator, Page } from "playwright";

import {
  fillRichBody,
  required,
  uploadImage,
  uploadIntoFileManager,
} from "./atto-upload.ts";
import { browserMissing } from "./browser-install.ts";
import { printPdf } from "./print-pdf.ts";
import { createRunRecorder } from "./run-recorder.ts";
import type { RunRecorder } from "./run-recorder.ts";
import {
  MICROSOFT_LOGIN_HOST,
  PLAIN_TEXT_EDITOR,
  RESOURCE_DISPLAY_OPEN,
  RICH_EDITOR,
  SELECTORS,
} from "./selectors.ts";

import { DELIVERABLE_SECTION, PLUGINFILE_PREFIX } from "../index.ts";

import {
  readSections as readSectionMarkup,
  sectionAddedBy,
} from "../sections.ts";
import type { ReadSection } from "../sections.ts";
import {
  activityAddedBy,
  readActivityVisibility,
  readsAsDevoir,
  readsAsHoldingSubmissions,
} from "../activities.ts";
import {
  DEVOIR_SUBMISSION_FIELDS,
  FREEZE_ZONE,
  devoirDateFields,
} from "../devoir-form.ts";
import type {
  DevoirDateField,
  DevoirSubmissionField,
} from "../devoir-form.ts";
import type {
  CourseDriver,
  CourseItem,
  CourseSnapshot,
  CreatedDevoir,
  CreatedFileResource,
  CreatedPage,
  DevoirUpdate,
  FileReplacement,
  NewDevoir,
  NewFileResource,
  NewPage,
  PageImage,
  PageUpdate,
  PublishedAsset,
  SectionName,
  SectionOutcome,
} from "../index.ts";

/** The driver's options, re-exported by `browser.ts` as its public type. */
export interface Options {
  readonly baseUrl: string;
  readonly courseId: string;
  readonly sessionStatePath: string;
  readonly runDir: string;
}

/** How long the instructor gets to complete the Microsoft login by hand. */
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * How long one page of a table may take to arrive.
 *
 * Playwright's default is thirty seconds, and the grading table of a Devoir the
 * whole cohort has handed into is the slowest page this program opens: Moodle
 * renders every Student, their status and their online text in one go, and on a
 * teaching afternoon it takes longer than that. A timeout there reads like a
 * broken run when what happened is that a slow page was given a desktop's
 * patience instead of a test's. Generous rather than absent: a page that never arrives still stops.
 */
const TABLE_PAGE_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * How long a table that the page renders *after* it loads is waited for.
 *
 * Moodle 4 renders some of its tables that way: the page arrives with its
 * filters and its heading and no table at all, and fetches the rows over AJAX
 * a moment later. Read at `domcontentloaded` it is a page with no table on it —
 * which is indistinguishable, from out here, from a page this program failed
 * to understand, so a run would abort over a table that was merely still on
 * its way.
 *
 * Shorter than {@link TABLE_PAGE_TIMEOUT_MS} because nothing is being
 * downloaded by then: the page is in the browser and this is waiting on one
 * fetch. A table that never appears still ends in the caller's own refusal,
 * which is the one that says which page and why.
 */
const TABLE_APPEARS_TIMEOUT_MS = 60 * 1000;

/**
 * How long a click that is allowed to fail may take before it is given up on.
 *
 * Opening a form's folded sections is best-effort: a section that is already
 * open, or a control this theme does not render, is not a failure. But a
 * best-effort click on something unclickable still waits Playwright's default
 * thirty seconds, and a handful of those is a run that looks hung on a page it
 * is merely being patient with. Two seconds is far longer than a control on a
 * loaded page needs, and short enough that a wrong guess costs nothing.
 */
const OPTIONAL_CLICK_TIMEOUT_MS = 2000;

/**
 * How long a file manager gets to list what it holds, or to list it again
 * after a file is deleted or uploaded. Its listing is fetched from the site
 * after the form has rendered, so it is a wait on the network.
 */
const FILE_MANAGER_TIMEOUT_MS = 30 * 1000;

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
async function assertNotMoodleError(page: Page, what: string): Promise<void> {
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

function courseUrl(baseUrl: string, courseId: string): string {
  return new URL(`/course/view.php?id=${courseId}`, baseUrl).toString();
}

/**
 * A bounce to Microsoft can happen at any navigation, including one we did not
 * initiate. Latching it means the very next thing the driver does aborts,
 * rather than the run continuing until it happens to look.
 */
interface LoginWatch {
  readonly bouncedTo: () => string | undefined;
  readonly watch: (page: Page) => void;
}

function createLoginWatch(): LoginWatch {
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

function assertNotOnLoginHost(page: Page, watch: LoginWatch): void {
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
async function eachPageOf<
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

async function gotoCourse(
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

async function assertInConfiguredCourse(
  page: Page,
  options: Options
): Promise<void> {
  const found = await courseIdInBrowser(page);
  if (found !== options.courseId) {
    throw new WrongCourse(options.courseId, found ?? "unknown");
  }
}

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
async function ensureSignedIn(page: Page, options: Options): Promise<void> {
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

async function persistSession(
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
async function setEditorPreference(
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
  // the next thing that happens is an activity body being filled on the
  // strength of it. A silent no-op here produces a page whose content is wrong.
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

/**
 * What is typed into the activity form. Creating and updating are the same
 * form, opened at a different URL, and they differ in exactly one field: only
 * a creation sets visibility.
 *
 * Updating has no way to say it, which is the point — revealing a document is
 * a human decision, and a publisher that reasserted visibility on every run
 * would undo it silently.
 */
type ActivityForm =
  | {
      readonly kind: "create";
      readonly name: string;
      readonly html: string;
      /** Every picture the body shows; what the saved page is checked against. */
      readonly images: readonly PageImage[];
      /** The ones whose bytes go through the file picker on this form. */
      readonly upload: readonly PageImage[];
      readonly visible: boolean;
    }
  | {
      readonly kind: "update";
      readonly name: string;
      readonly html: string;
      readonly images: readonly PageImage[];
      readonly upload: readonly PageImage[];
    };

/**
 * What is typed into the file resource form. Creating and replacing are the
 * same form, opened at a different URL, and a replace touches the file and
 * nothing else: the name, how it is displayed and who can see it are all on
 * the create arm only.
 *
 * Written from the two seam types, as {@link DevoirForm} is, so that
 * visibility is unwritable on a replace rather than merely unwritten.
 */
type FileResourceForm =
  | ({ readonly kind: "create" } & Omit<NewFileResource, "section">)
  | ({ readonly kind: "replace" } & Omit<FileReplacement, "moduleId">);

/**
 * The sections of the course page.
 *
 * The browser only reads attributes off the page; what they mean is decided by
 * `readSectionMarkup` in the package root, where it is tested. Moodle's section
 * *number* and section *id* are different things, they sit in attributes whose
 * names suggest the opposite, and confusing them addresses a write to another
 * course entirely.
 */
async function readSections(page: Page): Promise<readonly ReadSection[]> {
  const markup = await page.evaluate((selector) => {
    const nodes = Array.from(document.querySelectorAll(selector));
    return nodes.map((node) => {
      const heading = node.querySelector(".sectionname, h3, h4");
      const edit = node.querySelector<HTMLAnchorElement>(
        "a[href*='editsection.php?id=']"
      );
      return {
        name: heading?.textContent ?? "",
        dataNumber: node.getAttribute("data-number"),
        dataSectionId: node.getAttribute("data-sectionid"),
        dataId: node.getAttribute("data-id"),
        className: node.className,
        editSectionId:
          edit === null
            ? null
            : new URL(edit.href, document.location.href).searchParams.get("id"),
      };
    });
  }, SELECTORS.courseSection);
  return readSectionMarkup(markup);
}

/**
 * The section called `name`, or `undefined` when the course has none.
 *
 * Two sections with the same name is an abort. The instructor's own course
 * carries repeated names ("Section 2" twice over), so taking the first match
 * would be picking a section at random and reporting success.
 */
function findSection(
  sections: readonly ReadSection[],
  name: string
): ReadSection | undefined {
  const matches = sections.filter((candidate) => candidate.name === name);
  if (matches.length > 1) {
    throw new Error(
      `Aborting: the course has ${matches.length} sections named "${name}" ` +
        `(numbers ${matches.map((match) => match.number).join(", ")}). ` +
        `Rename or remove the duplicates: publishing into one of them at ` +
        `random would put the document somewhere nobody looked.`
    );
  }
  return matches[0];
}

/** Moodle's per-session write token, carried by every page it renders. */
async function sessionKey(page: Page): Promise<string> {
  const key = await page.evaluate(
    () => (globalThis as { M?: { cfg?: { sesskey?: string } } }).M?.cfg?.sesskey
  );
  if (key === undefined || key === "") {
    throw new Error(
      "Aborting: the page carries no Moodle session key, so no write can be addressed to it."
    );
  }
  return key;
}

async function readItems(page: Page): Promise<readonly CourseItem[]> {
  const sections = await readSections(page);
  const raw = await page.evaluate((selector) => {
    /**
     * The course module id, taken from where Moodle actually puts it.
     *
     * Not from "the first link in the element": a course page carries `li`
     * elements that look like activities and hold a link to the course, and
     * reading `?id=` off that yields the *course* id. It then travels as a
     * module id into a delete URL, where the same number means an entirely
     * different thing.
     */
    function moduleIdOf(activity: Element): string {
      const data = activity.getAttribute("data-id");
      if (data !== null && data !== "") return data;
      const fromElementId = /(?:^|\s)module-(\d+)/.exec(activity.id);
      if (fromElementId?.[1] !== undefined) return fromElementId[1];
      // Only a link into /mod/ identifies an activity. Any other link on the
      // element is somebody else's id.
      const link =
        activity.querySelector<HTMLAnchorElement>("a[href*='/mod/']");
      if (link === null) return "";
      return (
        new URL(link.href, document.location.href).searchParams.get("id") ?? ""
      );
    }

    /**
     * The activity's name without the type suffix Moodle hides behind
     * `.accesshide` for screen readers — "Annonces Forum" is one activity
     * called "Annonces", not an activity whose name ends in its own type.
     */
    function nameOf(activity: Element): string {
      const instance = activity.querySelector(".instancename");
      if (instance !== null) {
        const copy = instance.cloneNode(true) as Element;
        for (const hidden of Array.from(copy.querySelectorAll(".accesshide"))) {
          hidden.remove();
        }
        return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
      }
      // A label — "Text and media area" — has no name at all: it is content
      // dropped straight onto the course page. Its first words are what the
      // instructor recognises it by, and something has to be shown before it
      // is deleted.
      //
      // The editing UI is stripped first. Left in, every label reads
      // "Sélectionner l'activité … Caché pour les étudiants" — the checkbox
      // and the badges around the content rather than the content.
      const copy = activity.cloneNode(true) as Element;
      for (const chrome of Array.from(
        copy.querySelectorAll(
          ".accesshide, .visually-hidden, .sr-only, .activity-actions, " +
            ".actions, .activitybadge, .badge, input, select, button, form"
        )
      )) {
        chrome.remove();
      }
      const text = (copy.textContent ?? "").replace(/\s+/g, " ").trim();
      return text.length > 60 ? `${text.slice(0, 60)}…` : text;
    }

    const nodes = Array.from(document.querySelectorAll(selector));
    return nodes.flatMap((node, index) =>
      Array.from(node.querySelectorAll("li.activity")).map((activity) => {
        const link =
          activity.querySelector<HTMLAnchorElement>("a[href*='/mod/']");
        return {
          moduleId: moduleIdOf(activity),
          name: nameOf(activity),
          sectionIndex: index,
          // Handed over verbatim and read in `activities.ts`. Moodle marks a
          // hidden activity on the `.activity-item` card inside this `<li>`,
          // not on the `<li>`, and deciding that here — in a browser, in a
          // function no test can reach — is how the wrong element went
          // unnoticed against a live course.
          className: activity.getAttribute("class") ?? "",
          itemClassName:
            activity.querySelector(".activity-item")?.getAttribute("class") ??
            "",
          url: link?.getAttribute("href") ?? "",
        };
      })
    );
  }, SELECTORS.courseSection);

  const items: CourseItem[] = [];
  for (const item of raw) {
    // Nothing on this element identified it as an activity. It is course
    // furniture, and passing it on as an activity with a borrowed id is how a
    // delete ends up addressed to something else entirely.
    if (item.moduleId === "") continue;

    const { visible, stealth } = readActivityVisibility(item);
    const devoir = readsAsDevoir(item, item.url);

    items.push({
      moduleId: item.moduleId,
      name: item.name,
      // Whatever the course calls this section, including a name the publisher
      // has never heard of. Inventing one here would make a misplaced activity
      // look correctly placed.
      section: sections[item.sectionIndex]?.name ?? "",
      visible,
      stealth,
      devoir,
    });
  }
  return items;
}

/**
 * What is typed into a Devoir's settings form. Creating and updating are the
 * same form, opened at a different URL, and — as for a page — they differ in
 * exactly one field: only a creation sets visibility.
 *
 * Written from the two seam types rather than as a shape of its own, so that a
 * field added to what a Devoir carries reaches this form on both arms at once.
 * Visibility is on the create arm and on no other, which is what makes the
 * guarantee {@link DevoirUpdate} states unwritable rather than merely unwritten:
 * no edit to `updateDevoir` can pass one, because there is no field to pass it
 * in.
 */
type DevoirForm =
  | ({ readonly kind: "create" } & NewDevoir)
  | ({ readonly kind: "update" } & Omit<DevoirUpdate, "moduleId">);

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

  // The run directory and the editor preference both belong to mutating runs.
  // A plan reads the course and writes nothing — not to the course, and not
  // to the instructor's own account — so neither is touched until a mutation is
  // actually about to happen. That also keeps a plan from aborting on an
  // editor control it never needs.
  let recorder: RunRecorder | undefined;
  let previousEditor: string | undefined;
  let currentEditor: string | undefined;
  /**
   * Whether this run has confirmed that Moodle renders dates in Paris. Asked
   * once: it is a property of the account, and it cannot change under a run.
   */
  let freezeZoneChecked = false;

  /**
   * Puts the instructor's editor preference on `value`, remembering what it
   * was the first time it is moved.
   *
   * The preference moves within a run, not only at the ends of it: a document
   * that shows a picture is written through Atto, because the file picker is
   * the only way a file gets into this Moodle, and everything else is written
   * through the plain textarea that this program has proven against the live
   * course. What is restored at the end is what the instructor had, not
   * whatever the last document happened to need.
   */
  async function useEditor(value: string): Promise<void> {
    if (currentEditor === value) return;
    const was = await setEditorPreference(page, options.baseUrl, value, watch);
    currentEditor = value;
    previousEditor ??= was;
  }

  async function prepareToMutate(): Promise<RunRecorder> {
    if (recorder === undefined) {
      await useEditor(PLAIN_TEXT_EDITOR);
      recorder = createRunRecorder(
        options.runDir,
        page,
        `course ${options.courseId} at ${options.baseUrl}\nstarted ${new Date().toISOString()}\n`
      );
    }
    return recorder;
  }

  /**
   * Writes an abort into `run.txt`. The message is the first thing wanted when
   * a run is picked apart afterwards, and the terminal it was printed to is
   * usually gone by then.
   */
  function noteAbort(mutation: RunRecorder, error: unknown): void {
    mutation.note(
      `  ABORTED ${error instanceof Error ? error.message : String(error)}`
    );
  }

  /**
   * Confirms a Moodle "are you sure?" page when one is shown. Deleting is the
   * one place this driver relies on a form it cannot see in advance, so a page
   * with no confirmation on it is left alone rather than clicked at.
   */
  async function confirmIfAsked(): Promise<void> {
    const confirm = page.locator(SELECTORS.confirmDelete);
    if ((await confirm.count()) === 0) return;
    await confirm.first().click();
    await page.waitForLoadState("domcontentloaded");
    assertNotOnLoginHost(page, watch);
  }

  /** The section settings form, checked to be this course's. */
  async function openSectionSettings(sectionId: string): Promise<void> {
    await page.goto(
      new URL(
        `/course/editsection.php?id=${sectionId}`,
        options.baseUrl
      ).toString(),
      { waitUntil: "domcontentloaded" }
    );
    assertNotOnLoginHost(page, watch);
    await assertInConfiguredCourse(page, options);
  }

  async function ensureSectionOn(name: SectionName): Promise<SectionOutcome> {
    await gotoCourse(page, options, watch);
    const before = await readSections(page);
    const existing = findSection(before, name);
    if (existing !== undefined) {
      return { number: existing.number, created: false };
    }

    // Adding a section is a mutation, so it is captured like any other.
    const mutation = await prepareToMutate();
    await gotoCourse(page, options, watch);
    const after = await mutation.capture(`create section ${name}`);
    try {
      const sesskey = await sessionKey(page);
      // Core Moodle appends one section to the course. The activity chooser
      // and the section menus are theme surfaces; this URL is not.
      await page.goto(
        new URL(
          `/course/changenumsections.php?courseid=${options.courseId}` +
            `&insertsection=0&numsections=1&sesskey=${sesskey}&sectionreturn=0`,
          options.baseUrl
        ).toString(),
        { waitUntil: "domcontentloaded" }
      );
      assertNotOnLoginHost(page, watch);
      await gotoCourse(page, options, watch);
      await assertInConfiguredCourse(page, options);

      // Moodle adds the section before it can be named, so there is a window —
      // one form submission long — in which an extra section exists under a
      // name nobody chose. What is in it during that window is nothing: it is
      // unnamed ("Section 12") and empty, and no activity is created until the
      // whole of this call has returned and been checked.
      //
      // Which section was added is worked out by comparing the course page
      // with how it stood a moment ago, because "the last one" is a section
      // that already exists whenever the add did nothing — and renaming that
      // one takes the instructor's own material and relabels it. Moodle has
      // given the new section a default name ("Section 12", or whatever the
      // format calls it); renaming it is what makes it findable next time, so
      // a failure here fails the whole call rather than warning: an unnamed
      // section would be created again on the next run, and again after that.
      const addition = sectionAddedBy(before, await readSections(page));
      if (addition.kind === "nothing") {
        throw new Error(
          `Aborting: asked course ${options.courseId} to add a section for ` +
            `"${name}" and it still has ${before.length}. This course format ` +
            `does not add sections through changenumsections.php (see issue ` +
            `#20). Add "${name}" by hand in Moodle and run this again — an ` +
            `existing section is used as it stands.`
        );
      }
      if (addition.kind === "unrecognisable") {
        throw new Error(
          `Aborting: course ${options.courseId} gained ${addition.grew} ` +
            `section(s) while adding "${name}", and none of them can be told ` +
            `apart by section id. Name it by hand, or re-check the selectors ` +
            `against this theme.`
        );
      }
      const added = addition.section;
      if (added.id === undefined) {
        throw new Error(
          `Aborting: the section added to course ${options.courseId} for "${name}" ` +
            `carries no id, so it cannot be named.`
        );
      }
      await openSectionSettings(added.id);

      // Moodle guards the name field behind a "Custom" checkbox in some
      // formats and not in others.
      const customise = page.locator(SELECTORS.sectionNameCustomise);
      if ((await customise.count()) > 0 && !(await customise.isChecked())) {
        await customise.check();
      }
      await page.locator(SELECTORS.sectionName).fill(name);
      await page.locator(SELECTORS.sectionSubmit).click();
      await page.waitForURL(/\/course\/view\.php/, {
        waitUntil: "domcontentloaded",
      });
      assertNotOnLoginHost(page, watch);
      await assertInConfiguredCourse(page, options);

      // Read it back. The selectors here are the least verified in this
      // file, and a rename that quietly did nothing must not be reported as
      // a section the publisher can now use.
      const confirmed = findSection(await readSections(page), name);
      if (confirmed === undefined) {
        throw new Error(
          `Aborting: added a section to course ${options.courseId}, but no ` +
            `section named "${name}" is in the course afterwards.`
        );
      }
      return { number: confirmed.number, created: true };
    } catch (error) {
      noteAbort(mutation, error);
      throw error;
    } finally {
      await after();
    }
  }

  /**
   * Opens an activity form, fills the name and the body, saves with "save and
   * return to course", and hands back the course's activities as the page
   * reports them afterwards. Creating and updating differ only in the URL and
   * in what they then look for, so they share this.
   *
   * `hide` is passed only when creating. There is no update path for
   * visibility, and this is where that is enforced: an update never has a way
   * to name the field.
   */
  /**
   * Whether the control is on screen, waiting out a fieldset still opening.
   *
   * A section unfolds with an animation, so the moment after the toggle is
   * clicked is exactly when a control can be on its way in and not yet
   * visible. Read as a question rather than an assertion: the answer decides
   * whether to try harder, so "no" is an ordinary outcome and never a throw.
   */
  async function shown(control: Locator): Promise<boolean> {
    return control
      .waitFor({ state: "visible", timeout: OPTIONAL_CLICK_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Opens whatever the form is keeping folded away.
   *
   * Moodle hides availability and weight behind "Show more…" inside a
   * collapsed fieldset, and a control that is in the DOM and not visible is
   * one Playwright will not check. Both controls are clicked when they are
   * there, and neither is required: a theme that shows everything already is
   * not a failure.
   */
  async function revealAdvancedFields(): Promise<void> {
    // Each shut section by its own toggle, and never the form's "expand all"
    // link. That link is a toggle, not a command: on a form Moodle serves with
    // its fieldsets already open, clicking it shuts them all, and a field
    // inside a section this program had just closed spends thirty seconds not
    // becoming visible. Asking only the sections that are actually collapsed
    // to open makes the call idempotent, which is what "reveal" means.
    const collapsed = page.locator(SELECTORS.formCollapsedSection);
    for (const toggle of await collapsed.all()) {
      await toggle
        .click({ timeout: OPTIONAL_CLICK_TIMEOUT_MS })
        .catch(() => undefined);
    }
    // "Show more…" is separate: it reveals advanced fields *inside* a section
    // rather than opening one. Moodle serves those hidden, so the first click
    // is the revealing one.
    const more = page.locator(SELECTORS.formShowMore);
    if ((await more.count()) > 0) {
      await more
        .first()
        .click({ timeout: OPTIONAL_CLICK_TIMEOUT_MS })
        .catch(() => undefined);
    }
  }

  /**
   * The form's own "expand all", clicked once.
   *
   * A blunter instrument than {@link revealAdvancedFields}, and a toggle
   * rather than a command — on a form Moodle already serves open it shuts
   * everything — so it is a last resort and never the first thing tried.
   */
  async function expandAllSections(): Promise<void> {
    const expandAll = page.locator(SELECTORS.formExpandAll);
    if ((await expandAll.count()) === 0) return;
    await expandAll
      .first()
      .click({ timeout: OPTIONAL_CLICK_TIMEOUT_MS })
      .catch(() => undefined);
  }

  /**
   * One field of a settings form, ready to be written to.
   *
   * Two things stand between a field and being writable, and both are asked
   * here rather than at each of the several places that write one. It is
   * absent — the form is not the form this program was written against, and
   * saying so is worth more than a timeout. Or it is inside one of the
   * collapsed fieldsets Moodle 4 renders a form as, which puts it in the DOM
   * and off the screen: a control nobody can see is not a control a browser
   * can be asked to choose an option from, and expanding the form is a click
   * on the page's own control rather than a way of reaching around the page.
   *
   * Two ways of opening the form, in order, because Moodle folds its forms
   * differently. Asking each shut section to open is enough for a form served
   * open; the activity form does not answer to it, and needs the "expand all"
   * link that would shut a form served open. Trying the gentle one first and
   * escalating only while the field is *still* hidden is what lets one
   * function serve both.
   *
   * And when neither works, this says so at once instead of leaving Playwright
   * to spend thirty seconds writing to something invisible. That wait is not
   * idle time: the last run to hit it submitted the form while it ran, and
   * left an activity in the course that no manifest accounted for.
   *
   * `cannot` says what is lost when the field is missing, in the caller's
   * words, because that sentence is the whole value of stopping here.
   */
  async function writableField(
    selector: string,
    what: string,
    cannot: string
  ): Promise<Locator> {
    const field = page.locator(selector);
    if ((await field.count()) === 0) {
      throw new Error(
        `Aborting: ${what} — this form has no "${selector}" field, so ${cannot}. ` +
          `Check the selectors against this Moodle.`
      );
    }
    const control = field.first();
    if (!(await shown(control))) {
      await revealAdvancedFields();
      if (!(await shown(control))) {
        await expandAllSections();
        if (!(await shown(control))) {
          throw new Error(
            `Aborting: ${what} — "${selector}" is on this form but stayed hidden after ` +
              `opening its folded sections and clicking "expand all", so it cannot be set. ` +
              `Nothing was submitted. Confirm the selectors in an attended codegen session ` +
              `(see the publisher's README.md).`
          );
        }
      }
    }
    return control;
  }

  /** Chooses an option on a select that a collapsed fieldset may be hiding. */
  async function selectPossiblyCollapsed(
    selector: string,
    value: string,
    what: string
  ): Promise<void> {
    const field = await writableField(
      selector,
      what,
      "visibility cannot be set here"
    );
    await field.selectOption(value);
  }

  /**
   * Fills the activity's body with rendered HTML, through whichever editor is
   * on the form.
   *
   * Atto is switched into its own HTML view first. Typing HTML into the rich
   * area would publish the markup as text — every tag visible on the page —
   * and the same textarea is behind both editors, so what is written is
   * identical either way.
   */
  async function fillBody(html: string, what: string): Promise<void> {
    // Atto's own source view, which is not this form's textarea: see
    // `fillRichBody`. The plain editor has no view to open and no sync to
    // wait for — the textarea on the form is the field that is submitted.
    if (currentEditor === RICH_EDITOR) {
      await fillRichBody(page, html, what);
      return;
    }
    const textarea = await required(
      page,
      SELECTORS.activityContentTextarea,
      what
    );
    if (!(await textarea.isVisible())) {
      throw new Error(
        `Aborting: ${what} — the activity's HTML source field is on the form but not ` +
          `showing, so what would be published cannot be typed into it. Confirm the ` +
          `editor's source view in an attended session ` +
          `(see docs/uploading-images.md).`
      );
    }
    await textarea.fill(html);
  }

  /**
   * Where the course serves each of a page's pictures, read off the page a
   * student would open.
   *
   * This is the acceptance criterion, checked rather than assumed: the whole
   * point of the upload is that a student sees the drawing, and the only thing
   * that can say so is the rendered page. A reference Moodle did not resolve
   * comes back as the raw `@@PLUGINFILE@@` text or as no `<img>` at all, and
   * either way the run stops here rather than recording a document as
   * published and leaving the broken icon to be found in the lecture theatre.
   */
  async function servedAssets(
    moduleId: string,
    name: string,
    images: readonly PageImage[]
  ): Promise<readonly PublishedAsset[]> {
    if (images.length === 0) return [];
    await page.goto(
      new URL(`/mod/page/view.php?id=${moduleId}`, options.baseUrl).toString(),
      { waitUntil: "domcontentloaded" }
    );
    assertNotOnLoginHost(page, watch);

    const sources = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img")).map((image) => image.src)
    );
    return images.map((image) => {
      // Matched on the name the file was stored under, which is the name the
      // HTML addressed: an `<img>` somewhere else on the page — a theme's
      // logo, a user picture — must not be recorded as the diagram.
      const wanted = `/${encodeURIComponent(image.name)}`;
      // A reference Moodle did not resolve is still an `<img>`, and its `src`
      // still ends in the file's name — the browser has merely made a URL out
      // of the placeholder against the page it is on. So the placeholder is
      // what is looked for, not the absence of a picture: this is the failure
      // the read-back exists to catch, and matching on the name alone would
      // record it as a success.
      const url = sources.find(
        (source) =>
          source.includes(wanted) && !source.includes(PLUGINFILE_PREFIX)
      );
      if (url === undefined) {
        throw new Error(
          `Aborting: "${name}" is in course ${options.courseId} (module ${moduleId}), and ` +
            `the page it renders does not serve "${image.path}". Students would see a ` +
            `broken image. Check the activity's files in Moodle, and the upload selectors ` +
            `(see docs/uploading-images.md).`
        );
      }
      return { path: image.path, url, contentHash: image.contentHash };
    });
  }

  /**
   * Establishes that this Moodle renders dates in `Europe/Paris` before a
   * Freeze is typed into a form.
   *
   * Moodle's date selector is five numbers in the signed-in user's own
   * timezone, so "20:00 on 10 September" means one instant to a user in Paris
   * and another to a user in London — and nothing on the form says which. The
   * check is the only thing that makes the acceptance criterion true rather
   * than hoped for, and it costs one page load per run.
   *
   * The server default — Moodle's `99` — is accepted when the option says what
   * the server's zone is, which core Moodle spells out in the label. A zone
   * this cannot confirm aborts, because the alternative is publishing a Freeze
   * that is wrong by an hour and finding out from a student.
   */
  async function assertFreezeZone(what: string): Promise<void> {
    if (freezeZoneChecked) return;
    await page.goto(new URL("/user/edit.php", options.baseUrl).toString(), {
      waitUntil: "domcontentloaded",
    });
    assertNotOnLoginHost(page, watch);
    const select = page.locator(SELECTORS.userTimezone).first();
    if ((await select.count()) === 0) {
      throw new Error(
        `Aborting: ${what} — this Moodle's profile form has no ` +
          `"${SELECTORS.userTimezone}" field, so the timezone its date forms are rendered ` +
          `in cannot be read. A Freeze typed into a form in another zone is wrong by ` +
          `whole hours. Set the dates by hand in Moodle, or check the selectors.`
      );
    }
    const chosen = await select.evaluate((element) => {
      const timezone = element as HTMLSelectElement;
      const option = timezone.options[timezone.selectedIndex];
      return { value: timezone.value, label: option?.textContent ?? "" };
    });
    if (chosen.value !== FREEZE_ZONE && !chosen.label.includes(FREEZE_ZONE)) {
      throw new Error(
        `Aborting: ${what} — the Moodle account this run is signed in as has timezone ` +
          `"${chosen.value}" (${chosen.label.trim()}), not ${FREEZE_ZONE}. Moodle's date ` +
          `fields are in the signed-in user's zone, so a Freeze typed in now would be ` +
          `wrong by whole hours for every student. Set the account's timezone to ` +
          `${FREEZE_ZONE} in Moodle and run again. No Devoir has been created, and no ` +
          `date has been written anywhere. What this run did put in the course is its ` +
          `pages and an empty "${DELIVERABLE_SECTION}" section; running again fills that ` +
          `section and leaves the pages alone.`
      );
    }
    freezeZoneChecked = true;
  }

  /**
   * Turns one of Moodle's optional dates on and types the five numbers into
   * it.
   *
   * The enabling checkbox first: the five selects behind it are disabled until
   * it is ticked, and a disabled select is not something a browser can be
   * asked to choose an option from. Which numbers they are was settled by
   * `devoir-form.ts`; all that happens here is the typing.
   */
  async function setOptionalDate(
    date: DevoirDateField,
    what: string
  ): Promise<void> {
    const enabled = await writableField(
      date.enabledSelector,
      what,
      "the Freeze cannot be set here"
    );
    await enabled.check();
    for (const part of date.parts) {
      await page.locator(part.selector).first().selectOption(part.value);
    }
  }

  /**
   * Ticks or unticks one of the submission plugins.
   *
   * Which ones there are, and what each is set to, is
   * {@link DEVOIR_SUBMISSION_FIELDS}. This ticks the box it is handed and has
   * no opinion about the answer.
   */
  async function setSubmissionPlugin(
    field: DevoirSubmissionField,
    what: string
  ): Promise<void> {
    const box = await writableField(
      field.selector,
      what,
      "what a Student may hand in cannot be set here"
    );
    await box.setChecked(field.on);
  }

  /**
   * Opens a Devoir's settings form, fills in everything a Devoir *is*, and
   * saves it.
   *
   * One function for both the create and the update, because a Devoir is one
   * thing either way: its title, the stub students read, online text with file
   * upload off, and the Freeze in both dates. A second copy of this would be
   * the place where an edited Devoir quietly stopped being what a created one
   * is — file upload back on after a typo fix, say, which nothing would report
   * and a student would find.
   *
   * Visibility is the exception, and {@link DevoirForm} is the guarantee: it
   * is a field of the create arm and of nothing else, so an update has none to
   * be written from and the hidden/shown select is never reached. A Devoir
   * revealed by hand stays revealed and one held back stays held back — not
   * because this function declines to write visibility, but because on an
   * update there is no visibility here to write.
   */
  async function submitDevoirForm(
    form: string,
    devoir: DevoirForm,
    what: string
  ): Promise<void> {
    await page.goto(form, { waitUntil: "domcontentloaded" });
    assertNotOnLoginHost(page, watch);
    await assertNotMoodleError(
      page,
      `opening the Devoir form for "${devoir.name}"`
    );
    await assertInConfiguredCourse(page, options);

    await page.locator(SELECTORS.activityName).fill(devoir.name);
    const intro = await writableField(
      SELECTORS.assignIntroTextarea,
      what,
      "the description saying what to paste and when the Freeze is cannot be written"
    );
    await intro.fill(devoir.html);

    for (const field of DEVOIR_SUBMISSION_FIELDS) {
      await setSubmissionPlugin(field, what);
    }
    // One Freeze, into both dates — the pair comes from one call, so there is
    // no second date here to be filled in from somewhere else. Typed on every
    // update as well as every create, and typed in full: what an update leaves
    // behind is what a create would, so there is no state this form can be in
    // that an edit half-corrects.
    for (const date of devoirDateFields(devoir.freeze)) {
      await setOptionalDate(date, what);
    }
    // Both answers are typed, rather than "hidden" typed and "shown" left to
    // the form's default: creating is the one moment this program decides
    // whether students can see a Devoir, and it says which it decided either
    // way. Not reached from an update, which carries no visibility at all.
    if (devoir.kind === "create") {
      await selectPossiblyCollapsed(
        SELECTORS.activityVisible,
        devoir.visible ? "1" : "0",
        `${what} ${devoir.visible ? "visible" : "hidden"}`
      );
    }

    await page.locator(SELECTORS.activitySubmitAndReturn).click();
    await page.waitForURL(/\/course\/view\.php/, {
      waitUntil: "domcontentloaded",
    });
    assertNotOnLoginHost(page, watch);
    await assertInConfiguredCourse(page, options);
  }

  /**
   * The activity an update just rewrote, and the check that the form was
   * honoured at all.
   *
   * The counterpart of {@link createdActivity}, and it exists for the same
   * reason: an update form a future Moodle stops honouring would otherwise
   * report a document republished — or a Devoir's Freeze moved — while
   * students carried on meeting last week's version. The two things the course
   * page can settle are that the activity is still there and that it is called
   * what this run renamed it to; the rest is for a human review to check.
   */
  function updatedActivity(
    items: readonly CourseItem[],
    update: { readonly moduleId: string; readonly name: string },
    named: string
  ): CourseItem {
    const saved = items.find((item) => item.moduleId === update.moduleId);
    if (saved === undefined) {
      throw new Error(
        `Aborting: ${named} ${update.moduleId} is not in course ${options.courseId} after updating it.`
      );
    }
    if (saved.name !== update.name) {
      throw new Error(
        `Aborting: ${named} ${update.moduleId} is still called "${saved.name}" after updating it to "${update.name}".`
      );
    }
    return saved;
  }

  /**
   * The activity a create just put in the course, and the check that it came
   * out the way it was asked for.
   *
   * Shared by both creates, because both face the same three ways a create can
   * succeed on the form and be wrong on the page — nothing appeared, several
   * things appeared, or the thing that appeared is showing when it was asked
   * for hidden. What identifies the new activity is the module id that was not
   * there a moment ago, and never the name: two activities are allowed to
   * share one.
   *
   * The hidden read-back is the reason this is checked rather than assumed.
   * Every other visibility write in this driver confirms itself; a create meant
   * to be hidden and coming out visible is the worst of them to take on trust,
   * because the manifest would record it as published and hidden while it sat
   * on the course page. `ifRevealed` is what is actually at stake, in the
   * caller's words, because that is the sentence the reader acts on.
   */
  function createdActivity(
    before: readonly CourseItem[],
    after: readonly CourseItem[],
    asked: {
      readonly named: string;
      readonly section: string;
      readonly visible: boolean;
      readonly ifRevealed: string;
    }
  ): CourseItem {
    const addition = activityAddedBy(before, after);
    if (addition.kind === "nothing") {
      throw new Error(
        `Aborting: asked course ${options.courseId} to create ${asked.named} in ` +
          `section ${asked.section}, and the course page lists no activity ` +
          `afterwards that was not there before. Nothing has been recorded for it. ` +
          `Check the section by hand in Moodle.`
      );
    }
    if (addition.kind === "unrecognisable") {
      throw new Error(
        `Aborting: creating ${asked.named} in course ${options.courseId} left ` +
          `${addition.appeared} new activities on the course page, so which one this ` +
          `run made cannot be said. Nothing has been recorded for it. Settle it by ` +
          `hand in Moodle, where all of them can be seen.`
      );
    }
    const created = addition.activity;
    if (!asked.visible && created.visible) {
      throw new Error(
        `Aborting: created ${asked.named} in course ${options.courseId} hidden, ` +
          `and the course page reports it visible. Hide it by hand in Moodle now — ` +
          `${asked.ifRevealed}`
      );
    }
    if (created.stealth) {
      throw new Error(
        `Aborting: ${asked.named} was created stealthed rather than hidden in ` +
          `course ${options.courseId}. "Available but not shown on the course page" ` +
          `leaves a working URL; hide it by hand in Moodle now.`
      );
    }
    return created;
  }

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

    if (fields.kind === "create") {
      await page.locator(SELECTORS.activityName).fill(fields.name);
    }
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

    await page.locator(SELECTORS.activitySubmitAndReturn).click();
    await page.waitForURL(/\/course\/view\.php/, {
      waitUntil: "domcontentloaded",
    });
    assertNotOnLoginHost(page, watch);
    await assertInConfiguredCourse(page, options);
    return readItems(page);
  }

  async function submitActivityForm(
    formUrl: string,
    fields: ActivityForm
  ): Promise<readonly CourseItem[]> {
    // A picture that has to go up needs the file picker, which only the rich
    // editor has; everything else takes the plain textarea this program has
    // proven against the live course. A document whose twenty-eight pictures
    // are all already in the course is "everything else": the files the
    // activity holds are not touched by rewriting its text.
    await useEditor(
      fields.upload.length === 0 ? PLAIN_TEXT_EDITOR : RICH_EDITOR
    );
    await page.goto(formUrl, { waitUntil: "domcontentloaded" });
    assertNotOnLoginHost(page, watch);
    await assertNotMoodleError(
      page,
      `opening the activity form for "${fields.name}"`
    );
    await assertInConfiguredCourse(page, options);

    await page.locator(SELECTORS.activityName).fill(fields.name);
    // Before the body, so that the file is in the draft area by the time the
    // form is submitted: the page and the pictures it shows are saved in one
    // submission, and there is no moment in which the activity is in the
    // course showing pictures it does not yet hold.
    for (const image of fields.upload) {
      await uploadImage(page, image);
    }
    await fillBody(fields.html, `writing "${fields.name}"`);
    if (fields.kind === "create" && !fields.visible) {
      await selectPossiblyCollapsed(
        SELECTORS.activityVisible,
        "0",
        `creating "${fields.name}" hidden`
      );
    }

    // Save and return to the course, not "save and display": the module id is
    // then read from the course page we are already required to check.
    //
    // The wait is for the course URL, not merely for a load to settle: a load
    // state can be satisfied by the form page we are leaving, and reading the
    // module id off that page would abort a run whose activity had in fact
    // been written — written to the course, absent from the manifest, which is
    // the one outcome the manifest exists to prevent.
    await page.locator(SELECTORS.activitySubmitAndReturn).click();
    await page.waitForURL(/\/course\/view\.php/, {
      waitUntil: "domcontentloaded",
    });
    assertNotOnLoginHost(page, watch);
    await assertInConfiguredCourse(page, options);

    return readItems(page);
  }

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

    async hideItem(moduleId: string): Promise<void> {
      const mutation = await prepareToMutate();
      await gotoCourse(page, options, watch);
      const after = await mutation.capture(`hide activity ${moduleId}`);
      try {
        const sesskey = await sessionKey(page);
        // Core Moodle's own hide. There is no show anywhere in this driver,
        // which is what makes "the publisher can only conceal" a property of
        // the program rather than a promise in a comment.
        await page.goto(
          new URL(
            `/course/mod.php?hide=${moduleId}&sesskey=${sesskey}&sr=0`,
            options.baseUrl
          ).toString(),
          { waitUntil: "domcontentloaded" }
        );
        assertNotOnLoginHost(page, watch);
        await gotoCourse(page, options, watch);
        await assertInConfiguredCourse(page, options);

        // Read it back, and require the answer rather than accepting silence.
        // An activity the course page no longer lists is not a hide this
        // program has seen happen: it is a question it could not get an answer
        // to, and the safe reading of "I cannot find the answer key" is not
        // "the answer key is hidden".
        const confirmed = (await readItems(page)).find(
          (item) => item.moduleId === moduleId
        );
        if (confirmed === undefined) {
          throw new Error(
            `Aborting: asked course ${options.courseId} to hide activity ` +
              `${moduleId}, and the course page does not list it afterwards, so ` +
              `its visibility cannot be confirmed. Check it by hand in Moodle.`
          );
        }
        if (confirmed.visible) {
          throw new Error(
            `Aborting: asked course ${options.courseId} to hide activity ` +
              `${moduleId} and the course page still reports it visible. Hide it ` +
              `by hand in Moodle before anyone reads it.`
          );
        }
      } catch (error) {
        noteAbort(mutation, error);
        throw error;
      } finally {
        await after();
      }
    },

    async createPage(newPage: NewPage): Promise<CreatedPage> {
      // Acquiring the plain text editor navigates away, so it happens before
      // the course page is opened and before anything is captured: the "before"
      // screenshot is then the course as it stood, not a preferences form.
      const mutation = await prepareToMutate();
      // The publishing layer has already put this section in the course, so
      // this is the lookup finding it. It stays a find-or-add so that the
      // driver has no state to be wrong about if it is ever driven directly.
      const { number: section } = await ensureSectionOn(newPage.section);
      await gotoCourse(page, options, watch);
      const after = await mutation.capture(`create ${newPage.name}`);

      // The `after` capture is owed whatever happens: a mutation that failed
      // halfway is exactly the one the instructor will want to look at.
      try {
        // Read before writing, so the activity this call made can be told from
        // the ones that were already there. What identifies it is the module
        // id that was not on the page a moment ago; the name cannot, because
        // two activities are allowed to share one.
        const before = await readItems(page);
        const form = new URL(
          `/course/modedit.php?add=page&course=${options.courseId}&section=${section}`,
          options.baseUrl
        ).toString();
        const items = await submitActivityForm(form, {
          kind: "create",
          name: newPage.name,
          html: newPage.html,
          images: newPage.images,
          upload: newPage.upload,
          visible: newPage.visible,
        });

        const created = createdActivity(before, items, {
          named: `"${newPage.name}"`,
          section: newPage.section,
          visible: newPage.visible,
          ifRevealed: "it holds material students must not see.",
        });
        return {
          moduleId: created.moduleId,
          assets: await servedAssets(
            created.moduleId,
            newPage.name,
            newPage.images
          ),
        };
      } catch (error) {
        noteAbort(mutation, error);
        throw error;
      } finally {
        await after();
      }
    },

    async updatePage(update: PageUpdate): Promise<readonly PublishedAsset[]> {
      // The same form as creating, opened on the existing activity rather than
      // on `add=page`: Moodle keeps the module id, the section and the
      // visibility, and this driver never types into any of them.
      const mutation = await prepareToMutate();
      await gotoCourse(page, options, watch);
      const after = await mutation.capture(`update ${update.name}`);

      try {
        const form = new URL(
          `/course/modedit.php?update=${update.moduleId}`,
          options.baseUrl
        ).toString();
        const items = await submitActivityForm(form, {
          kind: "update",
          name: update.name,
          html: update.html,
          images: update.images,
          upload: update.upload,
        });

        updatedActivity(items, update, "activity");
        return servedAssets(update.moduleId, update.name, update.images);
      } catch (error) {
        noteAbort(mutation, error);
        throw error;
      } finally {
        await after();
      }
    },

    async createFileResource(
      resource: NewFileResource
    ): Promise<CreatedFileResource> {
      const what = `creating the file resource "${resource.name}"`;
      const mutation = await prepareToMutate();
      // As for a page: the publishing layer has already put the section in
      // the course, and this is the lookup finding it.
      const { number: section } = await ensureSectionOn(resource.section);
      await gotoCourse(page, options, watch);
      const after = await mutation.capture(`create file ${resource.name}`);

      try {
        const before = await readItems(page);
        const form = new URL(
          `/course/modedit.php?add=resource&course=${options.courseId}&section=${section}`,
          options.baseUrl
        ).toString();
        const items = await submitFileResourceForm(
          form,
          { kind: "create", ...resource },
          what
        );

        const created = createdActivity(before, items, {
          named: `the file resource "${resource.name}"`,
          section: resource.section,
          visible: resource.visible,
          ifRevealed: "it holds material students must not see.",
        });
        return { moduleId: created.moduleId };
      } catch (error) {
        noteAbort(mutation, error);
        throw error;
      } finally {
        await after();
      }
    },

    async replaceFile(replacement: FileReplacement): Promise<void> {
      const what = `replacing the file of resource ${replacement.moduleId} with "${replacement.fileName}"`;
      // The existing activity's form, reached by URL rather than through the
      // course page's action menu, whose ids change from one render to the
      // next. Moodle keeps the module id, the name, the section and the
      // visibility; this call has none of them to type.
      const mutation = await prepareToMutate();
      await gotoCourse(page, options, watch);
      const after = await mutation.capture(
        `replace file ${replacement.moduleId}`
      );

      try {
        const form = new URL(
          `/course/modedit.php?update=${replacement.moduleId}`,
          options.baseUrl
        ).toString();
        const items = await submitFileResourceForm(
          form,
          { kind: "replace", ...replacement },
          what
        );
        if (!items.some((item) => item.moduleId === replacement.moduleId)) {
          throw new Error(
            `Aborting: file resource ${replacement.moduleId} is not in course ` +
              `${options.courseId} after replacing its file.`
          );
        }
      } catch (error) {
        noteAbort(mutation, error);
        throw error;
      } finally {
        await after();
      }
    },

    async createDevoir(devoir: NewDevoir): Promise<CreatedDevoir> {
      const what = `creating the Devoir "${devoir.name}"`;
      // Both of these navigate away, so they happen before the course page is
      // opened and before anything is captured — and the zone check happens
      // before this driver touches a section, so a run that cannot state its
      // Freeze writes nothing here at all.
      //
      // It does not follow that the course is untouched. By the time the first
      // Devoir is made, `applyPlan` has published the run's pages and has
      // already created the "Deliverables" section, which is where these were
      // going to go. A refusal therefore leaves that section on the course
      // page with nothing in it, and the fix for both is the same: set the
      // account's timezone and run again.
      const mutation = await prepareToMutate();
      await assertFreezeZone(what);
      // Not a parameter, and not read from anywhere: there is one section a
      // Devoir can be in. The publishing layer has already created it; this is
      // the lookup finding it.
      const { number: section } = await ensureSectionOn(DELIVERABLE_SECTION);
      await gotoCourse(page, options, watch);
      const after = await mutation.capture(`create devoir ${devoir.name}`);

      try {
        // As for a page: what identifies the activity this call made is the
        // module id that was not on the course page a moment ago.
        const before = await readItems(page);
        const form = new URL(
          `/course/modedit.php?add=assign&course=${options.courseId}&section=${section}`,
          options.baseUrl
        ).toString();
        await submitDevoirForm(form, { kind: "create", ...devoir }, what);

        const created = createdActivity(before, await readItems(page), {
          named: `the Devoir "${devoir.name}"`,
          section: DELIVERABLE_SECTION,
          visible: devoir.visible,
          ifRevealed:
            "it names an exercise students are not meant to have yet.",
        });
        return { moduleId: created.moduleId };
      } catch (error) {
        noteAbort(mutation, error);
        throw error;
      } finally {
        await after();
      }
    },

    async updateDevoir(devoir: DevoirUpdate): Promise<void> {
      const what = `updating the Devoir "${devoir.name}"`;
      // The same form as creating, opened on the existing activity rather than
      // on `add=assign`: Moodle keeps the module id, the section and the
      // visibility, and this driver never types into any of them here. The
      // module id is what every Submission handed in hangs off, which is why
      // an edit is this and never a delete followed by a create.
      const mutation = await prepareToMutate();
      // Before the course page is opened, as it is for a create: a run that
      // cannot establish the zone its dates are typed in writes nothing.
      await assertFreezeZone(what);
      await gotoCourse(page, options, watch);
      const after = await mutation.capture(`update devoir ${devoir.name}`);

      try {
        const form = new URL(
          `/course/modedit.php?update=${devoir.moduleId}`,
          options.baseUrl
        ).toString();
        // The update arm of the form carries no visibility, because there is
        // none to carry: the hidden/shown select on this form is left exactly
        // as the instructor set it.
        await submitDevoirForm(form, { kind: "update", ...devoir }, what);

        // Read the course back, exactly as an update to a page does. What the
        // course page cannot say is what the two dates were saved as — that is
        // for a human review to check against the front matter.
        updatedActivity(await readItems(page), devoir, "the Devoir");
      } catch (error) {
        noteAbort(mutation, error);
        throw error;
      } finally {
        await after();
      }
    },

    async countSubmissions(moduleId: string): Promise<number> {
      // The page a teacher already reads this off, opened with the session
      // this driver is holding. No web service token: for one count it would
      // add a credential to keep, a renewal to remember and a second transport
      // to a program that has none.
      const start = new URL(
        `/mod/assign/view.php?id=${moduleId}&action=grading`,
        options.baseUrl
      ).toString();
      let counted = 0;

      await eachPageOf(
        page,
        watch,
        start,
        SELECTORS.assignGradingTable,
        // The browser reads class attributes and nothing else: whether they
        // mean a Student has work in there is decided by `readsAsHoldingSubmissions`,
        // out here where a test can reach it. Grouped by row and not by
        // element, because a theme that puts the status class on the cell as
        // well as on the div inside it would otherwise count one Student's
        // work twice.
        () =>
          page.evaluate((selectors) => {
            const empty = {
              understood: false,
              rows: [] as string[][],
              links: [] as string[],
            };
            if (document.querySelector(selectors.assignPage) === null) {
              return empty;
            }
            const table = document.querySelector(selectors.assignGradingTable);
            if (table === null) return empty;

            const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
              Array.from(
                row.querySelectorAll(selectors.assignSubmissionStatus)
              ).map((carrier) => carrier.getAttribute("class") ?? "")
            );
            const links = Array.from(
              document.querySelectorAll<HTMLAnchorElement>(
                selectors.assignGradingPaging
              )
            ).map((link) => link.href);
            return { understood: true, rows, links };
          }, SELECTORS),
        (url) =>
          `Aborting: read ${url} and could not find the grading table on it, so how ` +
          `many Submissions activity ${moduleId} holds cannot be established. ` +
          `A Devoir with no Students enrolled renders no table either, and this ` +
          `cannot tell that apart from a page it failed to read — so it refuses ` +
          `rather than call either one empty. Confirm it in Moodle by hand.`,
        (read) => {
          counted += read.rows.filter((classNames) =>
            readsAsHoldingSubmissions(classNames)
          ).length;
        }
      );
      return counted;
    },

    async deleteItem(moduleId: string): Promise<void> {
      const mutation = await prepareToMutate();
      await gotoCourse(page, options, watch);
      await assertInConfiguredCourse(page, options);
      const after = await mutation.capture(`delete activity ${moduleId}`);
      try {
        const sesskey = await sessionKey(page);
        await page.goto(
          new URL(
            `/course/mod.php?sesskey=${sesskey}&delete=${moduleId}&confirm=1`,
            options.baseUrl
          ).toString(),
          { waitUntil: "domcontentloaded" }
        );
        assertNotOnLoginHost(page, watch);
        await confirmIfAsked();

        // Read the course back. A delete URL that a future Moodle stops
        // honouring would otherwise leave every activity in place while wipe
        // reported a clean course — the failure that would send the instructor
        // to build on a course they believe is empty.
        await gotoCourse(page, options, watch);
        const remaining = await readItems(page);
        if (remaining.some((item) => item.moduleId === moduleId)) {
          throw new Error(
            `Aborting: activity ${moduleId} is still in course ${options.courseId} after deleting it.`
          );
        }
      } catch (error) {
        noteAbort(mutation, error);
        throw error;
      } finally {
        await after();
      }
    },

    async deleteSection(number: number): Promise<void> {
      if (number === 0) {
        throw new Error(
          "Aborting: section 0 is the course's own top section and cannot be deleted."
        );
      }
      const mutation = await prepareToMutate();
      await gotoCourse(page, options, watch);
      await assertInConfiguredCourse(page, options);
      const target = (await readSections(page)).find(
        (section) => section.number === number
      );
      if (target === undefined) {
        throw new Error(
          `Aborting: course ${options.courseId} has no section numbered ${number}.`
        );
      }
      if (target.id === undefined) {
        throw new Error(
          `Aborting: section ${number} ("${target.name}") carries no section id, ` +
            `so the delete cannot be addressed to it.`
        );
      }
      const after = await mutation.capture(
        `delete section ${number} ${target.name}`
      );
      try {
        const sesskey = await sessionKey(page);
        await page.goto(
          new URL(
            `/course/editsection.php?id=${target.id}&sr=0&delete=1&sesskey=${sesskey}`,
            options.baseUrl
          ).toString(),
          { waitUntil: "domcontentloaded" }
        );
        assertNotOnLoginHost(page, watch);
        await confirmIfAsked();

        // Read back by section id, not by number: the numbers after this one
        // have just shifted down, so a number-based check would find a
        // different section sitting where this one was and call it a failure.
        await gotoCourse(page, options, watch);
        const still = (await readSections(page)).some(
          (section) => section.id === target.id
        );
        if (still) {
          throw new Error(
            `Aborting: section ${number} ("${target.name}") is still in course ` +
              `${options.courseId} after deleting it.`
          );
        }
      } catch (error) {
        noteAbort(mutation, error);
        throw error;
      } finally {
        await after();
      }
    },

    async close(): Promise<void> {
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
