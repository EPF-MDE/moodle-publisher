// Sections: the publisher adds the one it needs, and refuses to guess when
// the course cannot say which one is meant.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  makeWorkspace,
  sectionsOf,
  writeDayOneSet,
  DAY_ONE_ENTRIES,
} from "./harness.ts";

/** The section names of the course, in the order the page lists them. */
const names = (workspace: Parameters<typeof sectionsOf>[0]): string[] =>
  sectionsOf(workspace).map(([name]) => name);

test("the sections appear in their fixed order, whatever order the table is in", async () => {
  const workspace = makeWorkspace();
  // Deliberately the wrong way round: the course page order is the
  // publisher's, not the table's.
  writeDayOneSet(workspace, [...DAY_ONE_ENTRIES].reverse());
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 1,
    sections: ["General"],
    items: [],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(names(workspace), [
    "General",
    "Assessment",
    "Lectures",
    "Labs",
  ]);
});

test("a section the instructor made by hand keeps the place it already had", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 1,
    // The course already has Labs, added by hand before Assessment existed.
    sections: ["General", "Labs"],
    items: [],
  });

  await workspace.publisher(["publish", "--apply"]);

  const course = workspace.readCourse();
  const at = (name: string): number =>
    course.items.findIndex((item) => item.section === name);
  assert.notEqual(at("Assessment"), -1);
  assert.notEqual(at("Lectures"), -1);
  assert.notEqual(at("Labs"), -1);
  // Sections an instructor made by hand keep their place; the publisher adds
  // the missing ones in its own order rather than reshuffling the course.
  assert.deepEqual(names(workspace), [
    "General",
    "Labs",
    "Assessment",
    "Lectures",
  ]);
});

test("publishing into a course with no sections creates the one it needs", async () => {
  const workspace = makeWorkspace();
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 1,
    sections: ["General"],
    items: [],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const course = workspace.readCourse();
  assert.deepEqual(names(workspace), ["General", "Assessment"]);
  assert.equal(course.items[0]?.section, "Assessment");
});

test("an existing section is used, not duplicated", async () => {
  const workspace = makeWorkspace();
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 1,
    sections: ["General", "Assessment", "Labs"],
    items: [],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const course = workspace.readCourse();
  assert.deepEqual(names(workspace), ["General", "Assessment", "Labs"]);
  assert.equal(course.items[0]?.section, "Assessment");
});

test("two sections with the same name abort rather than publishing into one at random", async () => {
  const workspace = makeWorkspace();
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 1,
    // What the instructor's real course looks like: repeated names, from an
    // import that ran twice.
    sections: ["General", "Assessment", "Section 2", "Assessment"],
    items: [],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /2 sections named "Assessment"/);
  assert.match(result.stderr, /numbers 1, 3/);
  assert.deepEqual(workspace.readCourse().items, []);
});
