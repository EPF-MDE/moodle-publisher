// The table of Published Documents, as rules over whatever it holds.
//
// The odd one out in this suite: most of these read the table in process
// rather than driving the command line against fixture documents, because the
// table is the thing under test. The unknown-section test is the exception to
// the exception: a section name only a file can carry has to come in through a
// file, and so through the command line like everything else.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  documentsToPublish,
  isInstructorMaterial,
  loadCatalog,
} from "../packages/catalog/index.ts";
import { SECTION_ORDER } from "../packages/course/index.ts";
import { makeWorkspace, writeDayOneSet } from "./harness.ts";

test("a document bound for a section the course page does not have stops the run", async () => {
  // The in-code table cannot say this: its sections are typed, and tsc is what
  // enforces them. A catalog read from a file is untyped by the time it is
  // loaded, and a section nobody named would be created outside the order
  // students read the page in.
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.writeCatalog({
    published: [
      {
        source: "labs/lab-1.md",
        title: "Lab 1",
        section: "Labss",
      },
    ],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /labs\/lab-1\.md/);
  assert.match(result.stderr, /"Labss"/);
  assert.match(result.stderr, new RegExp(SECTION_ORDER.join(", ")));
  assert.deepEqual(workspace.readCourse().items, []);
});

test("a catalog file naming no grid stops the run", async () => {
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

test("no two documents share a title, once the prefix is derived", async () => {
  // A title is how `AlreadyInCourse` recognises a document the manifest has
  // lost, so two documents sharing one would have a run refuse to publish the
  // second over an activity that is not it. Asked of the published titles
  // rather than of the entries: the prefix is part of what an examiner reads.
  const titles = documentsToPublish(loadCatalog()).map(
    (document) => document.title
  );

  assert.equal(
    new Set(titles).size,
    titles.length,
    `two documents share a title: ${titles.join(", ")}`
  );
});

test("instructor material is published hidden, under a derived prefix", async () => {
  const documents = documentsToPublish(loadCatalog());
  const instructor = documents.filter(
    (document) => document.instructorMaterial
  );

  assert.equal(
    instructor.length,
    loadCatalog().published.filter((document) =>
      isInstructorMaterial(document.source)
    ).length
  );
  for (const document of instructor) {
    assert.equal(document.visibility, "enforced-hidden");
    assert.equal(document.visibleOnCreate, false);
    assert.match(document.title, /^Instructor — /);
  }
  // And the other half of the rule: nothing student-facing is enforced-hidden,
  // so a reveal stays a human decision, and no student-facing title claims to
  // be an examiner's.
  for (const document of documents.filter(
    (document) => !document.instructorMaterial
  )) {
    assert.equal(document.visibility, "manual");
    assert.doesNotMatch(document.title, /^Instructor — /);
  }
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
