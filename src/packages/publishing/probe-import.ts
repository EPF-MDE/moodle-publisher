// An entry point: the generated Probe Sheets entering the gradebook, so that
// every field is waiting before the first Oral rather than being made mid-slot.
//
// It is a step of its own, after `probes` and never inside it. Generation
// writes a file and touches nothing; importing is the opt-in half, which is
// the shape every command here has — and the gap between the two is where the
// Instructor reads what is about to enter the gradebook.
//
// What travels is the file on disk, unchanged: this reads it to check it and
// to say what it holds, and Moodle's own import tool is handed the path. The
// same file is therefore importable by hand through the same screen, which is
// what makes a broken selector on the evening of 10 September cost typing
// rather than the sheets. {@link MANUAL_FALLBACK} is those instructions, and it
// is printed by every abort here rather than kept somewhere that would have to
// be found first.
//
// One import covers every Competency the grid declares. Nothing it sends can be
// a verdict: the Band columns the generator leaves empty are mapped to `ignore`,
// so the only cells this program writes are the sheets themselves and the Band
// cell it puts on screen stays as empty as the file (ADR-0002). And nothing here reads a Band
// back out — this repository never becomes a second source of truth for one.
import { readFileSync, existsSync } from "node:fs";

import { identityColumnOf, GRADE_IMPORT_PATH } from "../course/gradebook.ts";
import { gradeItemFor } from "../manifest/index.ts";

import { probeSheetsColumns } from "./probe-sheets.ts";
import { columnValues, toCsv } from "./lib/csv.ts";

import type {
  Competency,
  GradebookDriver,
  ImportColumn,
} from "../course/gradebook.ts";
import type { CourseDriver, Enrolment } from "../course/index.ts";
import type { GradeItemEntry, Manifest } from "../manifest/index.ts";

/**
 * How to do this by hand, printed by every abort this file would answer.
 *
 * Written here rather than only in the README because the night it is needed
 * is the night nobody is reading a README: the run that failed says what to do
 * next, in the order it has to be done, naming Moodle's own screen. The file
 * it names is the one the run left untouched.
 *
 * Not printed by the two aborts it would answer wrongly — the enrolment has
 * moved, and the file changed after the sheets had gone in — because advice
 * that is read at 21:00 and is wrong is worse than advice that is absent.
 */
export const MANUAL_FALLBACK =
  `To import the sheets by hand — the file is unchanged, and this is the same screen:\n` +
  `  1. Open Grades → Import → CSV file in the course (${GRADE_IMPORT_PATH}).\n` +
  `  2. Upload the CSV named above, leave the separator on comma, and continue.\n` +
  `  3. Identify users by "Email address", mapped from the file's "email" column.\n` +
  `  4. Map each "Feedback: …" column to the feedback of its grade item.\n` +
  `  5. Leave every other column on "Ignore" — including the band columns,\n` +
  `     which are empty on purpose: the Band is yours to enter at the Oral.\n` +
  `  6. Import. Each Student then has a sheet waiting in every grade item.`;

/** An abort on this path: a message, and how to do it by hand instead. */
export class ImportRefused extends Error {
  constructor(message: string) {
    super(`Aborting: ${message}\n\n${MANUAL_FALLBACK}`);
    this.name = "ImportRefused";
  }
}

/**
 * The file is not the enrolment the course holds now.
 *
 * Not an {@link ImportRefused}, because the manual fallback would be the wrong
 * thing to print: importing this file by hand prepares exactly the Students it
 * already prepares, and the one it is missing is missing from it either way.
 * What is needed is the file `probes` writes next, so that is all this says.
 */
export class EnrolmentHasMoved extends Error {
  constructor(message: string) {
    super(
      `Aborting: ${message}\n\n` +
        `Run \`npm run probes\` again and then this again: the sheets are rebuilt ` +
        `from the enrolment as it stands, and the Bands already entered at an Oral ` +
        `are untouched by a second import.`
    );
    this.name = "EnrolmentHasMoved";
  }
}

/**
 * The file was rewritten while it was being imported.
 *
 * Not an {@link ImportRefused}, and the difference is the whole reason it
 * exists: everything else on this path stops before Moodle is touched and can
 * honestly say to import the file by hand instead. This one is found afterwards
 * — the sheets have gone in — so telling the Instructor to import again would
 * be telling them to redo a run that worked, from a file that is no longer the
 * one they read.
 */
export class FileRewrittenDuringImport extends Error {
  constructor(path: string) {
    super(
      `The sheets were imported, and then ${path} was found not to be the file ` +
        `that went in: something rewrote it during the run. Which of the two ` +
        `versions Moodle read is not something this run can say. Open the ` +
        `gradebook and read what is in it against the file as it is now — and do ` +
        `not run \`npm run probes\` first, because it would overwrite the only ` +
        `copy on disk of what may have been imported.`
    );
    this.name = "FileRewrittenDuringImport";
  }
}

/** What one Competency's pair of columns is mapped onto. */
interface CompetencyColumns {
  readonly competency: Competency;
  readonly item: GradeItemEntry;
}

/** What a run would put through Moodle's import, and where it would land. */
export interface ImportPlan {
  readonly courseId: string;
  /** The generated file, as it is on disk. Never rewritten by this. */
  readonly path: string;
  /**
   * Who the file carries a row for, in the order it writes them.
   *
   * The identity column and nothing else is read out of the file: what the
   * import has to be checked against is which Students it prepares, and a run
   * that had read the sheets themselves into memory would be a run that could
   * believe it knew better than the file it is about to hand over.
   */
  readonly emails: readonly string[];
  /** Every column of the file, in order, and what it maps onto. */
  readonly columns: readonly ImportColumn[];
  /** The Grade Items the sheets land in, one per Competency. */
  readonly items: readonly CompetencyColumns[];
}

/**
 * The header the generator writes, read off the layout it writes it from.
 *
 * The layout and not the file, because it is what the file is checked against:
 * a header that is not this one is a file that was hand-edited or generated by
 * an older version of this program, and mapping columns by position out of it
 * would import the C2 sheets into C3.
 */
function expectedHeader(
  competencies: readonly Competency[]
): readonly string[] {
  return probeSheetsColumns(competencies).map((column) => column.heading);
}

/**
 * The plan for putting the generated file into the gradebook, or an abort.
 *
 * Everything it can refuse over is knowable from the repository and the file —
 * sheets that were never generated, a course whose gradebook `setup` has not
 * configured, a file that is not the one this program writes — so all of it
 * happens before a browser is opened, which is the shape `publish` and `probes`
 * both have and worth as much here: this command is run in the last hour of the
 * evening before the Orals.
 */
export function buildImportPlan(input: {
  readonly courseId: string;
  readonly path: string;
  /** What the grid declares: one Grade Item, and one pair of columns, each. */
  readonly competencies: readonly Competency[];
  readonly manifest: Manifest;
}): ImportPlan {
  if (!existsSync(input.path)) {
    throw new ImportRefused(
      `there are no generated Probe Sheets at ${input.path}, so there is nothing to ` +
        `import. Run \`npm run probes\` first: it writes the file, and reading it before ` +
        `any of it enters the gradebook is the point of the two steps being separate. ` +
        `Nothing has been imported.`
    );
  }

  const items = input.competencies.map((competency): CompetencyColumns => {
    const item = gradeItemFor(input.manifest, competency);
    if (item === undefined) {
      throw new ImportRefused(
        `no Grade Item is recorded for ${competency.id}, so its sheets have nowhere to ` +
          `land. Run \`npm run setup -- --apply\` first: it makes the Bands scale and ` +
          `one hidden Grade Item per Competency, and records them. Nothing has been ` +
          `imported.`
      );
    }
    return { competency, item };
  });

  const text = readFileSync(input.path, "utf8");
  const header = expectedHeader(input.competencies);
  // Compared as the one line the generator wrote, quoting and all, rather than
  // field by field: the file is handed to Moodle whole, so what is checked is
  // the bytes at the top of it.
  const headerLine = toCsv([header]);
  if (!text.startsWith(headerLine)) {
    throw new ImportRefused(
      `the file at ${input.path} does not start with the columns \`probes\` writes:\n` +
        `  expected: ${headerLine.trimEnd()}\n` +
        `  found:    ${(text.split("\n")[0] ?? "").trimEnd()}\n` +
        `Columns are mapped by the order this program generated them in, so importing ` +
        `some other file would put one Competency's sheets in another's Grade Item. ` +
        `Run \`npm run probes\` again to regenerate it. Nothing has been imported.`
    );
  }

  const columns = columnsOf(items);
  // Only the identity column is read out of the file, and it is read through
  // the same lookup the drivers use, so what this checks against the enrolment
  // is the column Moodle will be told to match rows by.
  const emails = columnValues(
    text,
    identityColumnOf(columns, `importing ${input.path}`)
  ).slice(1);
  if (emails.length === 0) {
    throw new ImportRefused(
      `the file at ${input.path} has its columns and not one Student under them. ` +
        `An import of it would report success and prepare nobody. Run ` +
        `\`npm run probes\` again — it refuses over a course with nobody enrolled, so ` +
        `check what it says. Nothing has been imported.`
    );
  }

  return {
    courseId: input.courseId,
    path: input.path,
    emails,
    columns,
    items,
  };
}

/**
 * Every column of the file and what it maps onto, in the order it is written.
 *
 * The columns are the generator's, so nothing here restates the layout: each
 * one is mapped by the role the file gave it. The name column is ignored — it
 * is for the human reading the file — and the email is the identity, because it
 * is the only field this Moodle populates. The Band columns are ignored too,
 * and that is the ADR-0002 guard on this half: they are the cells a verdict
 * would go in, and this program has no mapping that would carry one there.
 */
function columnsOf(
  items: readonly CompetencyColumns[]
): readonly ImportColumn[] {
  const competencies = items.map((one) => one.competency);
  return probeSheetsColumns(competencies).map((column): ImportColumn => {
    switch (column.role) {
      case "identity":
        return { heading: column.heading, target: { kind: "identity" } };
      case "sheet": {
        const item = items.find(
          (one) => one.competency.id === column.competency.id
        )?.item;
        if (item === undefined) {
          throw new ImportRefused(
            `the file's "${column.heading}" column has no Grade Item to land in. ` +
              `That is a fault in this program rather than in the course. Nothing ` +
              `has been imported.`
          );
        }
        return {
          heading: column.heading,
          target: { kind: "sheet", gradeItemId: item.itemId },
        };
      }
      // The name column and the Band columns alike.
      default:
        return { heading: column.heading, target: { kind: "ignore" } };
    }
  });
}

export function formatImportPlan(plan: ImportPlan): string {
  return [
    `Importing ${plan.path} into course ${plan.courseId}:`,
    `  ${plan.emails.length} Students, one row each, through Moodle's own gradebook import.`,
    "",
    ...plan.items.map(
      ({ competency, item }) =>
        `  ${competency.id}  sheets → feedback of "${item.name}" (grade item ${item.itemId})`
    ),
    ...plan.items.map(
      ({ competency }) =>
        `  ${competency.id}  band column → ignored, so no verdict travels`
    ),
    "",
    `${plan.emails.length * plan.items.length} Probe Sheets, in one import covering ` +
      `${plan.items.map((one) => one.competency.id).join(", ")}. Every Band cell is left ` +
      `empty for you to fill in at the Oral.`,
  ].join("\n");
}

export interface ImportOptions {
  /**
   * The gradebook, and who is enrolled in the course.
   *
   * Enrolment is read for one reason: the file was written from the enrolment
   * as it stood when `probes` ran, and what the Grade Items have to hold is a
   * field for every Student enrolled now. Reading, never writing — nothing in
   * this program enrols or unenrols anyone.
   */
  readonly driver: GradebookDriver & Pick<CourseDriver, "enrolments">;
  readonly report: (line: string) => void;
}

/**
 * Puts the file through Moodle's import, having checked the gradebook is still
 * what the manifest says it is.
 *
 * The Grade Items are re-read from the live course first. The manifest is the
 * record of what `setup` made, and an import mapped from it into a gradebook
 * somebody has since emptied lands thirty sheets in whatever now holds those
 * ids — which is the one mistake on this path that is neither visible in the
 * output nor undoable afterwards.
 *
 * The file is read back afterwards and compared with what went in, because
 * "unchanged on disk" is the property the manual fallback rests on: a file the
 * import had rewritten would not be the file the Instructor could re-import by
 * hand at 21:00.
 */
export async function applyImport(
  plan: ImportPlan,
  options: ImportOptions
): Promise<void> {
  const gradebook = await options.driver.gradebook();
  for (const { competency, item } of plan.items) {
    const live = gradebook.items.find((one) => one.id === item.itemId);
    if (live === undefined) {
      throw new ImportRefused(
        `course ${plan.courseId} has no grade item ${item.itemId}, which the manifest ` +
          `records as ${competency.id}'s ("${item.name}"). Something has removed it since ` +
          `\`setup\` ran, and an import mapped onto an id the course no longer holds ` +
          `lands nowhere or somewhere else. Run \`npm run setup\` to see what the ` +
          `gradebook holds. Nothing has been imported.`
      );
    }
    if (!live.hidden) {
      throw new ImportRefused(
        `grade item ${item.itemId} ("${live.name}") is visible to Students, and ` +
          `importing the sheets into it would publish what a Student is about to be ` +
          `asked at their Oral. Hide it in the gradebook and run this again. Nothing ` +
          `has been imported.`
      );
    }
  }

  assertFilePreparesTheEnrolled(plan, await options.driver.enrolments());

  const before = readFileSync(plan.path, "utf8");
  await options.driver.importSheets({
    path: plan.path,
    columns: plan.columns,
  });
  options.report(
    `imported       ${plan.emails.length} rows into ${plan.items.length} grade items`
  );

  if (readFileSync(plan.path, "utf8") !== before) {
    throw new FileRewrittenDuringImport(plan.path);
  }
  options.report(
    `unchanged      ${plan.path}, importable by hand as it stands`
  );
}

/**
 * Refuses a file that is not the enrolment the course holds now.
 *
 * The promise this command makes is about the enrolled Students and not about
 * the rows of a file: after it, every enrolled Student has a Probe Sheet field
 * waiting in every Grade Item. A file written before somebody enrolled
 * keeps that promise for everyone except them, and the import would report
 * success — the Student it missed is found out at their Oral, which is the one
 * evening there is nothing to be done about it.
 *
 * Both directions, because the file and the enrolment can differ either way and
 * neither difference is the Instructor's mistake to discover halfway through a
 * form: a row for somebody no longer enrolled is a row Moodle has nobody to
 * match, and it fails partway with some sheets in and some not.
 *
 * Checked here, against the live course, rather than at generation: the gap
 * between the two commands is exactly where an enrolment moves.
 */
function assertFilePreparesTheEnrolled(
  plan: ImportPlan,
  enrolments: readonly Enrolment[]
): void {
  const inFile = new Set(plan.emails);
  const missing = enrolments
    .map((student) => student.email)
    .filter((email) => !inFile.has(email));
  if (missing.length > 0) {
    throw new EnrolmentHasMoved(
      `${missing.length} Student${missing.length === 1 ? "" : "s"} enrolled in ` +
        `course ${plan.courseId} ${missing.length === 1 ? "has" : "have"} no row ` +
        `in ${plan.path}: ${missing.join(", ")}. The file was written before they ` +
        `enrolled, and importing it would prepare everyone else and leave them ` +
        `with nothing waiting at their Oral. Nothing has been imported.`
    );
  }

  const enrolled = new Set(enrolments.map((student) => student.email));
  const unknown = plan.emails.filter((email) => !enrolled.has(email));
  if (unknown.length > 0) {
    throw new EnrolmentHasMoved(
      `${plan.path} carries a row for ${unknown.join(", ")}, whom course ` +
        `${plan.courseId} has nobody enrolled as. Moodle matches a row to a ` +
        `Student by email and has none to match ${
          unknown.length === 1 ? "this one" : "these"
        } to: at best the row is passed over, and what a Moodle that treats it as ` +
        `an error does to the rows after it is not something to find out with ` +
        `thirty sheets half in. Nothing has been imported.`
    );
  }
}
