// Competencies, declared in the grid beside the Deliverables and the probes.
//
// A course is graded on whatever Competencies its grid declares, not on three
// written into the publisher: the Grade Items `setup` makes, the Probe Sheets
// `probes` writes and the columns `import` maps all follow the `competencies:`
// block. What stays fixed is the five Bands and their scale — the verdict is
// EPF's, whatever is being judged.
//
// So most of these tests are a course with two Competencies, and refusals of a
// grid whose Deliverables or probes name one it does not declare.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GRID_MARKDOWN,
  GRID_SOURCE,
  enrol,
  gradebookRow,
  gridDefining,
  handInTo,
  makeWorkspace,
  probeSheets,
  probeSheetsText,
} from "./harness.ts";

const BANDS = ["Resit", "Needs Work", "Basic", "Solid", "Outstanding"];

const TWO_COMPETENCIES = `competencies:
  - id: K1
    title: Reading a codebase
  - id: K2
    title: Changing it safely`;

const K1_ITEM = "K1 — Reading a codebase";
const K2_ITEM = "K2 — Changing it safely";

const REPOSITORY = "Your repository";

/** One Deliverable serving both Competencies. */
function deliverableServing(competencies: string): string {
  return `deliverables:
  - id: k-1
    title: ${REPOSITORY}
    competencies: [${competencies}]
    due: 2026-09-10T20:00:00+02:00`;
}

const PROBES = `probes:
  K1:
    - Can they name the seam before the file?
  K2:
    - One command, run live, that goes red?`;

const AMINA = { email: "amina@epf.fr", name: "Amina Diallo" };
const BRUNO = { email: "bruno@epfedu.fr", name: "Bruno Meyer" };

test("a grid declaring two Competencies yields two grade items, two sheets per Student, and two imported columns", async () => {
  const workspace = gridDefining(
    `${TWO_COMPETENCIES}\n${deliverableServing("K1, K2")}\n${PROBES}`
  );
  const published = await workspace.publisher(["publish", "--apply"]);
  assert.equal(published.code, 0, published.stderr);

  const configured = await workspace.publisher(["setup", "--apply"]);
  assert.equal(configured.code, 0, configured.stderr);
  const course = workspace.readCourse();
  assert.deepEqual(
    (course.gradeItems ?? []).map((item) => item.name),
    [K1_ITEM, K2_ITEM]
  );
  // The scale is EPF's and not the grid's: five Bands, in order, whatever the
  // course declares.
  assert.deepEqual(
    (course.scales ?? []).map((scale) => scale.values),
    [BANDS]
  );

  enrol(workspace, [AMINA, BRUNO]);
  handInTo(workspace, REPOSITORY, {
    email: AMINA.email,
    url: "https://github.com/amina/codebase",
  });
  const generated = await workspace.publisher(["probes"]);
  assert.equal(generated.code, 0, generated.stderr);
  const { header, rows } = probeSheets(workspace);
  assert.deepEqual(header, [
    "name",
    "email",
    K1_ITEM,
    `Feedback: ${K1_ITEM}`,
    K2_ITEM,
    `Feedback: ${K2_ITEM}`,
  ]);
  assert.equal(rows.length, 2);

  const imported = await workspace.publisher(["import", "--apply"]);
  assert.equal(imported.code, 0, imported.stderr);
  for (const student of [AMINA, BRUNO]) {
    assert.match(
      gradebookRow(workspace, K1_ITEM, student.email)?.sheet ?? "",
      /Can they name the seam before the file\?/
    );
    assert.match(
      gradebookRow(workspace, K2_ITEM, student.email)?.sheet ?? "",
      /One command, run live, that goes red\?/
    );
    assert.equal(gradebookRow(workspace, K1_ITEM, student.email)?.band, "");
  }
});

test("a Deliverable naming a Competency the grid does not declare aborts", async () => {
  const workspace = gridDefining(
    `${TWO_COMPETENCIES}\n${deliverableServing("K1, C3")}\n${PROBES}`
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /"k-1"/);
  assert.match(result.stderr, /"C3"/);
  assert.match(result.stderr, /K1, K2/);
  assert.deepEqual(workspace.readCourse().items, []);
});

test("probes keyed by a Competency the grid does not declare abort", async () => {
  const workspace = gridDefining(
    `${TWO_COMPETENCIES}\n${deliverableServing("K1, K2")}\n${PROBES}
  K3:
    - A question nobody is graded on?`
  );

  const result = await workspace.publisher(["probes"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /"K3"/);
  assert.match(result.stderr, /K1, K2/);
  assert.equal(probeSheetsText(workspace), undefined);
});

test("a declared Competency with no probes aborts, naming it", async () => {
  const workspace = gridDefining(
    `${TWO_COMPETENCIES}\n${deliverableServing("K1, K2")}
probes:
  K1:
    - Can they name the seam before the file?`
  );

  const result = await workspace.publisher(["probes"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /defines no probes for K2/);
  assert.equal(probeSheetsText(workspace), undefined);
});

test("two Competencies with one id abort, before any grade item is made", async () => {
  const workspace = gridDefining(
    `competencies:
  - id: K1
    title: Reading a codebase
  - id: K1
    title: Changing it safely
${deliverableServing("K1")}
probes:
  K1:
    - Can they name the seam before the file?`
  );

  for (const command of [["publish", "--apply"], ["setup", "--apply"]]) {
    const result = await workspace.publisher(command);

    assert.equal(result.code, 1, `${command.join(" ")} was accepted`);
    assert.match(result.stderr, /"K1"/);
    assert.match(result.stderr, /Reading a codebase/);
    assert.match(result.stderr, /Changing it safely/);
  }
  assert.deepEqual(workspace.readCourse().items, []);
  assert.deepEqual(workspace.readCourse().gradeItems ?? [], []);
});

test("a Competency missing its title aborts, naming it", async () => {
  const workspace = gridDefining(
    `competencies:
  - id: K1
${deliverableServing("K1")}
probes:
  K1:
    - Can they name the seam before the file?`
  );

  const result = await workspace.publisher(["setup", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /"K1"/);
  assert.match(result.stderr, /"title"/);
  assert.deepEqual(workspace.readCourse().gradeItems ?? [], []);
});

test("a grid with no competencies block aborts every command, naming the block", async () => {
  const workspace = makeWorkspace();
  // Written out by hand rather than through the harness, which declares the
  // fixture course's Competencies for every grid that does not.
  workspace.write(
    GRID_SOURCE,
    `---\n${deliverableServing("K1, K2")}\n${PROBES}\n---\n\n${GRID_MARKDOWN}`
  );

  for (const command of [
    ["publish", "--apply"],
    ["setup", "--apply"],
    ["probes"],
    ["import", "--apply"],
  ]) {
    const result = await workspace.publisher(command);

    assert.equal(result.code, 1, `${command.join(" ")} was accepted`);
    assert.match(result.stderr, /"competencies:"/);
    assert.match(result.stderr, /assessment-grid\.md/);
  }
  assert.deepEqual(workspace.readCourse().items, []);
  assert.deepEqual(workspace.readCourse().gradeItems ?? [], []);
});
