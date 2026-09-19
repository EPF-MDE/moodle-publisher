// The Grid Source's body: one block per declared Competency, headed by its id
// alone, each holding a Band table with the five Bands as rows, in order
// (ADR-0014).
//
// A body in any other shape is refused while the catalog is read, by `check`
// and by every command, with the same message: a Competency published without
// its Band rows is a Feedback Letter with no standard to read work against
// (ADR-0011).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  competencyBlocks,
  GRID_FRONT_MATTER,
  gridDefining,
  makeWorkspace,
  pointContextAtPublisher,
  writeDayOneSet,
  writeGrid,
} from "./harness.ts";

import type { CommandResult, Workspace } from "./harness.ts";

/** `check` as a pre-commit hook runs it: nothing about Moodle in the environment. */
function check(workspace: Workspace): Promise<CommandResult> {
  return workspace.publisher(["check"], {
    MOODLE_BASE_URL: undefined,
    MOODLE_COURSE_ID: undefined,
    PUBLISHER_DRIVER: undefined,
    PUBLISHER_FAKE_COURSE: undefined,
    CI: "true",
    MOODLE_SESSION_STATE: join(workspace.root, "session.json"),
  });
}

/** The fixture's three blocks, `C1` to `C3`, each on its own. */
function threeBlocks(): [string, string, string] {
  const [c1, c2, c3] = competencyBlocks(3).split(/(?=^## )/m);
  assert.ok(c1 !== undefined && c2 !== undefined && c3 !== undefined);
  return [c1, c2, c3];
}

/** A course whose grid declares the fixture's three Competencies above `body`. */
function gridWithBody(body: string): Workspace {
  const workspace = gridDefining(GRID_FRONT_MATTER);
  writeGrid(workspace, GRID_FRONT_MATTER, body);
  pointContextAtPublisher(workspace);
  return workspace;
}

interface Refusal {
  /** The mistake, as the test names it. */
  readonly what: string;
  /** The Grid Source's body holding that mistake and no other. */
  readonly body: () => string;
  /** What the refusal has to say. */
  readonly message: RegExp;
}

const REFUSALS: readonly Refusal[] = [
  {
    what: "a declared Competency with no block",
    body: () => threeBlocks().slice(0, 2).join(""),
    message: /"assessment-grid\.md"[\s\S]*C3[\s\S]*no block/,
  },
  {
    // A renumbering mistake: the Competency was dropped from `competencies:`
    // and its block kept.
    what: "a block for a Competency that is not declared",
    body: () => competencyBlocks(4),
    message: /"assessment-grid\.md"[\s\S]*"## C4"[\s\S]*declares C1, C2, C3/,
  },
  {
    what: "two blocks for the same Competency",
    body: () => {
      const [c1, c2, c3] = threeBlocks();
      return [c1, c2, c3, c2].join("\n");
    },
    message: /"assessment-grid\.md"[\s\S]*two blocks for C2/,
  },
  {
    what: "a block with no Solid row",
    body: () => {
      const [c1, c2, c3] = threeBlocks();
      return [c1, c2.replace(/^\| \*\*Solid\*\*.*\n/m, ""), c3].join("");
    },
    message: /C2 in "assessment-grid\.md" has no Solid row/,
  },
  {
    what: "a block whose Bands are out of order",
    body: () => {
      const [c1, c2, c3] = threeBlocks();
      const swapped = c1.replace(/^(\| \*\*Basic\*\*.*\n)(\| \*\*Solid\*\*.*\n)/m, "$2$1");
      assert.notEqual(swapped, c1);
      return [swapped, c2, c3].join("");
    },
    message:
      /C1 in "assessment-grid\.md" has the rows Resit, Needs Work, Solid, Basic, Outstanding[\s\S]*in order: Resit, Needs Work, Basic, Solid, Outstanding/,
  },
  {
    what: "a block with no Band table",
    body: () => {
      const [c1, c2, c3] = threeBlocks();
      return [c1, "## C2\n\nNo table here.\n\n", c3].join("");
    },
    message: /C2 in "assessment-grid\.md" has no Band table/,
  },
  {
    // What a grid kept from before it was a Grid Source: a section of the Grid
    // Frame's, which the course no longer writes.
    what: "any other ## heading",
    body: () => `${competencyBlocks(3)}\n## Resit\n\nA Resit is a new attempt.\n`,
    message: /"assessment-grid\.md"[\s\S]*"## Resit"/,
  },
];

for (const { what, body, message } of REFUSALS) {
  test(`check and publish refuse ${what}, with the same message and nothing written`, async () => {
    const workspace = gridWithBody(body());

    const checked = await check(workspace);
    const run = await workspace.publisher(["publish", "--apply"]);

    assert.equal(checked.code, 1, checked.stdout);
    assert.match(checked.stderr, message);
    assert.equal(run.code, 1, "publish refuses it too");
    assert.equal(run.stderr, checked.stderr);
    assert.deepEqual(workspace.readCourse().items, []);
    assert.equal(existsSync(workspace.manifestPath), false);
  });
}

test("the harness's default Grid Source passes check", async () => {
  const workspace = makeWorkspace();
  pointContextAtPublisher(workspace);
  writeDayOneSet(workspace);

  const result = await check(workspace);

  assert.equal(result.code, 0, result.stderr);
});

test("a heading written in a fenced block opens no block", async () => {
  const [c1, c2, c3] = threeBlocks();
  const workspace = gridWithBody(
    [c1, `${c2}\n\`\`\`markdown\n## Not a heading\n\`\`\`\n\n`, c3].join("")
  );

  const result = await check(workspace);

  assert.equal(result.code, 0, result.stderr);
});
