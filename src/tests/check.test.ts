// A course repository checked without Moodle: what a course repository's
// pre-commit hook runs.
//
// `check` refuses everything `publish` would refuse short of reading the
// Course, with the same message, and it needs no site, no course id and no
// session. These tests run it the way a hook would: no Moodle variable set, no
// fake driver, and `CI` set — so a run that reached for a browser would stop
// saying it never runs in CI, and one that reached for the configuration would
// stop saying MOODLE_BASE_URL is not set.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  DAY_ONE_ENTRIES,
  LAB_MARKDOWN,
  LECTURE_MARKDOWN,
  ORAL_SCRIPT_SOURCE,
  gridDefining,
  makeWorkspace,
  pointContextAtPublisher,
  writeDayOneSet,
  writeInstructorSet,
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

/** Every file under the workspace and what it holds, to see that nothing was written. */
function filesIn(workspace: Workspace): Record<string, string> {
  const files: Record<string, string> = {};
  for (const relative of readdirSync(workspace.root, { recursive: true })) {
    const path = join(workspace.root, String(relative));
    if (statSync(path).isFile()) files[String(relative)] = readFileSync(path, "utf8");
  }
  return files;
}

/**
 * A course repository with everything a check has to read: documents in
 * several sections, instructor material, a picture, and cross-references in
 * both directions a student can follow, and the context pointer into the
 * installed publisher.
 */
function validRepository(): Workspace {
  const workspace = makeWorkspace();
  pointContextAtPublisher(workspace);
  writeInstructorSet(workspace);
  workspace.write("assets/workflow.png", "a diagram");
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![The workflow](../assets/workflow.png)\n\nThen do [the lab](../labs/lab-1.md).\n`
  );
  workspace.write(
    ORAL_SCRIPT_SOURCE,
    `# Oral interview script\n\nStart from [the lab](./lab-1.md).\n`
  );
  return workspace;
}

test("check passes on a valid course repository with no Moodle variables and no session", async () => {
  const workspace = validRepository();

  const result = await check(workspace);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /5 documents/);
  assert.match(result.stdout, /2 Deliverables/);
});

test("check opens no browser and writes no file, not even a manifest or a run capture", async () => {
  const workspace = validRepository();
  const before = filesIn(workspace);

  const result = await check(workspace);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(filesIn(workspace), before);
  assert.doesNotMatch(result.stderr, /CI/);
});

test("check takes no flags", async () => {
  const workspace = validRepository();

  const result = await workspace.publisher(["check", "--apply"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /check takes no arguments/);
});

/**
 * A repository broken in one way, and asserted to be refused by `check` with
 * exactly what `publish` says about it: fixing a commit is fixing a run.
 */
interface Refusal {
  /** The mistake, as the test names it. */
  readonly what: string;
  /** A fresh repository holding that mistake and no other. */
  readonly broken: () => Workspace;
  /** What the refusal has to say. */
  readonly message: RegExp;
  /** The command that reads what is broken. `publish`, unless said otherwise. */
  readonly command?: string;
}

const REFUSALS: readonly Refusal[] = [
  {
    what: "a broken cross-reference",
    broken: () => {
      const workspace = makeWorkspace();
      writeDayOneSet(workspace);
      workspace.write("labs/lab-1.md", `${LAB_MARKDOWN}\nRead [the notes](../notes/scratch.md).\n`);
      return workspace;
    },
    message: /the table does not name/,
  },
  {
    what: "a missing picture",
    broken: () => {
      const workspace = makeWorkspace();
      writeDayOneSet(workspace);
      workspace.write(
        "lectures/lecture-1.md",
        `${LECTURE_MARKDOWN}\n![Not drawn yet](../assets/workflow.png)\n`
      );
      return workspace;
    },
    message: /workflow\.png/,
  },
  {
    what: "a Student-facing link to Instructor Material",
    broken: () => {
      const workspace = makeWorkspace();
      writeInstructorSet(workspace);
      workspace.write("labs/lab-1.md", `${LAB_MARKDOWN}\nSee [the script](./lab-3-oral--instructor.md).\n`);
      return workspace;
    },
    message: /examiner-only/,
  },
  {
    what: "a publisher.json that is not JSON",
    broken: () => {
      const workspace = makeWorkspace();
      workspace.write("publisher.json", "{ grid: assessment-grid.md");
      return workspace;
    },
    message: /publisher\.json/,
  },
  {
    what: "a missing publisher.json",
    broken: () => {
      const workspace = makeWorkspace();
      workspace.remove("publisher.json");
      return workspace;
    },
    message: /publisher\.json/,
  },
  {
    what: "a publisher.json naming a Section the course page does not have",
    broken: () => {
      const workspace = makeWorkspace();
      writeDayOneSet(workspace);
      workspace.writeCatalog({
        published: [...DAY_ONE_ENTRIES, { source: "labs/lab-2.md", title: "Lab 2", section: "Labss" }],
      });
      return workspace;
    },
    message: /"Labss"/,
  },
  {
    what: "a grid with two Deliverables sharing an id",
    broken: () =>
      gridDefining(`deliverables:
  - id: c1-1
    title: Your repository — C1 and C2
    competencies: [C1, C2]
    due: 2026-09-10T20:00:00+02:00
  - id: c1-1
    title: Your C3 branch — recovering from failure
    competencies: [C3]
    due: 2026-09-11T09:30:00+02:00`),
    message: /"c1-1"/,
  },
  {
    // The block a grid kept from before the Probe Sheet was retired: refused,
    // pointing at the decision, rather than silently ignored.
    what: "a grid that still has a probes block",
    broken: () =>
      gridDefining(`deliverables:
  - id: c1-1
    title: Your repository — C1 and C2
    competencies: [C1, C2, C3]
    due: 2026-09-10T20:00:00+02:00
probes:
  C1:
    - Three or more units of work?`),
    message: /"probes:" block[\s\S]*ADR-0011[\s\S]*Delete the "probes:" block/,
  },
];

for (const { what, broken, message, command = "publish" } of REFUSALS) {
  test(`check refuses ${what}, saying what a run would say`, async () => {
    const workspace = broken();

    const checked = await check(workspace);
    const run = await workspace.publisher([command]);

    assert.equal(checked.code, 1);
    assert.match(checked.stderr, message);
    assert.equal(run.code, 1, `${command} refuses it too`);
    assert.equal(checked.stderr, run.stderr);
  });
}
