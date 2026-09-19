// The Grid Source starter the package ships, for a course repository to copy
// as its grid and fill in.
//
// Nothing installs it: a course copies it once, and from then on it is the
// course's own Grid Source. So what is worth checking is that the copy a course
// takes from the installed publisher is a Grid Source `check` accepts,
// placeholders and all, and that it holds nothing but front matter and a
// Competency block. What a Student reads around that block is the Grid Frame's,
// and is checked in `grid-frame.test.ts`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  GRID_SOURCE,
  installedPublisher,
  makeWorkspace,
  pointContextAtPublisher,
} from "./harness.ts";

/** Where the installed publisher keeps the starter. */
const STARTER = "docs/grid-source-starter.md";

function shippedStarter(): string {
  return readFileSync(join(installedPublisher(), STARTER), "utf8");
}

/** The starter's front matter and its prose, split at the closing delimiter. */
function parts(starter: string): { frontMatter: string; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(starter);
  assert.ok(match, "the starter opens with a front-matter block");
  return { frontMatter: match[1]!, body: match[2]! };
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

/** The five Bands, in order, as the rows of a Band table open. */
const BAND_ROWS = ["Resit", "Needs Work", "Basic", "Solid", "Outstanding"].map(
  (band) => `| **${band}** |`
);

test("a course repository that copies the shipped starter as its grid passes check", async () => {
  const workspace = makeWorkspace();
  pointContextAtPublisher(workspace);
  workspace.write(GRID_SOURCE, shippedStarter());

  const result = await workspace.publisher(["check"], {
    MOODLE_BASE_URL: undefined,
    MOODLE_COURSE_ID: undefined,
    PUBLISHER_DRIVER: undefined,
    PUBLISHER_FAKE_COURSE: undefined,
    CI: "true",
    MOODLE_SESSION_STATE: join(workspace.root, "session.json"),
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /1 Deliverable,/);
  assert.match(result.stdout, /1 Competency\./);
});

test("the starter's front matter declares the Competencies, the Deliverables, the programme, the term and the Oral, and no probes", () => {
  const { frontMatter } = parts(shippedStarter());

  for (const field of ["competencies", "deliverables", "programme", "term", "oral"]) {
    assert.match(frontMatter, new RegExp(`^${field}:`, "m"), `${field}: is declared`);
  }
  assert.match(frontMatter, /^ {2}length:/m);
  assert.match(frontMatter, /^ {2}when:/m);
  assert.doesNotMatch(frontMatter, /^probes:/m);
});

// The rest of what a Student reads is the Grid Frame's, which the publisher
// prints around these blocks (ADR-0014): a copy of it here would be printed twice.
test("the starter's prose is one Competency block headed by its id alone, and none of the Grid Frame's text", () => {
  const { body } = parts(shippedStarter());

  assert.deepEqual(body.match(/^#{1,2} .*$/gm), ["## C1"]);
  assert.doesNotMatch(body, /_justification_/);
  assert.doesNotMatch(body, /provisional Band/);
  assert.doesNotMatch(body, /Feedback Letter/);
});

test("each Competency block runs fiche quote, Subject, Expected evidence, five Band rows, Oral question", () => {
  const { body } = parts(shippedStarter());
  const blocks = body.split(/^## (?=C\d)/m).slice(1);

  assert.ok(blocks.length > 0, "the starter has a Competency block");
  for (const block of blocks) {
    assertInOrder(block, [
      /^> _Fiche statement:/m,
      "**Subject:**",
      "**Expected evidence**",
      ...BAND_ROWS,
      "**Oral question:**",
    ]);
  }
});

// Its comments are what an Instructor reads while filling it in, so they are
// held to the glossary as the Grid Frame is.
test("the starter uses the glossary's words, not the ones it rules out", () => {
  const ruledOut =
    /\b(grades?|marks?|scores?|criterion|criteria|assignments?|rubrics?|probes?|probe sheet|grade items?|notes?|deadlines?|cut-off|due dates?|skills?|learning outcomes?)\b/i;
  const starter = shippedStarter();

  assert.doesNotMatch(starter, ruledOut);
  assert.doesNotMatch(starter, /\/\s*20\b/);
  assert.doesNotMatch(starter, /\btemplate\b/i);
});
