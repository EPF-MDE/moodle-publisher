#!/usr/bin/env node
// The command line. Five commands:
//
//   install-browser     install the Chromium the browser driver launches, once per machine
//   check               check the course repository without Moodle; writes nothing
//   publish [--apply]   report the plan; apply only when explicitly asked
//   audit               read the live course and check it, writing nothing
//   wipe --course <id>  empty the course back to one section; --apply to do it
//
// This is the seam the tests drive: they run these commands against the fake
// driver with the repository root pointed at a temporary directory of fixture
// documents.
import { join } from "node:path";

import { documentsToPublish, loadCatalog } from "./packages/catalog/index.ts";
import { loadCompetencies } from "./packages/catalog/competencies.ts";
import { loadDeliverables } from "./packages/catalog/deliverables.ts";
import { createFakeDriver } from "./packages/course/fake.ts";
import { createBrowserDriver } from "./packages/course/browser.ts";
import { installBrowser } from "./packages/course/browser-install.ts";
import { devoirEntryFor, readManifest } from "./packages/manifest/index.ts";
import { buildPlan, formatPlan } from "./packages/publishing/plan.ts";
import { applyPlan } from "./packages/publishing/apply.ts";
import { auditCourse, formatAudit } from "./packages/publishing/audit.ts";
import {
  applyWipe,
  assertNoSubmissions,
  buildWipePlan,
  formatWipePlan,
} from "./packages/publishing/wipe.ts";
import { checkRepository, formatCheck } from "./packages/publishing/check.ts";
import {
  MissingConfiguration,
  readConfig,
  repositoryRoot,
} from "./config.ts";

import type { CourseDriver, DevoirSettings } from "./packages/course/index.ts";
import type { Deliverable } from "./packages/catalog/deliverables.ts";
import type { Manifest } from "./packages/manifest/index.ts";
import type { Config } from "./config.ts";

const USAGE = `Usage:
  publisher install-browser [--dry-run]    Install the Chromium this publisher's Playwright launches, and no other browser.
                                           Once per machine, and again after a new publisher tag moves Playwright.
                                           --dry-run prints what would be downloaded, and where, and downloads nothing.
  publisher check                          Check this course repository without Moodle: publisher.json, the grid, every
                                           document rendered, every link and picture resolved. Needs no site, no course
                                           id and no session, opens no browser and writes nothing.
  publisher publish [--apply]              Report the plan for every document publisher.json names. Applies nothing unless --apply is given.
  publisher audit                          Check the live course against this repository: everything published present,
                                           every instructor page hidden, no instructor material where a student can reach it,
                                           and every Devoir closing at the Freeze the front matter states. Writes nothing.
  publisher wipe --course <id> [--apply]   Empty the course back to its top section. Deletes nothing unless --apply is given.
`;

/** `2026-09-01T14-32-08Z`: one directory per run, sorting chronologically. */
function runStamp(): string {
  return new Date()
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replaceAll(":", "-");
}

async function openDriver(
  config: Config,
  runDir: string
): Promise<CourseDriver> {
  if (config.driver === "fake") {
    // readConfig has already established that the path is set.
    return createFakeDriver(config.fakeCoursePath ?? "", config.courseId);
  }
  return createBrowserDriver({
    baseUrl: config.baseUrl,
    courseId: config.courseId,
    sessionStatePath: config.sessionStatePath,
    runDir,
  });
}

/**
 * Opens the course, runs `use`, and closes the driver whatever happens. Both
 * commands need the closing — it is what restores the editor preference and
 * persists the session — so neither is trusted to remember it.
 */
async function withDriver(
  config: Config,
  use: (driver: CourseDriver) => Promise<number>
): Promise<number> {
  const driver = await openDriver(config, join(config.runsRoot, runStamp()));
  try {
    return await use(driver);
  } finally {
    await driver.close();
  }
}

/**
 * Checks the course repository, and touches nothing else.
 *
 * No configuration is read, because none is needed: a pre-commit hook runs
 * this on any machine, with no `.env` and no session, and a check that asked
 * for a course id would be asking for the one thing it must never use. A
 * refusal is thrown, and printed and exited on like a run's.
 */
function check(): number {
  process.stdout.write(`${formatCheck(checkRepository(repositoryRoot()))}\n`);
  return 0;
}

/**
 * Reports the plan, and applies it when asked.
 *
 * The course is read before the plan is built, even when nothing will be
 * applied. Part of the plan is a fact about the live course rather than about
 * the repository — whether instructor material somebody revealed has to be
 * re-hidden — and a plan that could not say so would leave the riskiest thing
 * this tool does out of the report the instructor checks before applying it.
 */
async function publish(apply: boolean): Promise<number> {
  const config = readConfig();
  const catalog = loadCatalog(config.repoRoot);
  // Read here, with the tables and before the driver is opened, because every
  // refusal it can raise is about the repository: a duplicated id, a Freeze
  // that is not in Paris, a competency the grid does not declare. None of them
  // is worth finding out with a browser sitting in the course.
  const deliverables = loadDeliverables(
    config.repoRoot,
    catalog,
    loadCompetencies(config.repoRoot, catalog)
  );
  const manifest = readManifest(config.manifestPath);

  process.stdout.write(`Course ${config.courseId} at ${config.baseUrl}\n`);

  return withDriver(config, async (driver) => {
    const plan = buildPlan({
      repoRoot: config.repoRoot,
      baseUrl: config.baseUrl,
      deliverables,
      documents: documentsToPublish(catalog),
      manifest,
      snapshot: await driver.snapshot(),
    });
    process.stdout.write(`${formatPlan(plan)}\n`);

    if (!apply) {
      process.stdout.write(
        "\nNothing has been applied. Re-run with --apply to publish.\n"
      );
      return 0;
    }

    process.stdout.write("\nApplying:\n");
    await applyPlan(plan, {
      manifestPath: config.manifestPath,
      driver,
      report: (line) => process.stdout.write(`  ${line}\n`),
    });
    process.stdout.write(`\nManifest: ${config.manifestPath}\n`);
    return 0;
  });
}

async function audit(): Promise<number> {
  const config = readConfig();
  const catalog = loadCatalog(config.repoRoot);
  // Read with the tables, as `publish` reads them, and for the same reason:
  // every refusal they can raise is about the repository, and the audit is the
  // command run in the hour before a Freeze — it should fail on a broken front
  // matter before it opens a browser, not after.
  const deliverables = loadDeliverables(
    config.repoRoot,
    catalog,
    loadCompetencies(config.repoRoot, catalog)
  );
  const manifest = readManifest(config.manifestPath);

  // One assertion's verdict depends on the date — whether the C3 brief is
  // still meant to be hidden — so a run that was handed a date says so before
  // it says anything else. A stale PUBLISHER_NOW in an .env would otherwise
  // make "Audit passed" a statement about a day that is not today.
  const now = config.now ?? new Date();
  if (config.now !== undefined) {
    process.stdout.write(
      `PUBLISHER_NOW is set: auditing as of ${now.toISOString()}, not today.\n`
    );
  }

  return withDriver(config, async (driver) => {
    const snapshot = await driver.snapshot();
    const report = auditCourse({
      repoRoot: config.repoRoot,
      catalog,
      deliverables,
      manifest,
      snapshot,
      devoirs: await readDevoirs(driver, deliverables, manifest),
      now,
    });
    process.stdout.write(`${formatAudit(report)}\n`);
    return report.passed ? 0 : 1;
  });
}

/**
 * What each published Devoir is collecting, read back one activity at a time.
 *
 * Only the Devoirs the manifest records, and only for the Deliverables the
 * front matter still defines: a Deliverable nothing was published for has
 * nothing to open, and the audit says so from the manifest without a page
 * load. A Devoir the course has lost answers `undefined` and is simply left
 * out of the map — what happened to it is the audit's to say, not this
 * function's.
 *
 * Reading is all this does. It is what makes the audit safe to run before a
 * deadline, and the guarantee is the driver's: {@link CourseDriver.readDevoir}
 * opens a settings form and never submits one.
 */
async function readDevoirs(
  driver: CourseDriver,
  deliverables: readonly Deliverable[],
  manifest: Manifest
): Promise<Map<string, DevoirSettings>> {
  const live = new Map<string, DevoirSettings>();
  for (const deliverable of deliverables) {
    const entry = devoirEntryFor(manifest, deliverable.id);
    if (entry === undefined) continue;
    const settings = await driver.readDevoir(entry.moduleId);
    if (settings !== undefined) live.set(entry.moduleId, settings);
  }
  return live;
}

/** The value of `--name value`, or undefined. */
function option(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
}

/**
 * Empties the course. The only destructive command, so it asks for the course
 * id to be typed out and refuses if it does not match the configured one.
 *
 * That is the whole guard, and it is deliberately not a yes/no prompt: a
 * prompt is answered by reflex, whereas a course id has to be looked up and
 * typed, and it is exactly the thing that would be wrong if the wrong course
 * were about to be emptied. It also means the configuration cannot decide this
 * on its own — an .env pointing somewhere unexpected produces a mismatch and
 * an abort, not a wiped course.
 */
async function wipe(argv: readonly string[]): Promise<number> {
  const typed = option(argv, "--course");

  let config: Config;
  try {
    config = readConfig();
  } catch (error) {
    // Having typed a course id and then being told a course id is not set
    // reads as the tool asking twice for the same thing. It is not: the flag
    // confirms the course, the configuration chooses it, and the guard is the
    // two agreeing. Say so here, where the confusion actually happens.
    if (error instanceof MissingConfiguration && typed !== undefined) {
      process.stderr.write(
        `${error.message}\n\n` +
          `--course ${typed} confirms which course is emptied; it does not configure one.\n` +
          `Set the site and the course, then repeat the flag:\n\n` +
          `  printf 'MOODLE_BASE_URL=https://moodle.epf.fr\\nMOODLE_COURSE_ID=${typed}\\n' > .env\n` +
          `  npm run wipe -- --course ${typed}\n`
      );
      return 2;
    }
    throw error;
  }

  if (typed === undefined) {
    process.stderr.write(
      `Aborting: wipe needs the course id typed out, to be sure of which course is emptied.\n` +
        `  npm run wipe -- --course ${config.courseId}\n`
    );
    return 2;
  }
  if (typed !== config.courseId) {
    process.stderr.write(
      `Aborting: you typed --course ${typed}, but the configured course is ${config.courseId}.\n` +
        `Nothing has been touched. Check MOODLE_COURSE_ID, and the .env file if there is one.\n`
    );
    return 2;
  }

  const manifest = readManifest(config.manifestPath);
  const apply = argv.includes("--apply");

  return withDriver(config, async (driver) => {
    const plan = buildWipePlan(await driver.snapshot(), manifest);
    // Before the plan is printed, not merely before it is applied: a report
    // headed "would be emptied" over a course this command is in fact going to
    // refuse to empty is the tool saying something untrue, and the run that
    // reads it is the one that goes on to type --apply.
    const checked = await assertNoSubmissions(plan, driver);

    process.stdout.write(`${formatWipePlan(plan)}\n`);

    if (!apply) {
      process.stdout.write(
        "\nNothing has been deleted. Re-run with --apply to empty the course.\n"
      );
      return 0;
    }
    if (plan.sections.length === 0 && plan.items.length === 0) {
      return 0;
    }

    process.stdout.write("\nEmptying:\n");
    await applyWipe(checked, {
      manifestPath: config.manifestPath,
      driver,
      report: (line) => process.stdout.write(`  ${line}\n`),
    });
    process.stdout.write(
      `\nCourse ${config.courseId} is empty. Run the publisher to build it again.\n`
    );
    return 0;
  });
}

/**
 * The flags `publish` takes, and the whole of them.
 *
 * Anything else is an abort rather than an argument quietly ignored. `--phase`
 * is the reason it is written down: it used to decide how much of the course
 * a run published, and a command line that still carried it would otherwise
 * report a full publish as though the flag had been honoured — found out in
 * front of a class, which is where this program's mistakes are always found.
 */
const PUBLISH_FLAGS: readonly string[] = ["--apply"];

/** The flags `install-browser` takes, and the whole of them. */
const INSTALL_BROWSER_FLAGS: readonly string[] = ["--dry-run"];

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case "install-browser": {
      const unrecognised = rest.filter(
        (argument) => !INSTALL_BROWSER_FLAGS.includes(argument)
      );
      if (unrecognised.length > 0) {
        // A browser name is the likeliest thing typed here, and this command
        // installs Chromium and nothing else: said, rather than ignored.
        process.stderr.write(
          `Aborting: install-browser takes ${INSTALL_BROWSER_FLAGS.join(" ")} and nothing else. ` +
            `It was given: ${unrecognised.join(" ")}.\n\n${USAGE}`
        );
        return 2;
      }
      return installBrowser({ dryRun: rest.includes("--dry-run") });
    }
    case "publish": {
      const unrecognised = rest.filter(
        (argument) => !PUBLISH_FLAGS.includes(argument)
      );
      if (unrecognised.length > 0) {
        // The arguments are echoed as they were typed rather than described,
        // because a flag and the value after it are both unrecognised and only
        // the person who typed them knows which was meant to be which.
        process.stderr.write(
          `Aborting: publish takes ${PUBLISH_FLAGS.join(" ")} and nothing else. ` +
            `It was given: ${unrecognised.join(" ")}.\n\n${USAGE}`
        );
        return 2;
      }
      return publish(rest.includes("--apply"));
    }
    case "check":
      if (rest.length > 0) {
        process.stderr.write(
          `Aborting: check takes no arguments. It was given: ${rest.join(" ")}.\n\n${USAGE}`
        );
        return 2;
      }
      return check();
    case "audit":
      return audit();
    case "wipe":
      return wipe(rest);
    default:
      process.stderr.write(USAGE);
      return command === undefined || command === "--help" ? 0 : 2;
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
}
