// The Grid Frame states how a course is run (ADR-0014): the Rehearsal before
// the Freeze, the Reading Day, and how the Oral's minutes are spent. The
// wording is the Frame's; the facts are the course's, declared in the Grid
// Source's front matter.
//
// Each of the three is optional, because courses really do differ: one has no
// Rehearsal and no single Reading Day. So what is checked is that a course
// declaring them reads them in the printed grid, in the order a Student meets
// them, and that a course declaring none is told nothing about them at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import {
  BOTH_DELIVERABLES,
  GRID_FACTS,
  GRID_MARKDOWN,
  GRID_SOURCE,
  GRID_TITLE,
  THREE_COMPETENCIES,
  itemNamed,
  makeWorkspace,
  pointContextAtPublisher,
  writeDayOneSet,
  writeGrid,
} from "./harness.ts";

import type { Workspace } from "./harness.ts";

/** The Rehearsal and the Reading Day, as a course states them. */
const REHEARSAL = `rehearsal:
  when: 11 December 2026
  length: 3 hours`;

const READING_DAY = `readingDay:
  when: 4 January 2027 at 09:00`;

/** The Oral's timetable, written inside the `oral:` block. */
const TIMETABLE = `  timetable:
    - at: 0:00–2:00
      what: C1 question
    - at: 6:00–8:00
      what: "A twist: one constraint of your system changes"
    - at: 8:00–9:00
      what: The Instructor settles your Bands`;

/** A Grid Source stating the course's facts and `shape` on top of them. */
function gridStating(workspace: Workspace, shape: string): void {
  writeGrid(workspace, `${shape}\n${BOTH_DELIVERABLES}`);
}

/** The facts of a course that holds all three. */
const ALL_THREE = `${GRID_FACTS}\n${TIMETABLE}\n${REHEARSAL}\n${READING_DAY}`;

/** The printed grid, as the fake course keeps it. */
function printedGrid(workspace: Workspace): string {
  return itemNamed(workspace, GRID_TITLE)?.body ?? "";
}

/** The printed grid's *How the Bands are given* section. */
function bandsSectionOf(grid: string): string {
  const [, section = ""] = grid.split("<h2>How the Bands are given</h2>");
  return section.split("<h2>")[0] ?? "";
}

/** Asserts that each of `needles` appears in `text`, after the one before it. */
function assertInOrder(text: string, needles: readonly string[]): void {
  let from = 0;
  for (const needle of needles) {
    const found = text.indexOf(needle, from);
    assert.notEqual(found, -1, `${needle} is missing, or out of order in:\n${text}`);
    from = found + needle.length;
  }
}

test("a course declaring all three reads them in the order a Student meets them, with its own facts written in", async () => {
  const workspace = makeWorkspace();
  gridStating(workspace, ALL_THREE);

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const bands = bandsSectionOf(printedGrid(workspace));
  assertInOrder(bands, [
    "Rehearsal",
    "3 hours",
    "11 December 2026",
    "Reading Day",
    "4 January 2027 at 09:00",
    "Freeze",
    "Extension",
    "20 minutes",
    "0:00–2:00",
    "C1 question",
    "6:00–8:00",
    "A twist: one constraint of your system changes",
    "8:00–9:00",
    "The Instructor settles your Bands",
  ]);
});

test("the Oral's timetable is printed as the table it is, one row per line the front matter gives", async () => {
  const workspace = makeWorkspace();
  gridStating(workspace, ALL_THREE);

  await workspace.publisher(["publish", "--apply"]);

  const bands = bandsSectionOf(printedGrid(workspace));
  assert.match(bands, /<table>[\s\S]*0:00–2:00[\s\S]*<\/table>/);
  const rows = bands.split("<tr>").filter((row) => row.includes("<td>"));
  assert.equal(rows.length, 3, bands);
});

test("a course declaring none is told nothing about a Rehearsal, a Reading Day or a timetable", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const grid = printedGrid(workspace);
  for (const absent of ["Rehearsal", "Reading Day", "What happens"]) {
    assert.ok(!grid.includes(absent), `"${absent}" is printed`);
  }
  // Nothing is left where a block would have been: no empty heading, no table.
  const bands = bandsSectionOf(grid);
  assert.doesNotMatch(bands, /<table>/);
  assert.doesNotMatch(grid, /\{\{|<!--/);
  // And the rest of the section is what it always was.
  assertInOrder(bands, ["Freeze", "Extension", "provisional Band", "20 minutes"]);
});

test("declaring a Rehearsal in a published course replaces the grid and nothing else", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  gridStating(workspace, `${GRID_FACTS}\n${REHEARSAL}`);

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /replace .*Assessment Grid/);
  assert.match(second.stdout, /0 PDFs to create, 1 to replace, 2 to skip/);
  assert.match(bandsSectionOf(printedGrid(workspace)), /11 December 2026/);
});

/** Each way of writing a block with a field left out, by the field it loses. */
const SHAPE_WITHOUT: Readonly<Record<string, string>> = {
  "rehearsal.when": `${GRID_FACTS}\n${REHEARSAL.replace(/\n {2}when:.*/, "")}`,
  "rehearsal.length": `${GRID_FACTS}\n${REHEARSAL.replace(/\n {2}length:.*/, "")}`,
  "readingDay.when": `${GRID_FACTS}\nreadingDay:\n  on: 4 January 2027`,
  "oral.timetable[2].what": `${GRID_FACTS}\n${TIMETABLE.replace(
    /\n {6}what: "A twist.*/,
    ""
  )}`,
  "oral.timetable[1].at": `${GRID_FACTS}\n${TIMETABLE.replace(
    "    - at: 0:00–2:00\n      what: C1 question",
    "    - what: C1 question"
  )}`,
};

for (const [field, shape] of Object.entries(SHAPE_WITHOUT)) {
  test(`a block with no ${field} fails check, naming the field`, async () => {
    const workspace = makeWorkspace();
    pointContextAtPublisher(workspace);
    gridStating(workspace, shape);

    const result = await workspace.publisher(["check"]);

    assert.notEqual(result.code, 0);
    assert.ok(
      result.stderr.includes(`"${field}"`),
      `the refusal does not name "${field}":\n${result.stderr}`
    );
    assert.ok(result.stderr.includes(GRID_SOURCE), result.stderr);
  });

  test(`a block with no ${field} makes publish refuse before writing anything`, async () => {
    const workspace = makeWorkspace();
    gridStating(workspace, shape);

    const result = await workspace.publisher(["publish", "--apply"]);

    assert.notEqual(result.code, 0);
    assert.ok(result.stderr.includes(`"${field}"`), result.stderr);
    assert.deepEqual(workspace.readCourse().items, []);
    assert.equal(existsSync(workspace.manifestPath), false);
  });
}

test("a rehearsal written as a plain value rather than a block fails check, naming it", async () => {
  const workspace = makeWorkspace();
  pointContextAtPublisher(workspace);
  gridStating(workspace, `${GRID_FACTS}\nrehearsal: 11 December 2026`);

  const result = await workspace.publisher(["check"]);

  assert.notEqual(result.code, 0);
  assert.ok(result.stderr.includes(`"rehearsal"`), result.stderr);
});

test("a timetable written with no rows fails check, naming it", async () => {
  const workspace = makeWorkspace();
  pointContextAtPublisher(workspace);
  workspace.write(
    GRID_SOURCE,
    `---\n${THREE_COMPETENCIES}\n${GRID_FACTS}\n  timetable: []\n${BOTH_DELIVERABLES}\n---\n\n${GRID_MARKDOWN}`
  );

  const result = await workspace.publisher(["check"]);

  assert.notEqual(result.code, 0);
  assert.ok(result.stderr.includes(`"oral.timetable"`), result.stderr);
});
