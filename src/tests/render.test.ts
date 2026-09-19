// `render <source>` prints one Published Document as it would be uploaded, the
// Assessment Grid assembled, with no Moodle: no site, no course id, no session,
// and nothing written to the Manifest or the course.
//
// Under the fake driver the file written is the print-ready HTML the PDF would
// be printed from. Chromium's own PDF is checked by hand (ADR-0013).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

import {
  GRID_SOURCE,
  GRID_TITLE,
  makeWorkspace,
  pointContextAtPublisher,
  writeDayOneSet,
  writeGrid,
} from "./harness.ts";

import type { CommandResult, Workspace } from "./harness.ts";

/** `render` with the fake driver and nothing about Moodle in the environment. */
function render(
  workspace: Workspace,
  args: readonly string[]
): Promise<CommandResult> {
  return workspace.publisher(["render", ...args], {
    MOODLE_BASE_URL: undefined,
    MOODLE_COURSE_ID: undefined,
    PUBLISHER_FAKE_COURSE: undefined,
  });
}

/** A course repository `check` passes: the day-one set, pointed at the publisher. */
function validRepository(): Workspace {
  const workspace = makeWorkspace();
  pointContextAtPublisher(workspace);
  writeDayOneSet(workspace);
  return workspace;
}

/** The one file `render` said it wrote. */
function writtenPath(result: CommandResult): string {
  const path = /^Rendered .* to (.+)$/m.exec(result.stdout)?.[1];
  assert.ok(path !== undefined, `no path in: ${result.stdout}`);
  return path;
}

/** Asserts that each of `needles` appears in `text`, after the one before it. */
function assertInOrder(text: string, needles: readonly string[]): void {
  let from = 0;
  for (const needle of needles) {
    const found = text.indexOf(needle, from);
    assert.notEqual(found, -1, `${needle} is missing, or out of order`);
    from = found + 1;
  }
}

test("render on the grid writes the assembled print-ready HTML, beside the run captures", async () => {
  const workspace = validRepository();

  const result = await render(workspace, [GRID_SOURCE]);

  assert.equal(result.code, 0, result.stderr);
  const path = writtenPath(result);
  // Real paths: the temporary directory is reached through a symlink on macOS.
  assert.equal(path.startsWith(join(realpathSync(workspace.root), "runs")), true, path);
  assert.match(path, /assessment-grid\.html$/);
  const html = readFileSync(path, "utf8");
  assertInOrder(html, [
    `<h1 class="document-title">${GRID_TITLE}</h1>`,
    "<h2>How this course is assessed</h2>",
    "<h2>How the Bands are given</h2>",
    "<h2>Your Feedback Letter</h2>",
    "<h2>C1 — Framing and decomposing work</h2>",
    "Competency 1 is read in the work the Student hands in.",
    "<h2>C3 — Recovering from failure</h2>",
    "<h2>Resit</h2>",
  ]);
  for (const written of ["competencies:", "deliverables:", "programme:", "c1-1"]) {
    assert.ok(!html.includes(written), `${written} is printed`);
  }
});

test("render on any other listed document writes that document's print-ready HTML", async () => {
  const workspace = validRepository();

  const result = await render(workspace, ["lectures/lecture-1.md"]);

  assert.equal(result.code, 0, result.stderr);
  const html = readFileSync(writtenPath(result), "utf8");
  assert.match(html, /^<!doctype html>/);
  assert.match(
    html,
    /<h1 class="document-title">Lecture 1 — Framing and decomposing<\/h1>/
  );
  assert.match(html, /Framing is saying what/);
  assert.match(html, /@page/);
  assert.doesNotMatch(html, /How this course is assessed/);
});

test("render writes to the path given with --out, and says so", async () => {
  const workspace = validRepository();

  const result = await render(workspace, ["labs/lab-1.md", "--out", "preview/lab.html"]);

  assert.equal(result.code, 0, result.stderr);
  const path = join(workspace.root, "preview/lab.html");
  assert.equal(realpathSync(writtenPath(result)), realpathSync(path));
  assert.match(readFileSync(path, "utf8"), /Lab 1 — Frame and decompose your own work/);
  assert.equal(existsSync(join(workspace.root, "runs")), false);
});

test("render needs no Moodle, and leaves the Manifest and the course byte-for-byte unchanged", async () => {
  const workspace = validRepository();
  const published = await workspace.publisher(["publish", "--apply"]);
  assert.equal(published.code, 0, published.stderr);
  const manifest = readFileSync(workspace.manifestPath);
  const course = readFileSync(workspace.coursePath);
  // A changed document: a render reads it, and must not record it.
  workspace.write(
    "lectures/lecture-1.md",
    "# Lecture 1\n\nRewritten since it was published.\n"
  );

  const result = await render(workspace, ["lectures/lecture-1.md"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(readFileSync(writtenPath(result), "utf8"), /Rewritten since/);
  assert.deepEqual(readFileSync(workspace.manifestPath), manifest);
  assert.deepEqual(readFileSync(workspace.coursePath), course);
});

test("a source the published table does not list is refused, naming it", async () => {
  const workspace = validRepository();
  workspace.write("notes/draft.md", "# Draft\n");

  const result = await render(workspace, ["notes/draft.md"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /notes\/draft\.md/);
  assert.match(result.stderr, /published/);
  assert.equal(existsSync(join(workspace.root, "runs")), false);
});

test("render refuses what check refuses, with the same message", async () => {
  const workspace = validRepository();
  writeGrid(workspace, "programme: Ingénieur 4A\ndeliverables: []");

  const checked = await workspace.publisher(["check"]);
  const rendered = await render(workspace, [GRID_SOURCE]);

  assert.notEqual(checked.code, 0);
  assert.notEqual(rendered.code, 0);
  assert.equal(rendered.stderr, checked.stderr);
  assert.equal(existsSync(join(workspace.root, "runs")), false);
});

test("render without a source, or with more than one, prints the usage", async () => {
  const workspace = validRepository();

  for (const args of [[], ["labs/lab-1.md", "lectures/lecture-1.md"], ["labs/lab-1.md", "--out"]]) {
    const result = await render(workspace, args);
    assert.equal(result.code, 2, args.join(" "));
    assert.match(result.stderr, /Usage:/);
  }
});
