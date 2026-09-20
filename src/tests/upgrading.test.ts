// The upgrade notes the package ships, for an agent in a course repository that
// moves its pinned tag.
//
// A note is followed by hand, once, so what is worth checking is its worked
// example: the grid it starts from is one the new publisher refuses, and the
// Grid Source it ends on is one `check` accepts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  GRID_SOURCE,
  installedPublisher,
  makeWorkspace,
  pointContextAtPublisher,
} from "./harness.ts";

import type { CommandResult } from "./harness.ts";

/** Where the installed publisher keeps its upgrade notes. */
const UPGRADING = "docs/upgrading.md";

function shippedNotes(): string {
  return readFileSync(join(installedPublisher(), UPGRADING), "utf8");
}

/** The note's worked example, the fenced block it labels `before` or `after`. */
function example(label: "before" | "after"): string {
  const match = new RegExp(`^\`\`\`markdown ${label}\\n([\\s\\S]*?)^\`\`\`$`, "m").exec(
    shippedNotes()
  );
  assert.ok(match, `the note has a \`\`\`markdown ${label} example`);
  return match[1]!;
}

/** `check`, in a course repository whose grid is `grid` and nothing else is wrong. */
async function checkWithGrid(grid: string): Promise<CommandResult> {
  const workspace = makeWorkspace();
  pointContextAtPublisher(workspace);
  workspace.write(GRID_SOURCE, grid);
  return workspace.publisher(["check"], {
    MOODLE_BASE_URL: undefined,
    MOODLE_COURSE_ID: undefined,
    PUBLISHER_DRIVER: undefined,
    PUBLISHER_FAKE_COURSE: undefined,
    CI: "true",
    MOODLE_SESSION_STATE: join(workspace.root, "session.json"),
  });
}

test("the upgrade notes ship in the installed package", () => {
  assert.ok(
    existsSync(join(installedPublisher(), UPGRADING)),
    `${UPGRADING} is missing from the installed package: is it in "files"?`
  );
});

test("the note for the assembled Assessment Grid says what to move, keep and delete, and to run check", () => {
  const notes = shippedNotes();

  for (const said of [
    /\*\*Add the course's facts to the front matter\*\*/,
    /`programme` and `term`/,
    /`oral:` with `length` and `when`/,
    /`## C1 — [^`]+` becomes `## C1`/,
    /\*\*Delete everything else\*\*/,
    /\*\*Run `npx moodle-publisher check`\*\*/,
    /plans `replace` on the Assessment Grid, keeping its module id/,
  ]) {
    assert.match(notes, said);
  }
});

test("the full grid the note starts from is refused by check, for the Grid Frame text the note deletes", async () => {
  const result = await checkWithGrid(example("before"));

  assert.equal(result.code, 1, result.stdout);
  assert.match(result.stderr, /has a "## How this course is assessed" heading/);
});

test("the Grid Source the note ends on passes check", async () => {
  const result = await checkWithGrid(example("after"));

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /2 Competencies\./);
});

test("the note for the Rehearsal, the Reading Day and the timetable says they are optional and how to declare them", () => {
  const notes = shippedNotes();

  for (const said of [
    /## v4\.1\.0 — the Grid Frame states the Rehearsal, the Reading Day and the Oral's timetable/,
    /Each of the three is optional/,
    /No course is made to declare one/,
    /replaces the Assessment Grid, whether or not you declare anything/,
    /^rehearsal:$/m,
    /^readingDay:$/m,
    /^ {2}timetable:$/m,
    /declare them rather than delete them/,
  ]) {
    assert.match(notes, said);
  }
  // The newest note is first: a course reads the one for the tag it is moving to.
  assert.ok(
    notes.indexOf("## v4.1.0") < notes.indexOf("## v4.0.0"),
    "the newest note is not first"
  );
});
