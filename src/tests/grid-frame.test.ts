// The Assessment Grid a Student reads is assembled (ADR-0014): the Grid Frame
// the publisher ships, with the course's Competency blocks from its Grid Source
// written into it, each headed by its id and its title from `competencies:`.
//
// What is checked is what a Student reads in the printed grid, and that every
// other document is printed as it always was.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  GRID_FRONT_MATTER,
  GRID_MARKDOWN,
  GRID_SOURCE,
  GRID_TITLE,
  THREE_COMPETENCIES,
  competencyBlocks,
  installedPublisher,
  itemNamed,
  makeWorkspace,
  writeDayOneSet,
  writeGrid,
} from "./harness.ts";

import type { Workspace } from "./harness.ts";

/** Where the installed publisher keeps the Grid Frame. */
const GRID_FRAME = "docs/grid-frame.md";

function shippedFrame(): string {
  return readFileSync(join(installedPublisher(), GRID_FRAME), "utf8");
}

const LECTURE = "Lecture 1 — Framing and decomposing";

/** The printed grid, as the fake course keeps it. */
function printedGrid(workspace: Workspace): string {
  return itemNamed(workspace, GRID_TITLE)?.body ?? "";
}

/** Asserts that each of `needles` appears in `text`, after the one before it. */
function assertInOrder(text: string, needles: readonly (string | RegExp)[]): void {
  let from = 0;
  for (const needle of needles) {
    const rest = text.slice(from);
    const found =
      typeof needle === "string" ? rest.indexOf(needle) : rest.search(needle);
    assert.notEqual(found, -1, `${String(needle)} is missing, or out of order`);
    from += found + 1;
  }
}

/** Every `h1` in a printed document, tag and all. */
function levelOneHeadings(body: string): string[] {
  return body.match(/<h1[\s>][\s\S]*?<\/h1>/g) ?? [];
}

test("the grid is printed as the Grid Frame with the course's Competency blocks, titled from competencies:", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const grid = printedGrid(workspace);
  assertInOrder(grid, [
    "<h2>How this course is assessed</h2>",
    "<h2>How the Bands are given</h2>",
    "<h2>Your Feedback Letter</h2>",
    "<h2>C1 — Framing and decomposing work</h2>",
    "Competency 1 is read in the work the Student hands in.",
    "<h2>C2 — Extending and constraining an agent</h2>",
    "Competency 2 is read in the work the Student hands in.",
    "<h2>C3 — Recovering from failure</h2>",
    "Competency 3 is read in the work the Student hands in.",
    "<h2>Resit</h2>",
  ]);
  assert.doesNotMatch(grid, /<h2>C\d<\/h2>/);
});

test("the grid holds the Band legend, the two gaps and how a Feedback Letter is made", async () => {
  const workspace = makeWorkspace();

  await workspace.publisher(["publish", "--apply"]);

  const grid = printedGrid(workspace);
  assert.match(grid, /<em>justification<\/em>/);
  assert.match(grid, /<em>knowing the limits<\/em>/);
  assert.match(grid, /provisional Band/);
  assert.match(grid, /secret GitHub gist/);
});

test("the Grid Source's front matter is never printed", async () => {
  const workspace = makeWorkspace();

  await workspace.publisher(["publish", "--apply"]);

  const grid = printedGrid(workspace);
  for (const written of ["competencies:", "deliverables:", "programme:", "c1-1", "2026-09-10T20:00"]) {
    assert.ok(!grid.includes(written), `${written} is printed`);
  }
});

test("the Competency blocks are printed in C1…Cn order, whatever order the Grid Source writes them in", async () => {
  const workspace = makeWorkspace();
  const [first, second, third] = competencyBlocks(3).split(/\n(?=## C)/);
  writeGrid(workspace, undefined, [third, first, second].join("\n"));

  await workspace.publisher(["publish", "--apply"]);

  assertInOrder(printedGrid(workspace), [
    "<h2>C1 — ",
    "Competency 1 is read",
    "<h2>C2 — ",
    "Competency 2 is read",
    "<h2>C3 — ",
    "Competency 3 is read",
    "<h2>Resit</h2>",
  ]);
});

test("a heading written in a fenced block inside a Competency block is code, not a block of its own", async () => {
  const workspace = makeWorkspace();
  const blocks = competencyBlocks(3).replace(
    "Competency 2 is read in the work the Student hands in.",
    "Competency 2 is read in the work the Student hands in.\n\n```md\n## C1\n```"
  );
  writeGrid(workspace, undefined, blocks);

  await workspace.publisher(["publish", "--apply"]);

  const grid = printedGrid(workspace);
  assertInOrder(grid, ["<h2>C2 — ", "## C1", "<h2>C3 — "]);
});

test("the grid's PDF opens with the published table's title, and the Grid Frame prints no h1 of its own", async () => {
  const workspace = makeWorkspace();

  await workspace.publisher(["publish", "--apply"]);

  const grid = printedGrid(workspace);
  assert.match(grid, /<title>Assessment Grid — how you are graded<\/title>/);
  assert.deepEqual(levelOneHeadings(grid), [
    '<h1 class="document-title">Assessment Grid — how you are graded</h1>',
  ]);
  const [, afterTitle = ""] = grid.split("</h1>");
  assert.match(afterTitle.trimStart(), /^<p>/);
});

test("a cross-reference and a picture in a Competency block are published as in any other document", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write("assets/band.png", "a picture of a Solid piece of work");
  const blocks = competencyBlocks(3).replace(
    "Competency 1 is read in the work the Student hands in.",
    "Competency 1 is read against [the lecture](lectures/lecture-1.md).\n\n![A Solid brief](assets/band.png)"
  );
  writeGrid(workspace, undefined, blocks);

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const grid = printedGrid(workspace);
  assert.ok(
    grid.includes(
      `Competency 1 is read against "${LECTURE}" (document available in the Lectures section).`
    ),
    grid
  );
  assert.match(grid, /<img src="data:image\/png;base64,[^"]+" alt="A Solid brief"/);
});

test("a picture missing from a Competency block refuses the run, as in any other document", async () => {
  const workspace = makeWorkspace();
  writeGrid(
    workspace,
    undefined,
    competencyBlocks(3).replace(
      "Competency 3 is read in the work the Student hands in.",
      "![Gone](assets/gone.png)"
    )
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /"assessment-grid\.md" shows the picture "assets\/gone\.png"/);
});

test("only the catalog's grid is assembled: another document with Competency headings prints as written", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write("lectures/lecture-1.md", competencyBlocks(1));

  await workspace.publisher(["publish", "--apply"]);

  const lecture = itemNamed(workspace, LECTURE)?.body ?? "";
  assert.match(lecture, /<h2>C1<\/h2>/);
  assert.doesNotMatch(lecture, /How this course is assessed/);
});

test("the Grid Frame ships in the installed package, readable, with no title of its own", () => {
  assert.ok(
    existsSync(join(installedPublisher(), GRID_FRAME)),
    `${GRID_FRAME} is missing from the installed package: is it in "files"?`
  );
  const frame = shippedFrame();

  assert.doesNotMatch(frame, /^# /m);
  assertInOrder(frame, [
    /^## How this course is assessed$/m,
    /^## How the Bands are given$/m,
    /^## Your Feedback Letter$/m,
    /^## Resit$/m,
  ]);
});

test("the Grid Frame uses the glossary's words, not the ones it rules out", () => {
  const ruledOut =
    /\b(grades?|marks?|scores?|criterion|criteria|assignments?|rubrics?|probes?|probe sheet|grade items?|notes?|deadlines?|cut-off|due dates?|skills?|learning outcomes?)\b/i;
  const frame = shippedFrame();

  assert.doesNotMatch(frame, ruledOut);
  assert.doesNotMatch(frame, /\/\s*20\b/);
});

// The grid's Manifest hash is taken over the assembled grid, so what the Grid
// Frame brings reaches the course, and nothing else is disturbed.

test("publishing the grid again leaves it alone", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /skip .*Assessment Grid/);
  assert.match(second.stdout, /0 PDFs to create, 0 to replace, 3 to skip/);
});

// What a new Grid Frame looks like to a course that published under the old
// one: a Manifest entry for the grid hashed over another assembly. The
// installed package is shared by every test, so its Frame is not rewritten.
test("a grid hashed over another assembly is replaced in its module, and nothing else is", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const before = workspace.readCourse().items;
  const manifest = workspace.readManifest();
  const grid = manifest.documents[GRID_SOURCE];
  assert.ok(grid);
  grid["contentHash"] = `sha256:${"0".repeat(64)}`;
  writeFileSync(workspace.manifestPath, JSON.stringify(manifest, null, 2));

  const plan = await workspace.publisher(["publish"]);
  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /replace .*Assessment Grid/);
  assert.match(plan.stdout, /0 PDFs to create, 1 to replace, 2 to skip/);
  assert.equal(applied.code, 0, applied.stderr);
  const after = workspace.readCourse().items;
  assert.deepEqual(
    after.map((item) => item.moduleId),
    before.map((item) => item.moduleId)
  );
  const others = (items: typeof after) =>
    items.filter((item) => item.name !== GRID_TITLE);
  assert.deepEqual(others(after), others(before));
  const gridIn = (items: typeof after) =>
    items.find((item) => item.name === GRID_TITLE);
  const replaced = gridIn(after);
  const was = gridIn(before);
  assert.equal(replaced?.section, was?.section);
  assert.equal(replaced?.visible, was?.visible);
  assert.equal(
    workspace.readManifest().documents[GRID_SOURCE]?.["moduleId"],
    grid["moduleId"]
  );
});

test("retitling a Competency in competencies: replaces the grid and nothing else", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const retitled = THREE_COMPETENCIES.replace(
    "Recovering from failure",
    "Recovering from a failed run"
  );
  writeGrid(workspace, `${retitled}\n${GRID_FRONT_MATTER}`, GRID_MARKDOWN);

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /replace .*Assessment Grid/);
  assert.match(second.stdout, /0 PDFs to create, 1 to replace, 2 to skip/);
  assert.match(printedGrid(workspace), /<h2>C3 — Recovering from a failed run<\/h2>/);
});
