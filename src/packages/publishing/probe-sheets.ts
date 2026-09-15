// An entry point: the Probe Sheets the Instructor opens each Oral with,
// generated as a CSV and written to a file.
//
// One Probe Sheet is one Student and one Competency. It carries the yes/no
// probes drawn from that Competency's band criteria, so that what is asked is
// what Students were told they would be asked; the URL that Student handed in,
// so that nobody is cross-referencing the Devoir and the gradebook in the
// middle of six minutes; an **empty** provisional Band; and an **empty**
// weakest point to probe.
//
// Nothing here suggests a Band. That is the whole content of ADR-0002, and it
// is checked rather than intended: the file this writes is read back before it
// is written out, and a run that produced a sheet naming a Band aborts with the
// file untouched.
//
// Generation writes a file and touches nothing else — the property every other
// command here has, that reporting is the default and applying is opt-in. What
// enters the gradebook is a separate step, driven from this same file.
//
// The sheets are built from the enrolment as it is at the moment they are
// asked for, so a Student who enrolled late is in the set. Students are matched
// by **email**: it is the only identity field this Moodle populates —
// `idnumber` is empty on every sampled user — and it is treated as opaque
// throughout. Two domains are in use, `@epf.fr` and `@epfedu.fr`, and nothing
// here reads one.
import { bandNamedIn, gradeItemName } from "../course/gradebook.ts";
import { devoirEntryFor } from "../manifest/index.ts";

import { toCsv } from "./lib/csv.ts";

import type { Competency } from "../course/gradebook.ts";
import type { CourseDriver, Enrolment, Submission } from "../course/index.ts";
import type { Deliverable } from "../catalog/deliverables.ts";
import type { Probes } from "../catalog/probes.ts";
import type { Manifest } from "../manifest/index.ts";

/** What a sheet says where a Student has handed nothing in. */
export const NOTHING_HANDED_IN = "nothing handed in";

/** The label above the field the Instructor fills in during the Oral. */
export const WEAKEST_POINT = "Weakest point to probe:";

/** How a probe is offered to be answered, since the sheet is filled in by hand. */
const YES_NO = "Y / N";

/**
 * Nobody is enrolled in the course.
 *
 * An abort and not a header row on its own: a CSV with no Students in it is a
 * file that imports cleanly and grades nobody, and the run that produced it
 * said "written" either way. Whoever generated sheets the evening before the
 * Orals did so because there are Students to examine.
 */
export class NobodyEnrolled extends Error {
  constructor(courseId: string) {
    super(
      `Aborting: nobody is enrolled in course ${courseId}, so there are no Probe Sheets to ` +
        `generate. Enrolment is mirrored — no tool here adds anyone — so check the course's ` +
        `participants page. Nothing has been written.`
    );
    this.name = "NobodyEnrolled";
  }
}

/**
 * A Submission whose email matches nobody enrolled.
 *
 * The abort this feature is most likely to need. A Student who handed work in
 * and is not in the enrolment this run read is either somebody who has since
 * been unenrolled, or — the case worth stopping over — a reading of one of the
 * two pages that did not come out as expected. Either way the alternative to
 * stopping is a Probe Sheet silently missing from the set, which is found out
 * at that Student's Oral with nothing prepared.
 */
export class UnknownStudent extends Error {
  readonly email: string;

  constructor(email: string, deliverable: Deliverable) {
    super(
      `Aborting: "${email}" has handed work into "${deliverable.title}" and is not enrolled ` +
        `in this course, so there is nobody to prepare that Probe Sheet for. Students are ` +
        `matched by email, which is the only identity Moodle fills in here. Check the ` +
        `participants page for that address — an unenrolled Student's work is still work ` +
        `somebody handed in. Nothing has been written.`
    );
    this.name = "UnknownStudent";
    this.email = email;
  }
}

/** No Deliverable serves a Competency, or two do. */
export class CompetencyNotDeliverable extends Error {
  constructor(competency: Competency, serving: readonly Deliverable[]) {
    super(
      serving.length === 0
        ? `Aborting: no Deliverable serves ${competency.id}, so a Probe Sheet for it would carry ` +
            `no URL and the Oral would open on a repository nobody can find. Give one of the ` +
            `Deliverables "${competency.id}" in its competencies. Nothing has been written.`
        : `Aborting: ${serving.length} Deliverables serve ${competency.id} — ` +
            `${serving.map((one) => `"${one.title}"`).join(" and ")} — so a Probe Sheet for ` +
            `it would have to carry two URLs and this program will not pick one. Nothing has ` +
            `been written.`
    );
    this.name = "CompetencyNotDeliverable";
  }
}

/** A Deliverable whose Devoir has not been published, so nothing can be read. */
export class DevoirNotPublished extends Error {
  constructor(deliverable: Deliverable) {
    super(
      `Aborting: nothing is recorded as published for Deliverable "${deliverable.id}" ` +
        `("${deliverable.title}"), so what Students handed in for it cannot be read. Run the ` +
        `publisher with --apply first: the Devoir is what the URLs are handed into. Nothing ` +
        `has been written.`
    );
    this.name = "DevoirNotPublished";
  }
}

/**
 * A Student's row is short of a sheet.
 *
 * This program's own invariant, checked where it is relied on: one sheet per
 * enrolled Student per Competency is what {@link buildProbeSheets} promises and
 * what {@link formatProbeSheetsCsv} lays the file out from. Writing an empty
 * feedback cell instead would be the one outcome the whole feature exists to
 * prevent — a Student whose sheet is missing, found out at their Oral — written
 * out by a run that said it had prepared them.
 */
export class SheetMissing extends Error {
  constructor(student: Enrolment, competency: Competency) {
    super(
      `Aborting: no Probe Sheet was prepared for ${student.email} at ${competency.id}, so ` +
        `their row would carry an empty sheet where the questions go. That is a fault in ` +
        `this program rather than in the course. Nothing has been written.`
    );
    this.name = "SheetMissing";
  }
}

/**
 * The generated file names a Band.
 *
 * The last guard on ADR-0002, and the one that does not depend on anybody
 * remembering it: whatever the probes were edited to say, whatever a column was
 * renamed to, the file is read back before it is written out and a Band
 * anywhere in what this program authored stops the run.
 *
 * What is checked is the text this program wrote — the header, the probes and
 * the labels — and not the URL a Student handed in. A repository called
 * `solid-state` is a fact about a Student's work, not this program having an
 * opinion about their verdict, and refusing over it would be this guard
 * blocking an Oral for a word in a URL.
 */
export class SheetNamesABand extends Error {
  constructor(band: string, where: string) {
    super(
      `Aborting: the generated Probe Sheets name the band "${band}" in ${where}. A sheet ` +
        `carries the questions and an empty verdict — the tooling prepares it and the ` +
        `Instructor fills it in (ADR-0002). Nothing has been written.`
    );
    this.name = "SheetNamesABand";
  }
}

/** One Student's sheet for one Competency. */
export interface ProbeSheet {
  readonly student: Enrolment;
  readonly competency: Competency;
  /** The yes/no probes, as the grid's front matter writes them. */
  readonly probes: readonly string[];
  /** What that Student handed in for it, or nothing. */
  readonly submitted: string | undefined;
}

/** Every sheet a run prepared, and who they are for. */
export interface ProbeSheets {
  readonly students: readonly Enrolment[];
  /** What the sheets are for, in the order the grid declares them. */
  readonly competencies: readonly Competency[];
  /** Student-major, then in Competency order: the order the CSV's rows go in. */
  readonly sheets: readonly ProbeSheet[];
}

/** What one Deliverable's Devoir holds, read from the live course. */
export interface HandedIn {
  readonly deliverable: Deliverable;
  readonly submissions: readonly Submission[];
}

/**
 * The Deliverable serving `competency`, or an abort.
 *
 * Exactly one, because a Probe Sheet carries one URL. Two Deliverables serving
 * one Competency is a repository and a branch competing for the same line of
 * the sheet, and there is nothing in the front matter that says which the
 * Instructor should be looking at.
 */
export function deliverableFor(
  deliverables: readonly Deliverable[],
  competency: Competency
): Deliverable {
  const serving = deliverables.filter((one) =>
    one.competencies.includes(competency.id)
  );
  const [only, second] = serving;
  if (only === undefined || second !== undefined) {
    throw new CompetencyNotDeliverable(competency, serving);
  }
  return only;
}

/**
 * Reads the live course: who is enrolled, and what has been handed into each
 * Deliverable's Devoir.
 *
 * Read here, in one place and at the moment the sheets are made, because that
 * is what "generated from the live enrolment at generation time" means — a
 * Student who enrolled this afternoon is on the participants page this reads,
 * and therefore in the set.
 */
export async function readCourse(
  driver: CourseDriver,
  deliverables: readonly Deliverable[],
  competencies: readonly Competency[],
  manifest: Manifest
): Promise<{
  readonly enrolments: readonly Enrolment[];
  readonly handedIn: readonly HandedIn[];
}> {
  // Every Competency has to have its Deliverable before the course is read, so
  // that a grid nobody finished editing is not found out halfway through
  // opening grading pages.
  const serving = competencies.map((competency) =>
    deliverableFor(deliverables, competency)
  );
  const wanted = serving.filter(
    (one, at) => serving.findIndex((other) => other.id === one.id) === at
  );

  const handedIn: HandedIn[] = [];
  for (const deliverable of wanted) {
    const entry = devoirEntryFor(manifest, deliverable.id);
    if (entry === undefined) throw new DevoirNotPublished(deliverable);
    handedIn.push({
      deliverable,
      submissions: await driver.submissions(entry.moduleId),
    });
  }
  return { enrolments: await driver.enrolments(), handedIn };
}

/**
 * One sheet per enrolled Student per Competency.
 *
 * Every enrolled Student gets a sheet for every Competency, whether or not they
 * handed anything in: a Student who handed nothing in is a Student who sits an
 * Oral and is given a verdict, and a sheet missing from the set is the one
 * thing this generation must never produce.
 *
 * The Submissions are matched to the enrolment and not the other way round, and
 * a Submission matching nobody stops the run.
 */
export function buildProbeSheets(input: {
  readonly enrolments: readonly Enrolment[];
  readonly handedIn: readonly HandedIn[];
  readonly probes: Probes;
  readonly courseId: string;
}): ProbeSheets {
  if (input.enrolments.length === 0) throw new NobodyEnrolled(input.courseId);

  const enrolled = new Set(input.enrolments.map((student) => student.email));
  // Deliberately keyed by the email exactly as each page spells it. Nothing is
  // lower-cased, trimmed to a domain or otherwise normalised: an address that
  // matches on one page and not the other is a Student whose sheet would go
  // missing, and that is a thing to be told about rather than to paper over.
  const byDeliverable = new Map<string, Map<string, string>>();
  for (const { deliverable, submissions } of input.handedIn) {
    const urls = new Map<string, string>();
    for (const submission of submissions) {
      if (!enrolled.has(submission.email)) {
        throw new UnknownStudent(submission.email, deliverable);
      }
      urls.set(submission.email, submission.url);
    }
    byDeliverable.set(deliverable.id, urls);
  }

  // Which Deliverable each Competency's URL comes from is settled once, before
  // any sheet is made, rather than re-solved inside every Student's row: it is
  // a fact about the grid and not about the Student.
  const deliverableServing = input.probes.map(({ competency, probes }) => ({
    competency,
    probes,
    deliverable: deliverableFor(
      input.handedIn.map((one) => one.deliverable),
      competency
    ),
  }));

  const sheets = input.enrolments.flatMap((student) =>
    deliverableServing.map(
      ({ competency, probes, deliverable }): ProbeSheet => ({
        student,
        competency,
        probes,
        submitted: byDeliverable.get(deliverable.id)?.get(student.email),
      })
    )
  );
  return {
    students: input.enrolments,
    competencies: input.probes.map((one) => one.competency),
    sheets,
  };
}

/** The header of the feedback column carrying one Competency's sheets. */
export function feedbackColumn(competency: Competency): string {
  return `Feedback: ${gradeItemName(competency)}`;
}

/**
 * One Probe Sheet, as it reads in the gradebook: what they handed in, the
 * probes, and the empty line the Instructor writes on.
 *
 * The provisional Band is not here. It is the grade cell beside this one, left
 * empty, valued on the Bands scale — so the sheet the Instructor reads and the
 * verdict they enter are one row of one gradebook screen, and the emptiness of
 * the verdict is the absence of a value rather than a word this program chose.
 */
export function formatSheet(sheet: ProbeSheet): string {
  return [
    `Submitted: ${sheet.submitted ?? NOTHING_HANDED_IN}`,
    ...sheet.probes.map((probe) => `${probe}  ${YES_NO}`),
    WEAKEST_POINT,
  ].join("\n");
}

/**
 * The sheets as a CSV: one row per Student, one pair of columns per Competency.
 *
 * One row per Student rather than one per sheet, because this file is imported
 * through Moodle's own gradebook import, which reads a row as a user and a
 * column as a grade item. One Probe Sheet is therefore one Student's row at one
 * Competency's pair of columns: the grade cell, empty, and the feedback cell
 * carrying the sheet. One file, one import, every Competency the grid declares
 * — including the one read last, so that even its field is waiting rather than
 * being made mid-slot.
 *
 * The name column is for the human reading the file and is mapped to "ignore"
 * on import; `email` is what the import identifies a user by, because it is the
 * only identity this Moodle populates.
 */
export function formatProbeSheetsCsv(sheets: ProbeSheets): string {
  // By email, then by Competency id.
  const byStudent = new Map<string, Map<string, ProbeSheet>>();
  for (const sheet of sheets.sheets) {
    const forStudent =
      byStudent.get(sheet.student.email) ?? new Map<string, ProbeSheet>();
    forStudent.set(sheet.competency.id, sheet);
    byStudent.set(sheet.student.email, forStudent);
  }

  const columns = probeSheetsColumns(sheets.competencies);
  const header = columns.map((column) => column.heading);
  const rows = sheets.students.map((student) =>
    columns.map((column) => cellFor(column, student, byStudent))
  );

  assertNothingSuggestsABand(header, rows, columns, sheets);
  return toCsv([header, ...rows]);
}

/**
 * One column of the generated file: what it is called, and what goes in it.
 *
 * A role and not a heading is what the rest of the program asks about. The
 * import maps the file's columns by position, so what a column means has to be
 * one fact stated once — the file, its header check and its column mapping all
 * read it here — rather than a layout each of them lays out again and one of
 * them lays out differently.
 */
export type SheetColumn =
  | { readonly heading: string; readonly role: "name" | "identity" }
  | {
      readonly heading: string;
      readonly role: "band" | "sheet";
      readonly competency: Competency;
    };

/**
 * The columns of the file, in the order it writes them: who the row is for,
 * then a Band cell and a sheet cell per Competency.
 *
 * One pair per Competency and the Band cell first, because that is the order
 * Moodle's gradebook shows them in — the verdict, and the sheet it was reached
 * from, side by side on one screen at the Oral.
 */
export function probeSheetsColumns(
  competencies: readonly Competency[]
): readonly SheetColumn[] {
  return [
    { heading: "name", role: "name" },
    { heading: "email", role: "identity" },
    ...competencies.flatMap((competency): readonly SheetColumn[] => [
      { heading: gradeItemName(competency), role: "band", competency },
      { heading: feedbackColumn(competency), role: "sheet", competency },
    ]),
  ];
}

/**
 * Where the Band cells are, worked out from the columns themselves.
 *
 * Not counted out as "every other column after the first two": that is the
 * layout stated twice, where adding one identity column silently moves the
 * ADR-0002 check onto the feedback cells and off the cells that could hold a
 * verdict.
 */
function bandCellsOf(columns: readonly SheetColumn[]): readonly number[] {
  return columns.flatMap((column, at) => (column.role === "band" ? [at] : []));
}

/** What one Student's row holds in one column. */
function cellFor(
  column: SheetColumn,
  student: Enrolment,
  byStudent: ReadonlyMap<string, ReadonlyMap<string, ProbeSheet>>
): string {
  switch (column.role) {
    case "name":
      return student.name;
    case "identity":
      return student.email;
    // Empty on purpose: the provisional Band is the Instructor's to enter.
    case "band":
      return "";
    case "sheet": {
      const sheet = byStudent.get(student.email)?.get(column.competency.id);
      if (sheet === undefined)
        throw new SheetMissing(student, column.competency);
      return formatSheet(sheet);
    }
  }
}

/**
 * Refuses a file that names a Band, or that carries one in a grade cell.
 *
 * Two checks, because "nothing suggests a Band" has two ways of going wrong: a
 * word this program wrote — in a column heading, in a probe, in a label — and a
 * value sitting in the column the Band goes in. Only what this program authored
 * is read for words; a Student's URL is their data, and this guard has no
 * business having an opinion about it.
 */
function assertNothingSuggestsABand(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  columns: readonly SheetColumn[],
  sheets: ProbeSheets
): void {
  const bandCells = bandCellsOf(columns);
  // Whose row it is, asked of the columns like everything else here: a row
  // named by a hardcoded cell number is the layout stated twice again.
  const identityAt = columns.findIndex((column) => column.role === "identity");
  for (const heading of header) {
    const band = bandNamedIn(heading);
    if (band !== undefined)
      throw new SheetNamesABand(band, `the column "${heading}"`);
  }
  for (const sheet of sheets.sheets) {
    const authored = [...sheet.probes, WEAKEST_POINT, NOTHING_HANDED_IN].join(
      "\n"
    );
    const band = bandNamedIn(authored);
    if (band !== undefined) {
      throw new SheetNamesABand(
        band,
        `${sheet.student.email}'s ${sheet.competency.id} sheet`
      );
    }
  }
  // Every Band cell is empty in every row. Where those cells are is not counted
  // out here: the columns themselves say which ones they are.
  for (const row of rows) {
    for (const at of bandCells) {
      const value = row[at] ?? "";
      if (value !== "") {
        throw new SheetNamesABand(
          value,
          `the "${header[at] ?? ""}" cell of ${row[identityAt] ?? "a Student"}`
        );
      }
    }
  }
}

/** What the run says it prepared, for the Instructor reading the output. */
export function formatProbeSheets(sheets: ProbeSheets, path: string): string {
  const handedIn = sheets.sheets.filter(
    (sheet) => sheet.submitted !== undefined
  ).length;
  return [
    `Probe Sheets for ${sheets.students.length} enrolled ${
      sheets.students.length === 1 ? "Student" : "Students"
    }:`,
    ...sheets.competencies.map((competency) => {
      const sheetsFor = sheets.sheets.filter(
        (sheet) => sheet.competency.id === competency.id
      );
      const carryingUrl = sheetsFor.filter(
        (sheet) => sheet.submitted !== undefined
      ).length;
      return (
        `  ${competency.id}  ${sheetsFor.length} sheets, ${carryingUrl} carrying a submitted ` +
        `URL, ${sheetsFor[0]?.probes.length ?? 0} probes each`
      );
    }),
    "",
    `${sheets.sheets.length} sheets, ${handedIn} of them carrying a URL. Every provisional ` +
      `band and every weakest point is empty: this prepares the sheet, you fill it in.`,
    `Written to ${path}. Nothing in the course or the gradebook has been changed.`,
  ].join("\n");
}
