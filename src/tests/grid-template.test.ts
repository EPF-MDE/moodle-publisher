// The assessment-grid template the package ships, for a course repository to
// copy and adapt by hand.
//
// Nothing installs it: a course copies it. So what is worth checking is that
// the copy a course takes from the installed publisher is a grid `check`
// accepts, placeholders and all, and that it holds what every EPF grid holds.
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

/** Where the installed publisher keeps the template. */
const TEMPLATE = "docs/assessment-grid-template.md";

function shippedTemplate(): string {
  return readFileSync(join(installedPublisher(), TEMPLATE), "utf8");
}

/** The template's front matter and its prose, split at the closing delimiter. */
function parts(template: string): { frontMatter: string; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(template);
  assert.ok(match, "the template starts with a front-matter block");
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

test("a course repository that copies the shipped template as its grid passes check", async () => {
  const workspace = makeWorkspace();
  pointContextAtPublisher(workspace);
  workspace.write(GRID_SOURCE, shippedTemplate());

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
  assert.match(result.stdout, /2 Competencies\./);
});

test("the template's front matter declares Competencies and Deliverables, and no probes", () => {
  const { frontMatter } = parts(shippedTemplate());

  assert.match(frontMatter, /^competencies:/m);
  assert.match(frontMatter, /^deliverables:/m);
  assert.doesNotMatch(frontMatter, /^probes:/m);
});

test("the template holds the Band legend, the two gaps, the Oral and the Resit section", () => {
  const { body } = parts(shippedTemplate());

  assertInOrder(body, BAND_ROWS);
  assert.match(body, /_justification_/);
  assert.match(body, /_knowing the limits_/);
  assert.match(body, /provisional Band/);
  assert.match(body, /^## Resit$/m);
});

test("each Competency block runs fiche quote, Subject, Expected evidence, five Band rows, Oral question", () => {
  const { body } = parts(shippedTemplate());
  const blocks = body.split(/^## (?=C\d)/m).slice(1);

  assert.ok(blocks.length > 0, "the template has a Competency block");
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

test("the template uses the glossary's words, not the ones it rules out", () => {
  const ruledOut =
    /\b(grades?|marks?|scores?|criterion|criteria|assignments?|rubrics?|probes?|probe sheet|grade items?|notes?|deadlines?|cut-off|due dates?|skills?|learning outcomes?)\b/i;
  const template = shippedTemplate();

  assert.doesNotMatch(template, ruledOut);
  assert.doesNotMatch(template, /\/\s*20\b/);
});
