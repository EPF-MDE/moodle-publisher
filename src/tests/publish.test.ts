// What the instructor observes when they run the publisher: the plan printed,
// the course produced, the manifest left behind, the errors raised.
import { test } from "node:test";
import assert from "node:assert/strict";

import { DELIVERABLE_SECTION } from "../packages/course/index.ts";
import { makeWorkspace, GRID_MARKDOWN } from "./harness.ts";

test("a run reports its plan and applies nothing", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["publish"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /create/);
  assert.match(result.stdout, /Assessment Grid — how you are graded/);
  assert.match(result.stdout, /section: Assessment/);
  assert.match(result.stdout, /Nothing has been applied/);
  assert.deepEqual(workspace.readCourse().items, []);
  assert.deepEqual(workspace.readManifest().documents, {});
});

test("--phase aborts rather than being taken for a flag that still works", async () => {
  // The publisher used to publish entries up to a phase, and `--phase` was how
  // a run asked for one. Now every document the table names is published on
  // every run, and a command line still carrying the flag is a habit, a script
  // or a note that has not caught up. Ignoring it would report a full publish
  // to somebody who believes they asked for half of one.
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["publish", "--phase", "2"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /publish takes --apply and nothing else/);
  assert.match(result.stderr, /It was given: --phase 2\./);
  assert.deepEqual(workspace.readCourse().items, []);
});

test("applying creates the grid in the Assessment section, tables and all", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const [item, ...rest] = workspace.readCourse().items;
  // Beside it, only the Devoirs its front matter defines.
  assert.deepEqual(
    rest.map((other) => other.section),
    [DELIVERABLE_SECTION, DELIVERABLE_SECTION]
  );
  assert.equal(item?.name, "Assessment Grid — how you are graded");
  assert.equal(item?.section, "Assessment");
  assert.equal(item?.visible, true);
  assert.match(item?.body ?? "", /<table/);
  assert.match(item?.body ?? "", /<th>Band<\/th>/);
  assert.match(item?.body ?? "", /<td>Solid<\/td>/);
});

test("the manifest records source, module, section and hash", async () => {
  const workspace = makeWorkspace();

  await workspace.publisher(["publish", "--apply"]);

  const entry = workspace.readManifest().documents["assessment-grid.md"];
  assert.ok(entry, "expected a manifest entry for the grid");
  assert.equal(entry["moduleId"], workspace.readCourse().items[0]?.moduleId);
  assert.equal(entry["section"], "Assessment");
  assert.match(String(entry["contentHash"]), /^sha256:[0-9a-f]{64}$/);
  assert.ok(entry["publishedAt"]);
  assert.ok(entry["updatedAt"]);
});

test("a document already in the manifest is skipped, not created twice", async () => {
  const workspace = makeWorkspace();
  await workspace.publisher(["publish", "--apply"]);

  const second = await workspace.publisher(["publish"]);

  assert.match(second.stdout, /skip/);
  assert.match(second.stdout, /0 PDFs to create, 1 to skip/);
  // The grid and its two Devoirs, each made once.
  assert.equal(workspace.readCourse().items.length, 3);
});

test("the manifest gains its entry as each item succeeds, not at the end", async () => {
  const workspace = makeWorkspace();
  workspace.write("lecture-1.md", GRID_MARKDOWN);
  workspace.writeCatalog({
    published: [
      {
        source: "assessment-grid.md",
        title: "Assessment Grid — how you are graded",
        section: "Assessment",
      },
      {
        source: "lecture-1.md",
        title: "Lecture 1 — Framing and decomposing",
        section: "Lectures",
      },
    ],
  });
  // The driver raises on the second create: an interrupted run.
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 1,
    items: [],
    failCreateAfter: 1,
  });

  const interrupted = await workspace.publisher(["publish", "--apply"]);

  assert.equal(interrupted.code, 1);
  assert.deepEqual(Object.keys(workspace.readManifest().documents), [
    "assessment-grid.md",
  ]);

  // Recovery is running the same command again.
  const course = workspace.readCourse();
  workspace.writeCourse({ ...course, failCreateAfter: undefined });
  const resumed = await workspace.publisher(["publish", "--apply"]);

  assert.equal(resumed.code, 0, resumed.stderr);
  assert.deepEqual(Object.keys(workspace.readManifest().documents).sort(), [
    "assessment-grid.md",
    "deliverable:c1-1",
    "deliverable:c3-1",
    "lecture-1.md",
  ]);
  assert.equal(workspace.readCourse().items.length, 4);
});

test("missing course id aborts, naming the variable, with no default course", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["publish"], {
    MOODLE_COURSE_ID: undefined,
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /MOODLE_COURSE_ID/);
  assert.match(result.stderr, /no default course/i);
});

test("missing base url aborts, naming the variable", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["publish"], {
    MOODLE_BASE_URL: undefined,
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /MOODLE_BASE_URL/);
});
