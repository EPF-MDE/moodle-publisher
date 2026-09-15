// The table of Published Documents, as rules over whatever a course
// repository's `publisher.json` holds.
//
// Driven through the command line like the rest of the suite, because every
// run reads the file: what is under test is a course repository saying what
// it publishes, and the refusals that keep a mistaken edit out of the course.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { documentsToPublish } from "../packages/catalog/index.ts";
import { SECTION_ORDER } from "../packages/course/index.ts";
import { makeWorkspace, writeDayOneSet } from "./harness.ts";

import type { Workspace } from "./harness.ts";

/**
 * A run with the real driver, where no browser may start: `CI` is set, so a
 * run that got past the catalog would stop at the driver saying so. A refusal
 * about `publisher.json` is therefore proof that a real run read it first.
 */
function realRun(workspace: Workspace) {
  return workspace.publisher(["publish", "--apply"], {
    PUBLISHER_DRIVER: undefined,
    CI: "true",
    MOODLE_SESSION_STATE: join(workspace.root, "session.json"),
  });
}

for (const [driver, run] of [
  ["a fake", (workspace: Workspace) => workspace.publisher(["publish", "--apply"])],
  ["a real", realRun],
] as const) {
  test(`a document bound for a section the course page does not have stops ${driver} run`, async () => {
    // A catalog read from a file is untyped by the time it is loaded, and a
    // section nobody named would be created outside the order students read
    // the page in.
    const workspace = makeWorkspace();
    writeDayOneSet(workspace);
    workspace.writeCatalog({
      published: [{ source: "labs/lab-1.md", title: "Lab 1", section: "Labss" }],
    });

    const result = await run(workspace);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /labs\/lab-1\.md/);
    assert.match(result.stderr, /"Labss"/);
    assert.match(result.stderr, new RegExp(SECTION_ORDER.join(", ")));
    assert.deepEqual(workspace.readCourse().items, []);
  });

  test(`a document published to Deliverables stops ${driver} run`, async () => {
    // ADR-0005: what is in the section is decided by the Deliverables the grid
    // defines, never by an entry naming it.
    const workspace = makeWorkspace();
    writeDayOneSet(workspace);
    workspace.writeCatalog({
      published: [
        { source: "labs/lab-1.md", title: "Lab 1", section: "Deliverables" },
      ],
    });

    const result = await run(workspace);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /labs\/lab-1\.md/);
    assert.match(result.stderr, /holds the Devoirs and nothing else/);
    assert.deepEqual(workspace.readCourse().items, []);
  });

  test(`a reveal date nobody can read stops ${driver} run`, async () => {
    const workspace = makeWorkspace();
    writeDayOneSet(workspace);
    workspace.writeCatalog({
      published: [
        {
          source: "labs/lab-1.md",
          title: "Lab 1",
          section: "Labs",
          revealedOn: "11/09/2026",
        },
      ],
    });

    const result = await run(workspace);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /labs\/lab-1\.md/);
    assert.match(result.stderr, /"11\/09\/2026"/);
    assert.deepEqual(workspace.readCourse().items, []);
  });
}

test("a course repository with no publisher.json stops the run, saying what is missing", async () => {
  // No fallback: a run that found nothing to read must not publish nothing
  // and call it done, nor publish something it was never told to.
  const workspace = makeWorkspace();
  workspace.remove("publisher.json");

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /publisher\.json/);
  assert.deepEqual(workspace.readCourse().items, []);
});

test("a publisher.json that is not JSON stops the run, naming the file", async () => {
  const workspace = makeWorkspace();
  workspace.write("publisher.json", "{ grid: assessment-grid.md");

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /publisher\.json/);
  assert.deepEqual(workspace.readCourse().items, []);
});

for (const [what, entry, named] of [
  ["that is not an object", null, /entry 1/],
  ["with no source", { title: "Lab 1", section: "Labs" }, /entry 1.*"source"/],
  ["with no title", { source: "labs/lab-1.md", section: "Labs" }, /labs\/lab-1\.md.*"title"/],
] as const) {
  test(`an entry ${what} stops the run, saying what is missing`, async () => {
    // Read from a course repository, an entry is whatever somebody typed: one
    // missing its source or title must be refused by name rather than crash
    // the run or publish a document nobody can find.
    const workspace = makeWorkspace();
    writeDayOneSet(workspace);
    workspace.writeCatalog({ published: [entry] });

    const result = await workspace.publisher(["publish", "--apply"]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /Refusing to start/);
    assert.match(result.stderr, named);
    assert.deepEqual(workspace.readCourse().items, []);
  });
}

test("a publisher.json naming no grid stops the run", async () => {
  // No default: the Deliverables and the probes are read from the grid, and a
  // catalog that forgot to name it must not have one guessed for it.
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.writeCatalog({ grid: undefined, published: [] });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /names no grid/);
  assert.deepEqual(workspace.readCourse().items, []);
});

test("two documents sharing a title, once the prefix is derived, stop the run", async () => {
  // A title is how `AlreadyInCourse` recognises a document the manifest has
  // lost, so two documents sharing one would have a later run refuse to
  // publish the second over an activity that is not it. Asked of the published
  // titles rather than of the entries: the prefix is part of what an examiner
  // reads, so a student document titled with it collides with the material.
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write("labs/lab-3-oral--instructor.md", "# Script\n");
  workspace.writeCatalog({
    published: [
      { source: "labs/lab-1.md", title: "Instructor — Lab 1", section: "Labs" },
      { source: "labs/lab-3-oral--instructor.md", title: "Lab 1", section: "Labs" },
    ],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Instructor — Lab 1/);
  assert.match(result.stderr, /labs\/lab-1\.md/);
  assert.match(result.stderr, /labs\/lab-3-oral--instructor\.md/);
  assert.deepEqual(workspace.readCourse().items, []);
});

test("renaming a document is the whole of the change", async () => {
  // The suffix decides, and nothing else does: the same entry, published under
  // two names, publishes visible or hidden accordingly. This is the guarantee
  // that replaced a table entry saying who a document was for.
  const entry = {
    title: "C1 banding anchors",
    section: "Assessment" as const,
  };
  const [visible] = documentsToPublish({
    published: [{ ...entry, source: "c1-assessment-examples.md" }],
    grid: "assessment-grid.md",
  });
  const [hidden] = documentsToPublish({
    published: [{ ...entry, source: "c1-assessment-examples--instructor.md" }],
    grid: "assessment-grid.md",
  });

  assert.equal(visible?.visibleOnCreate, true);
  assert.equal(visible?.title, "C1 banding anchors");
  assert.equal(hidden?.visibleOnCreate, false);
  assert.equal(hidden?.title, "Instructor — C1 banding anchors");
});
