// The generated Probe Sheets entering the gradebook: one import, three
// Competencies, and every field waiting before the first Oral.
//
// Three of these tests are the ones the command exists for. Nothing it sends
// is a verdict — the Band cells stay as empty as the file, which is ADR-0002
// checked on the half of the path that writes to Moodle. The file is unchanged
// on disk afterwards, which is what makes importing it by hand a real fallback
// rather than a second generation. And a Band a human has entered survives
// everything this program does next, because nothing here reads one back out
// or writes one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

import {
  BOTH_DELIVERABLES,
  GRID_TITLE,
  enrol,
  gradebookRow,
  gridDefining,
  handInTo,
  probeSheetsText,
} from "./harness.ts";
import type { Workspace } from "./harness.ts";

const C1_ITEM = "C1 — Framing and decomposing work";
const C2_ITEM = "C2 — Extending and constraining an agent";
const C3_ITEM = "C3 — Recovering from failure";
const ITEMS = [C1_ITEM, C2_ITEM, C3_ITEM];

const C1_TITLE = "Your repository — C1 and C2";
const C3_TITLE = "Your C3 branch — recovering from failure";

const PROBES = `probes:
  C1:
    - Does the specification resolve an ambiguity the request left open?
  C2:
    - An instruction document the agent reached unprompted, with evidence?
  C3:
    - One command, run live, that goes red on the bug?`;

const AMINA = { email: "amina@epf.fr", name: "Amina Diallo" };
// The second domain again, deliberately: both are in use and neither means
// anything, here as everywhere else.
const BRUNO = { email: "bruno@epfedu.fr", name: "Bruno Meyer" };

/** A repository whose grid defines both Deliverables and the probes. */
function repository(): Workspace {
  const workspace = gridDefining(`${BOTH_DELIVERABLES}\n${PROBES}`);
  workspace.writeCatalog({
    published: [
      {
        source: "assessment-grid.md",
        title: GRID_TITLE,
        section: "Assessment",
      },
    ],
    deliverableSources: ["assessment-grid.md"],
    probeSources: ["assessment-grid.md"],
  });
  return workspace;
}

/**
 * The course as it stands when the sheets are ready to go in: published,
 * configured for the Oral, two Students enrolled, work handed in, and the CSV
 * generated and read.
 */
async function courseReadyToImport(): Promise<Workspace> {
  const workspace = repository();
  const published = await workspace.publisher(["publish", "--apply"]);
  assert.equal(published.code, 0, published.stderr);
  const configured = await workspace.publisher(["setup", "--apply"]);
  assert.equal(configured.code, 0, configured.stderr);

  enrol(workspace, [AMINA, BRUNO]);
  handInTo(workspace, C1_TITLE, {
    email: AMINA.email,
    url: "https://github.com/amina/agents-c1",
  });
  handInTo(workspace, C3_TITLE, {
    email: AMINA.email,
    url: "https://github.com/amina/agents-c1/tree/c3",
  });
  handInTo(workspace, C1_TITLE, {
    email: BRUNO.email,
    url: "https://github.com/bruno/agents-c1",
  });

  const generated = await workspace.publisher(["probes"]);
  assert.equal(generated.code, 0, generated.stderr);
  return workspace;
}

test("one import puts a Probe Sheet in all three grade items, for every Student", async () => {
  const workspace = await courseReadyToImport();

  const result = await workspace.publisher(["import", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  for (const student of [AMINA, BRUNO]) {
    for (const item of ITEMS) {
      const row = gradebookRow(workspace, item, student.email);
      assert.ok(
        row !== undefined,
        `${student.email} has no row in "${item}" after the import`
      );
      // The sheet itself, not merely a row: the probes are what the Oral is
      // opened with, and C3 — the Competency graded live — has its field
      // waiting like the other two rather than being made mid-slot.
      assert.match(row.sheet, /Y \/ N/);
    }
  }
  assert.match(
    gradebookRow(workspace, C3_ITEM, AMINA.email)?.sheet ?? "",
    /goes red on the bug/
  );
  assert.match(
    gradebookRow(workspace, C1_ITEM, BRUNO.email)?.sheet ?? "",
    /Submitted: https:\/\/github\.com\/bruno\/agents-c1/
  );
});

test("the import lands no band anywhere, and says the band columns are ignored", async () => {
  const workspace = await courseReadyToImport();

  const result = await workspace.publisher(["import", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  // ADR-0002 on the writing half of the path. The sheets are prepared; the
  // verdict is the Instructor's, entered in Moodle at the Oral.
  for (const student of [AMINA, BRUNO]) {
    for (const item of ITEMS) {
      assert.equal(
        gradebookRow(workspace, item, student.email)?.band,
        "",
        `${student.email}'s band in "${item}" is not empty`
      );
    }
  }
  assert.match(result.stdout, /band column → ignored, so no verdict travels/);
});

test("the CSV is unchanged on disk after the import", async () => {
  const workspace = await courseReadyToImport();
  const before = probeSheetsText(workspace);

  const result = await workspace.publisher(["import", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  // Byte for byte: what makes the documented manual fallback a fallback is
  // that the file the run failed on is the file that can be imported by hand.
  assert.equal(probeSheetsText(workspace), before);
  assert.match(result.stdout, /importable by hand as it stands/);
});

test("importing is opt-in: without --apply nothing enters the gradebook", async () => {
  const workspace = await courseReadyToImport();
  const before = workspace.readCourse();

  const result = await workspace.publisher(["import"]);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(workspace.readCourse(), before);
  assert.equal(workspace.readCourse().gradebookRows, undefined);
  assert.match(result.stdout, /2 Students/);
  assert.match(result.stdout, /Nothing has been imported/);
});

test("generation alone touches nothing in the gradebook", async () => {
  const workspace = await courseReadyToImport();
  const before = workspace.readCourse();

  const result = await workspace.publisher(["probes"]);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(workspace.readCourse(), before);
  assert.equal(workspace.readCourse().gradebookRows, undefined);
});

test("importing before generating aborts, naming the file and the fallback", async () => {
  const workspace = repository();
  await workspace.publisher(["publish", "--apply"]);
  await workspace.publisher(["setup", "--apply"]);

  const result = await workspace.publisher(["import", "--apply"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /no generated Probe Sheets/);
  assert.match(result.stderr, /npm run probes/);
  assert.match(result.stderr, /Grades → Import → CSV file/);
  assert.equal(workspace.readCourse().gradebookRows, undefined);
});

test("importing before setup aborts, naming the Competency with nowhere to land", async () => {
  const workspace = repository();
  await workspace.publisher(["publish", "--apply"]);
  enrol(workspace, [AMINA]);
  await workspace.publisher(["probes"]);

  const result = await workspace.publisher(["import", "--apply"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /no Grade Item is recorded for C1/);
  assert.match(result.stderr, /npm run setup/);
  assert.equal(workspace.readCourse().gradebookRows, undefined);
});

test("a file that is not the one `probes` writes aborts, importing nothing", async () => {
  const workspace = await courseReadyToImport();
  const generated = probeSheetsText(workspace) ?? "";
  // A column dropped by hand in a spreadsheet: every column after it shifts,
  // and an import mapped by position would put C2's sheets in C3's item.
  writeFileSync(
    workspace.probeSheetsPath,
    generated.replace("name,email,", "email,"),
    "utf8"
  );

  const result = await workspace.publisher(["import", "--apply"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /does not start with the columns/);
  assert.equal(workspace.readCourse().gradebookRows, undefined);
});

test("an import Moodle refuses leaves the CSV where it is, with the fallback", async () => {
  const workspace = await courseReadyToImport();
  const before = probeSheetsText(workspace);
  const course = workspace.readCourse();
  workspace.writeCourse({ ...course, failGradeImport: true });

  const result = await workspace.publisher(["import", "--apply"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /simulated failure/);
  assert.match(result.stderr, /Grades → Import → CSV file/);
  assert.equal(probeSheetsText(workspace), before);
  assert.equal(workspace.readCourse().gradebookRows, undefined);
});

test("a grade item the course has lost aborts before anything is imported", async () => {
  const workspace = await courseReadyToImport();
  const course = workspace.readCourse();
  // Somebody emptied the gradebook between `setup` and the Orals. The manifest
  // still holds the ids, and an import mapped onto ids the course no longer
  // has lands nowhere or somewhere else.
  workspace.writeCourse({ ...course, gradeItems: [] });

  const result = await workspace.publisher(["import", "--apply"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /has no grade item/);
  assert.match(result.stderr, /Nothing has been imported/);
});

test("a grade item somebody has revealed aborts rather than publishing the probes", async () => {
  const workspace = await courseReadyToImport();
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    gradeItems: (course.gradeItems ?? []).map((item) =>
      item.name === C2_ITEM ? { ...item, hidden: false } : item
    ),
  });

  const result = await workspace.publisher(["import", "--apply"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /is visible to Students/);
  assert.equal(workspace.readCourse().gradebookRows, undefined);
});

test("nothing reads a Band back out, and re-importing keeps the one a human entered", async () => {
  const workspace = await courseReadyToImport();
  await workspace.publisher(["import", "--apply"]);

  // The Instructor grades Amina's C1 at her Oral, in Moodle, where the verdict
  // lives. A late enrolment then sends the sheets through again.
  const course = workspace.readCourse();
  const c1 = (course.gradeItems ?? []).find((item) => item.name === C1_ITEM);
  assert.ok(c1 !== undefined);
  workspace.writeCourse({
    ...course,
    gradebookRows: {
      ...course.gradebookRows,
      [c1.id]: (course.gradebookRows?.[c1.id] ?? []).map((row) =>
        row.email === AMINA.email ? { ...row, band: "Solid" } : row
      ),
    },
  });

  const regenerated = await workspace.publisher(["probes"]);
  assert.equal(regenerated.code, 0, regenerated.stderr);
  const again = await workspace.publisher(["import", "--apply"]);
  assert.equal(again.code, 0, again.stderr);
  const audited = await workspace.publisher(["audit"]);

  // The verdict is untouched by every command that ran after it, and no run
  // ever printed it: this repository is not a second source of truth for one.
  assert.equal(gradebookRow(workspace, C1_ITEM, AMINA.email)?.band, "Solid");
  for (const output of [
    regenerated.stdout,
    again.stdout,
    audited.stdout,
    readFileSync(workspace.probeSheetsPath, "utf8"),
  ]) {
    assert.doesNotMatch(output, /Solid/);
  }
});

test("a Student who enrolled since the file was written aborts before the import", async () => {
  const workspace = await courseReadyToImport();
  // Someone enrolled in the hour between generating the sheets and importing
  // them. The file has no row for them, so an import of it would report
  // success and leave one Student with nothing waiting at their Oral.
  enrol(workspace, [{ email: "chloe@epf.fr", name: "Chloé Roy" }]);

  const result = await workspace.publisher(["import", "--apply"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /chloe@epf\.fr/);
  assert.match(result.stderr, /npm run probes/);
  assert.equal(workspace.readCourse().gradebookRows, undefined);
});

test("a row for somebody no longer enrolled aborts before the import", async () => {
  const workspace = await courseReadyToImport();
  // Unenrolled after the file was written. Moodle matches rows by email and
  // has nobody to match this one to, so the import would fail partway with
  // some Students' sheets in and some not.
  const course = workspace.readCourse();
  workspace.writeCourse({ ...course, enrolments: [AMINA] });

  const result = await workspace.publisher(["import", "--apply"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /bruno@epfedu\.fr/);
  assert.match(result.stderr, /npm run probes/);
  assert.equal(workspace.readCourse().gradebookRows, undefined);
});
