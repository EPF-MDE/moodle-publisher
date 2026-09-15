// An activity the manifest records and the course no longer holds.
//
// Someone deletes a page in Moodle — by hand, or through a course rebuild the
// publisher was not part of — and the manifest goes on naming a module id that
// resolves to nothing. The run that found this opened
// `/course/modedit.php?update=<gone>`, got Moodle's "record not found" error
// page, and aborted on the course guard, which reads site context off an error
// page and reported the browser as being in course 1. The plan is where that
// has to be settled: an activity the course does not hold is not an update.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  makeWorkspace,
  writeDayOneSet,
  writeInstructorSet,
  itemNamed,
  LECTURE_MARKDOWN,
} from "./harness.ts";

import type { Workspace } from "./harness.ts";

const LECTURE = "Lecture 1 — Framing and decomposing";

/** Deletes one activity from the course, leaving the manifest as it was. */
function deleteFromCourse(workspace: Workspace, name: string): string {
  const course = workspace.readCourse();
  const gone = course.items.find((item) => item.name === name);
  assert.ok(gone, `the fixture course has no activity called "${name}"`);
  workspace.writeCourse({
    ...course,
    items: course.items.filter((item) => item.name !== name),
  });
  return gone.moduleId;
}

test("an activity deleted from the course is planned as a create, not an update", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  deleteFromCourse(workspace, LECTURE);

  const plan = await workspace.publisher(["publish"]);

  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /create .*Lecture 1/);
  assert.match(plan.stdout, /1 to create, 0 to update, 2 to skip/);
});

test("the deleted activity is created again, and the manifest follows it", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const wasModuleId = deleteFromCourse(workspace, LECTURE);

  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  const restored = itemNamed(workspace, LECTURE);
  assert.ok(restored, "the lecture is back in the course");
  assert.equal(restored.section, "Lectures");
  assert.match(restored.body, /Framing is saying what/);
  // A new activity, and the manifest names the new one: a second run that
  // still recorded the dead id would abort in exactly the same way.
  assert.notEqual(restored.moduleId, wasModuleId);
  assert.equal(
    workspace.readManifest().documents["lectures/lecture-1.md"]?.moduleId,
    restored.moduleId
  );
  // Nothing else was disturbed on the way past: three documents, two Devoirs.
  assert.equal(workspace.readCourse().items.length, 5);
});

test("the recreated activity sends its pictures again, holding none of its own", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write(
    "assets/workflow.png",
    "a drawing of the five-phase workflow"
  );
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![The five-phase workflow](../assets/workflow.png)\n`
  );
  await workspace.publisher(["publish", "--apply"]);
  deleteFromCourse(workspace, LECTURE);

  const plan = await workspace.publisher(["publish"]);

  assert.equal(plan.code, 0, plan.stderr);
  // The picture went up with the activity that is gone, so the course holds
  // nothing of it: the manifest's record of what was uploaded belongs to a
  // module that no longer exists, and reusing it would publish a page of
  // broken icons.
  assert.match(plan.stdout, /pictures: 1 of 1 to upload/);
  assert.match(plan.stdout, /1 picture to upload/);
});

test("a deleted document the table has since moved is created where the table says", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  deleteFromCourse(workspace, LECTURE);
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    sections: [...course.sections, "Autonomy"],
  });
  workspace.writeCatalog({
    published: [
      {
        source: "assessment-grid.md",
        title: "Assessment Grid — how you are graded",
        section: "Assessment",
      },
      {
        source: "lectures/lecture-1.md",
        title: LECTURE,
        section: "Autonomy",
      },
      {
        source: "labs/lab-1.md",
        title: "Lab 1 — Frame and decompose your own work",
        section: "Labs",
      },
    ],
  });

  const applied = await workspace.publisher(["publish", "--apply"]);

  // "Delete it in Moodle and run again to have it created in <section>" is
  // what SectionMoved tells the instructor to do. Having done it, the run has
  // to do it: an activity that is gone cannot be rewritten where it stood.
  assert.equal(applied.code, 0, applied.stderr);
  assert.equal(itemNamed(workspace, LECTURE)?.section, "Autonomy");
});

test("an examiner-only activity put back by hand is not published a second time", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const course = workspace.readCourse();
  const script = course.items.find(
    (item) => item.name === "Instructor — Oral interview script"
  );
  assert.ok(script);
  // Deleted and recreated in Moodle by hand: same name, same section, a module
  // id the manifest has never seen.
  workspace.writeCourse({
    ...course,
    items: course.items.map((item) =>
      item === script ? { ...item, moduleId: "999001" } : item
    ),
  });

  const plan = await workspace.publisher(["publish"]);

  assert.equal(plan.code, 1);
  assert.match(
    plan.stderr,
    /already holds an activity called "Instructor — Oral interview script"/
  );
  // Nothing was written on the strength of a guess about which copy is real:
  // five documents and two Devoirs, as the first run left them.
  assert.equal(workspace.readCourse().items.length, 7);
});
