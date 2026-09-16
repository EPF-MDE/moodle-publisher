#!/usr/bin/env node
// The command line. Nine commands:
//
//   install-browser     install the Chromium the browser driver launches, once per machine
//   install-skills      link the publisher's agent skills into .claude/skills, once
//   check               check the course repository without Moodle; writes nothing
//   setup [--apply]     configure the course's gradebook for the Oral, once
//   publish [--apply]   report the plan; apply only when explicitly asked
//   probes              write the Probe Sheets to a CSV; changes nothing
//   import [--apply]    put that CSV through Moodle's own gradebook import
//   audit               read the live course and check it, writing nothing
//   wipe --course <id>  empty the course back to one section; --apply to do it
//
// `setup` is separate from `publish` because it is a different kind of work:
// it configures the course once and is idempotent, where publishing runs every
// time a document changes. Folding it into a routine run would mean opening
// gradebook pages on every publish to conclude that there is nothing to do.
//
// This is the seam the tests drive: they run these commands against the fake
// driver with the repository root pointed at a temporary directory of fixture
// documents.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { documentsToPublish, loadCatalog } from "./packages/catalog/index.ts";
import { loadCompetencies } from "./packages/catalog/competencies.ts";
import { loadDeliverables } from "./packages/catalog/deliverables.ts";
import { loadProbes } from "./packages/catalog/probes.ts";
import { createFakeDriver } from "./packages/course/fake.ts";
import { createBrowserDriver } from "./packages/course/browser.ts";
import { installBrowser } from "./packages/course/browser-install.ts";
import { installSkills, SkillLinkRefused } from "./packages/skills/index.ts";
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
import {
  buildProbeSheets,
  formatProbeSheets,
  formatProbeSheetsCsv,
  readCourse,
} from "./packages/publishing/probe-sheets.ts";
import {
  applyImport,
  buildImportPlan,
  EnrolmentHasMoved,
  FileRewrittenDuringImport,
  formatImportPlan,
  ImportRefused,
  MANUAL_FALLBACK,
} from "./packages/publishing/probe-import.ts";
import {
  applySetup,
  buildSetupPlan,
  CourseNotConfigurable,
  formatSetupPlan,
  isConfigured,
} from "./packages/publishing/setup.ts";
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
  publisher install-skills [--dry-run]     Link the publisher's agent skills, feedback-letter and banding-anchors, into
                                           .claude/skills/, so a new publisher tag updates them. Once per course repository.
                                           --dry-run prints what would be linked, and links nothing.
  publisher check                          Check this course repository without Moodle: publisher.json, the grid, every
                                           document rendered, every link and picture resolved. Needs no site, no course
                                           id and no session, opens no browser and writes nothing.
  publisher setup [--apply]                Configure the course's gradebook for the Oral. Changes nothing unless --apply is given.
  publisher publish [--apply]              Report the plan for every document publisher.json names. Applies nothing unless --apply is given.
  publisher probes                         Write one Probe Sheet per enrolled Student per Competency to a CSV,
                                           ready to be read and then imported. Changes nothing in the course.
  publisher import [--apply]               Put that CSV through Moodle's own gradebook import, so every Probe Sheet
                                           field is waiting before the first Oral. Imports nothing unless --apply is given.
  publisher audit                          Check the live course against this repository: everything published present,
                                           every instructor page hidden, no instructor material where a student can reach it,
                                           and every Devoir closing at the Freeze the front matter states. Writes nothing.
  publisher wipe --course <id> [--apply]   Empty the course back to its top section. Deletes nothing unless --apply is given.
`;

/**
 * An error as an abort line, said once.
 *
 * Most refusals below the CLI already open with "Aborting:", because they are
 * written to be read as the last line of a run. A catch-all that prefixed one
 * anyway printed "Aborting: Aborting:" — which is what the run that could not
 * find the import's file picker said, and it reads like the program stuttering
 * at the moment the Instructor most needs to trust it.
 */
function aborting(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith("Aborting:") ? message : `Aborting: ${message}`;
}

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

/**
 * Configures the gradebook, and reports what it would do when not asked to.
 *
 * The report-first shape is the same as `publish`'s, and it is worth as much
 * here: a gradebook is the one part of a Moodle course this program cannot
 * take anything back out of, so the first run of a new command shows the scale
 * and the grade items it is about to add before it adds them.
 *
 * One handler covers reading the gradebook and writing to it. A course a human
 * has to correct reads the same either way — instructions rather than a stack —
 * and the two moments differ only in what is true when the message is printed,
 * which the messages themselves say.
 */
async function setup(apply: boolean): Promise<number> {
  const config = readConfig();
  // Read before the driver is opened, like `publish` reads the Deliverables: a
  // grid declaring no Competencies, or an untitled one, is a mistake in the
  // repository, and one Grade Item per Competency is what this run makes.
  const competencies = loadCompetencies(
    config.repoRoot,
    loadCatalog(config.repoRoot)
  );

  process.stdout.write(`Course ${config.courseId} at ${config.baseUrl}\n`);

  return withDriver(config, async (driver) => {
    try {
      const plan = buildSetupPlan(
        config.courseId,
        competencies,
        await driver.gradebook(),
        readManifest(config.manifestPath)
      );
      process.stdout.write(`${formatSetupPlan(plan)}\n`);

      if (isConfigured(plan)) {
        process.stdout.write(
          `\nCourse ${config.courseId} is already configured for the Oral. Nothing to do.\n`
        );
        return 0;
      }
      if (!apply) {
        process.stdout.write(
          "\nNothing has been configured. Re-run with --apply to configure the course.\n"
        );
        return 0;
      }

      process.stdout.write("\nConfiguring:\n");
      await applySetup(plan, {
        manifestPath: config.manifestPath,
        driver,
        report: (line) => process.stdout.write(`  ${line}\n`),
      });
      process.stdout.write(
        `\nCourse ${config.courseId} is configured for the Oral.\n` +
          `Manifest: ${config.manifestPath}\n`
      );
      return 0;
    } catch (error) {
      if (error instanceof CourseNotConfigurable) {
        process.stderr.write(`${error.message}\n`);
        return 2;
      }
      // Anything else is Moodle or the browser refusing partway: the run says
      // where it got to rather than only what broke, because setup is
      // idempotent and "run it again" is the whole remedy. What was created is
      // in the manifest, so the second run makes the rest and nothing twice.
      process.stderr.write(
        `${aborting(error)}\n\n` +
          `Whatever was created before this is in the course and in the manifest ` +
          `(${config.manifestPath}). Run setup again to make the rest: it adds only ` +
          `what is missing. If it stops here again, make the scale and one grade item ` +
          `per Competency by hand in the gradebook — hidden, weight 0, valued on the Bands.\n`
      );
      return 2;
    }
  });
}

/**
 * Writes the Probe Sheets, and writes nothing else.
 *
 * There is no `--apply` here, and that is not an omission: this command's whole
 * output is a file on disk, and the course it read is exactly as it was. What
 * puts the sheets in the gradebook is a separate step, so that the Instructor
 * reads what is about to enter the gradebook before any of it does.
 *
 * The repository is read first and before the driver is opened, like `publish`:
 * a probe that names a Band, a Competency with no probes and a Deliverable with
 * no Freeze are all mistakes in the repository, and none is worth finding out
 * with a browser sitting in the course the evening before the Orals.
 */
async function probes(): Promise<number> {
  const config = readConfig();
  const catalog = loadCatalog(config.repoRoot);
  const competencies = loadCompetencies(config.repoRoot, catalog);
  const deliverables = loadDeliverables(config.repoRoot, catalog, competencies);
  const probeQuestions = loadProbes(config.repoRoot, catalog, competencies);
  const manifest = readManifest(config.manifestPath);

  process.stdout.write(`Course ${config.courseId} at ${config.baseUrl}\n`);

  return withDriver(config, async (driver) => {
    const { enrolments, handedIn } = await readCourse(
      driver,
      deliverables,
      competencies,
      manifest
    );
    const sheets = buildProbeSheets({
      enrolments,
      handedIn,
      probes: probeQuestions,
      courseId: config.courseId,
    });
    // Rendered before the file is opened. The last guard on ADR-0002 lives in
    // here, and a run it stops must leave whatever was generated last time
    // exactly where it was rather than half-overwritten.
    const csv = formatProbeSheetsCsv(sheets);
    writeFileSync(config.probeSheetPath, csv, "utf8");

    process.stdout.write(
      `${formatProbeSheets(sheets, config.probeSheetPath)}\n`
    );
    return 0;
  });
}

/**
 * Puts the generated Probe Sheets into the gradebook, and reports what it
 * would put there when not asked to.
 *
 * Opt-in twice over, and both are the same principle at different distances.
 * Generating is a separate command, so nothing enters the gradebook as a side
 * effect of preparing it; and `--apply` is asked for here, so the last thing
 * between a file and thirty Students' gradebook rows is a sentence the
 * Instructor reads first.
 *
 * The file and the manifest are read before the driver is opened. Sheets that
 * were never generated, a gradebook `setup` has not configured and a file that
 * is not the one this program writes are all knowable without Moodle, and none
 * of them is worth finding out with a browser sitting in the course on the
 * evening before the Orals.
 */
async function importProbeSheets(apply: boolean): Promise<number> {
  const config = readConfig();
  // Outside the handler below, whose remedy is importing the file by hand: a
  // grid declaring no Competencies is not answered by that, and which columns
  // the file has depends on what it declares.
  const competencies = loadCompetencies(
    config.repoRoot,
    loadCatalog(config.repoRoot)
  );

  process.stdout.write(`Course ${config.courseId} at ${config.baseUrl}\n`);

  try {
    const plan = buildImportPlan({
      courseId: config.courseId,
      path: config.probeSheetPath,
      competencies,
      manifest: readManifest(config.manifestPath),
    });
    process.stdout.write(`${formatImportPlan(plan)}\n`);

    if (!apply) {
      process.stdout.write(
        "\nNothing has been imported. Re-run with --apply to put the sheets in the gradebook.\n" +
          "That run reads the course first, and refuses if anyone has enrolled or left\n" +
          "since the file was written: who is enrolled is not knowable from here.\n"
      );
      return 0;
    }

    return await withDriver(config, async (driver) => {
      process.stdout.write("\nImporting:\n");
      await applyImport(plan, {
        driver,
        report: (line) => process.stdout.write(`  ${line}\n`),
      });
      process.stdout.write(
        `\nEvery Student enrolled in the course now has a Probe Sheet waiting in every\n` +
          `grade item. The bands are empty: you fill them in at the Oral. A Student\n` +
          `who enrols from here on is in neither the file nor the gradebook — run probes\n` +
          `again, and this again, and the Bands already entered are untouched.\n`
      );
      return 0;
    });
  } catch (error) {
    // Each carries the whole message, and they differ in what that message
    // says: a refusal names the manual fallback, while the two that would be
    // answered by importing this file by hand — the enrolment has moved, and
    // the file changed after the sheets had gone in — deliberately do not.
    if (
      error instanceof ImportRefused ||
      error instanceof EnrolmentHasMoved ||
      error instanceof FileRewrittenDuringImport
    ) {
      process.stderr.write(`${error.message}\n`);
      return 2;
    }
    // Anything else is Moodle, the browser or the form refusing partway. The
    // file is where it was — nothing on this path writes it — so the remedy is
    // the same one either way, and it is printed rather than described.
    process.stderr.write(
      `${aborting(error)}\n\n` +
        `The CSV is unchanged at ${config.probeSheetPath}.\n${MANUAL_FALLBACK}\n`
    );
    return 2;
  }
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

/** The flags `install-skills` takes, and the whole of them. */
const INSTALL_SKILLS_FLAGS: readonly string[] = ["--dry-run"];

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
    case "install-skills": {
      const unrecognised = rest.filter(
        (argument) => !INSTALL_SKILLS_FLAGS.includes(argument)
      );
      if (unrecognised.length > 0) {
        // A skill name is the likeliest thing typed here, and this command
        // links every skill the publisher ships or none: said, not ignored.
        process.stderr.write(
          `Aborting: install-skills takes ${INSTALL_SKILLS_FLAGS.join(" ")} and nothing else. ` +
            `It was given: ${unrecognised.join(" ")}.\n\n${USAGE}`
        );
        return 2;
      }
      return linkSkills(rest.includes("--dry-run"));
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
    case "setup":
      return setup(rest.includes("--apply"));
    case "probes":
      return probes();
    case "import":
      return importProbeSheets(rest.includes("--apply"));
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
