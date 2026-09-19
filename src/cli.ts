#!/usr/bin/env node
// The command line. Six commands:
//
//   install-browser     install the Chromium the browser driver launches, once per machine
//   install-skills      link the publisher's agent skills into .claude/skills, once
//   check               check the course repository without Moodle; writes nothing
//   render <source>     print one Published Document as it would be uploaded, without Moodle
//   publish [--apply]   report the plan; apply only when explicitly asked
//   wipe --course <id>  empty the course back to one section; --apply to do it
//
// This is the seam the tests drive: they run these commands against the fake
// driver with the repository root pointed at a temporary directory of fixture
// documents.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { documentsToPublish, loadCatalog } from "./packages/catalog/index.ts";
import { loadCompetencies } from "./packages/catalog/competencies.ts";
import { loadDeliverables } from "./packages/catalog/deliverables.ts";
import { loadGridFacts } from "./packages/catalog/grid-facts.ts";
import { createFakeDriver } from "./packages/course/fake.ts";
import { createBrowserDriver } from "./packages/course/browser.ts";
import { installBrowser } from "./packages/course/browser-install.ts";
import { printPdf } from "./packages/course/print.ts";
import { installSkills, SkillLinkRefused } from "./packages/skills/index.ts";
import { readManifest } from "./packages/manifest/index.ts";
import {
  buildPlan,
  formatPlan,
  refuseRecordedPages,
} from "./packages/publishing/plan.ts";
import { applyPlan } from "./packages/publishing/apply.ts";
import {
  applyWipe,
  assertNoSubmissions,
  buildWipePlan,
  formatWipePlan,
} from "./packages/publishing/wipe.ts";
import { checkRepository, formatCheck } from "./packages/publishing/check.ts";
import { renderForPrint } from "./packages/publishing/render.ts";
import {
  MissingConfiguration,
  readConfig,
  readRenderConfig,
  repositoryRoot,
} from "./config.ts";

import type { CourseDriver } from "./packages/course/index.ts";
import type { Config } from "./config.ts";

const USAGE = `Usage:
  publisher install-browser [--dry-run]    Install the Chromium this publisher's Playwright launches, and no other browser.
                                           Once per machine, and again after a new publisher tag moves Playwright.
                                           --dry-run prints what would be downloaded, and where, and downloads nothing.
  publisher install-skills [--dry-run]     Link the publisher's agent skills, feedback-letter and banding-anchors, into
                                           .claude/skills/, so a new publisher tag updates them. Once per course repository.
                                           --dry-run prints what would be linked, and links nothing.
  publisher check                          Check this course repository without Moodle: publisher.json, the grid, every
                                           document rendered, every link and picture resolved. Needs no site, no course
                                           id and no session, opens no browser and writes nothing.
  publisher render <source> [--out <path>] Print one document the published table lists, the assessment grid assembled, to
                                           the PDF a publish would upload: beside the run captures, or at --out <path>.
                                           Reads the repository as check does. Needs no site, no course id and no
                                           session, and writes nothing to the manifest or the course.
  publisher publish [--apply]              Report the plan for every document publisher.json names. Applies nothing unless --apply is given.
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
 * Prints one Published Document as a run would upload it, and writes that file
 * and nothing else.
 *
 * Only what printing needs is read from the configuration — no site, no course
 * id, no session — so a preview is made on any machine. The PDF goes where the
 * Instructor said, or beside the run captures. The fake driver prints no PDF:
 * it writes the print-ready HTML the PDF would be printed from, which is what
 * the tests read, as they read it off the fake course after a publish.
 */
async function render(source: string, out: string | undefined): Promise<number> {
  const config = readRenderConfig();
  const printed = renderForPrint(
    config.repoRoot,
    source,
    config.now ?? new Date()
  );
  const fake = config.driver === "fake";
  const fileName = fake
    ? printed.fileName.replace(/\.pdf$/, ".html")
    : printed.fileName;
  const path =
    out === undefined
      ? join(config.runsRoot, runStamp(), fileName)
      : resolve(out);
  const contents = fake ? printed.html : await printPdf(printed.html);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  process.stdout.write(
    `Rendered ${printed.title} to ${path}\n` +
      (fake ? "The fake driver prints no PDF: this is the HTML it is printed from.\n" : "") +
      "\nNothing was read from Moodle, and nothing was written to the manifest or the course.\n"
  );
  return 0;
}

/**
 * The source `render` was given and where to write it, or `undefined` when the
 * arguments are anything but one source and an optional `--out <path>`.
 */
function renderArguments(
  argv: readonly string[]
): { source: string; out: string | undefined } | undefined {
  const sources: string[] = [];
  let out: string | undefined;
  for (let at = 0; at < argv.length; at += 1) {
    const argument = argv[at] as string;
    if (argument === "--out") {
      const value = argv[at + 1];
      if (out !== undefined || value === undefined || value.startsWith("--"))
        return undefined;
      out = value;
      at += 1;
    } else if (argument.startsWith("--")) {
      return undefined;
    } else {
      sources.push(argument);
    }
  }
  const [source] = sources;
  return sources.length === 1 && source !== undefined
    ? { source, out }
    : undefined;
}

/**
 * Links the skills, and touches nothing else: no configuration is read, for the
 * reason `check` reads none. A refusal is printed and nothing is linked.
 */
function linkSkills(dryRun: boolean): number {
  try {
    installSkills(repositoryRoot(), {
      dryRun,
      report: (line) => process.stdout.write(`${line}\n`),
    });
    return 0;
  } catch (error) {
    if (error instanceof SkillLinkRefused) {
      process.stderr.write(`${error.message}\n`);
      return 2;
    }
    throw error;
  }
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
  // Every PDF this run makes is dated, so a run handed a date says so before
  // it says anything else: its footers are about that day, not this one.
  const now = config.now ?? new Date();
  if (config.now !== undefined) {
    process.stdout.write(
      `PUBLISHER_NOW is set: publishing as of ${now.toISOString()}, not now.\n`
    );
  }
  const catalog = loadCatalog(config.repoRoot);
  // Read here, with the tables and before the driver is opened, because every
  // refusal it can raise is about the repository: a duplicated id, a Freeze
  // that is not in Paris, a competency the grid does not declare, a programme
  // the Grid Frame has nothing to print for. None of them is worth finding out
  // with a browser sitting in the course.
  const competencies = loadCompetencies(config.repoRoot, catalog);
  const deliverables = loadDeliverables(config.repoRoot, catalog, competencies);
  const facts = loadGridFacts(config.repoRoot, catalog);
  const manifest = readManifest(config.manifestPath);
  // Pages an earlier publisher recorded are cleaned up by hand, and that is
  // worth hearing before a browser is sitting in the course.
  refuseRecordedPages(manifest);

  process.stdout.write(`Course ${config.courseId} at ${config.baseUrl}\n`);

  return withDriver(config, async (driver) => {
    const plan = buildPlan({
      repoRoot: config.repoRoot,
      baseUrl: config.baseUrl,
      deliverables,
      gridSource: {
        source: catalog.grid,
        course: catalog.course,
        competencies,
        facts,
      },
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
      footer: { course: catalog.course, publishedOn: now },
      report: (line) => process.stdout.write(`  ${line}\n`),
    });
    process.stdout.write(`\nManifest: ${config.manifestPath}\n`);
    return 0;
  });
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

/** The flags `install-skills` takes, and the whole of them. */
const INSTALL_SKILLS_FLAGS: readonly string[] = ["--dry-run"];

/**
 * Exit status 2, with the usage, when `argv` holds anything but `flags`;
 * `undefined` when the command may run.
 *
 * The arguments are echoed as they were typed rather than described, because a
 * flag and the value after it are both unrecognised and only the person who
 * typed them knows which was meant to be which.
 */
function refuseUnrecognised(
  command: string,
  argv: readonly string[],
  flags: readonly string[]
): number | undefined {
  const unrecognised = argv.filter((argument) => !flags.includes(argument));
  if (unrecognised.length === 0) return undefined;
  process.stderr.write(
    `Aborting: ${command} takes ${flags.join(" ")} and nothing else. ` +
      `It was given: ${unrecognised.join(" ")}.\n\n${USAGE}`
  );
  return 2;
}

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case "install-browser":
      // A browser name is the likeliest thing typed here, and this command
      // installs Chromium and nothing else: said, rather than ignored.
      return (
        refuseUnrecognised(command, rest, INSTALL_BROWSER_FLAGS) ??
        installBrowser({ dryRun: rest.includes("--dry-run") })
      );
    case "install-skills":
      // A skill name is the likeliest thing typed here, and this command
      // links every skill the publisher ships or none: said, not ignored.
      return (
        refuseUnrecognised(command, rest, INSTALL_SKILLS_FLAGS) ??
        linkSkills(rest.includes("--dry-run"))
      );
    case "publish":
      return refuseUnrecognised(command, rest, PUBLISH_FLAGS) ?? publish(rest.includes("--apply"));
    case "check":
      if (rest.length > 0) {
        process.stderr.write(
          `Aborting: check takes no arguments. It was given: ${rest.join(" ")}.\n\n${USAGE}`
        );
        return 2;
      }
      return check();
    case "render": {
      const parsed = renderArguments(rest);
      if (parsed === undefined) {
        process.stderr.write(
          `Aborting: render takes one source and, optionally, --out <path>. ` +
            `It was given: ${rest.length === 0 ? "nothing" : rest.join(" ")}.\n\n${USAGE}`
        );
        return 2;
      }
      return render(parsed.source, parsed.out);
    }
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
