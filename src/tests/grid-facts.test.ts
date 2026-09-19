// The Grid Frame states the course's own facts (ADR-0014): the course, the
// programme and the term in its opening line, the Oral's length and when it
// happens, and each Freeze. Each is written from `publisher.json` and the Grid
// Source's front matter, never from prose, so what a Student reads cannot
// disagree with what the Devoir enforces.
//
// What is checked is what a Student reads in the printed grid, and what an
// Instructor is told when a fact is missing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import {
  BOTH_DELIVERABLES,
  COURSE_NAME,
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

/** The printed grid, as the fake course keeps it. */
function printedGrid(workspace: Workspace): string {
  return itemNamed(workspace, GRID_TITLE)?.body ?? "";
}

/** The printed grid's body below its title, up to the first section. */
function openingOf(grid: string): string {
  const [, afterTitle = ""] = grid.split("</h1>");
  return afterTitle.split("<h2>")[0] ?? "";
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

/** A Deliverable serving C1, due at `due`. */
function deliverable(id: string, title: string, due: string): string {
  return `  - id: ${id}
    title: ${title}
    competencies: [C1]
    due: ${due}`;
}

test("the grid opens with a line naming the course, the programme and the term", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const opening = openingOf(printedGrid(workspace));
  assertInOrder(opening, [COURSE_NAME, "Ingénieur 4A", "Autumn 2026"]);
});

test("the grid's account of the Oral states its length and when it happens", async () => {
  const workspace = makeWorkspace();

  await workspace.publisher(["publish", "--apply"]);

  const bands = bandsSectionOf(printedGrid(workspace));
  assert.match(bands, /20 minutes/);
  assert.match(bands, /14 and 15 September 2026/);
});

test("the grid gives one Freeze line per Deliverable, in due order, with its title and its Paris time and date", async () => {
  const workspace = makeWorkspace();
  // Written latest first: the grid states them in the order they fall.
  writeGrid(
    workspace,
    `deliverables:
${deliverable("late", "Your C3 branch", "2026-09-11T09:30:00+02:00")}
${deliverable("early", "Your repository", "2026-09-10T20:00:00+02:00")}`
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const bands = bandsSectionOf(printedGrid(workspace));
  assertInOrder(bands, [
    "Your repository",
    "20:00 on Thursday 10 September 2026",
    "Your C3 branch",
    "09:30 on Friday 11 September 2026",
    "Extension",
  ]);
  assert.equal(bands.match(/<strong>Freeze<\/strong>/g)?.length, 2, bands);
  assert.doesNotMatch(bands, /\d{4}-\d{2}-\d{2}T/);
});

test("a Freeze written with a winter offset and one with a summer offset are both printed in Paris time", async () => {
  const workspace = makeWorkspace();
  writeGrid(
    workspace,
    `deliverables:
${deliverable("summer", "Your first draft", "2026-09-10T20:00:00+02:00")}
${deliverable("winter", "Your final report", "2026-12-11T18:00:00+01:00")}
${deliverable("spring", "Your resit", "2027-03-29T12:00:00+02:00")}`
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assertInOrder(bandsSectionOf(printedGrid(workspace)), [
    "Your first draft",
    "20:00 on Thursday 10 September 2026",
    "Your final report",
    "18:00 on Friday 11 December 2026",
    "Your resit",
    "12:00 on Monday 29 March 2027",
  ]);
});

test("moving a Deliverable's due alone replaces the grid", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  writeGrid(
    workspace,
    BOTH_DELIVERABLES.replace(
      "2026-09-10T20:00:00+02:00",
      "2026-09-10T14:00:00+02:00"
    )
  );

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /replace .*Assessment Grid/);
  assert.match(second.stdout, /0 PDFs to create, 1 to replace, 2 to skip/);
  assert.match(
    bandsSectionOf(printedGrid(workspace)),
    /14:00 on Thursday 10 September 2026/
  );
});

/** The fixture's facts with `field`'s line (and anything under it) left out. */
const FACTS_WITHOUT: Readonly<Record<string, string>> = {
  programme: GRID_FACTS.replace(/^programme:.*\n/m, ""),
  term: GRID_FACTS.replace(/^term:.*\n/m, ""),
  oral: GRID_FACTS.replace(/^oral:\n(?: {2}.*\n?)*/m, ""),
  "oral.length": GRID_FACTS.replace(/^ {2}length:.*\n/m, ""),
  "oral.when": GRID_FACTS.replace(/\n {2}when:.*$/m, ""),
};

/** A Grid Source whose front matter states `facts` and nothing else of them. */
function gridStating(workspace: Workspace, facts: string): void {
  workspace.write(
    GRID_SOURCE,
    `---\n${THREE_COMPETENCIES}\n${facts}\n${BOTH_DELIVERABLES}\n---\n\n${GRID_MARKDOWN}`
  );
}

for (const [field, facts] of Object.entries(FACTS_WITHOUT)) {
  test(`a Grid Source with no ${field} fails check, naming the field`, async () => {
    const workspace = makeWorkspace();
    pointContextAtPublisher(workspace);
    gridStating(workspace, facts);

    const result = await workspace.publisher(["check"]);

    assert.notEqual(result.code, 0);
    assert.ok(
      result.stderr.includes(`"${field}"`),
      `the refusal does not name "${field}":\n${result.stderr}`
    );
    assert.ok(result.stderr.includes(GRID_SOURCE), result.stderr);
  });

  test(`a Grid Source with no ${field} makes publish refuse before writing anything`, async () => {
    const workspace = makeWorkspace();
    gridStating(workspace, facts);

    const result = await workspace.publisher(["publish", "--apply"]);

    assert.notEqual(result.code, 0);
    assert.ok(result.stderr.includes(`"${field}"`), result.stderr);
    assert.deepEqual(workspace.readCourse().items, []);
    assert.equal(existsSync(workspace.manifestPath), false);
  });
}

test("an oral written as a plain value rather than a block fails check, naming it", async () => {
  const workspace = makeWorkspace();
  pointContextAtPublisher(workspace);
  gridStating(
    workspace,
    GRID_FACTS.replace(/^oral:\n(?: {2}.*\n?)*/m, "oral: 20 minutes")
  );

  const result = await workspace.publisher(["check"]);

  assert.notEqual(result.code, 0);
  assert.ok(result.stderr.includes(`"oral"`), result.stderr);
});
