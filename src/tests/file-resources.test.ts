// A Published Document held as a file resource: the fake course's half of the
// two driver operations, and what the course snapshot says about the result.
//
// Nothing publishes through these yet, so they are driven through the fake
// driver's own entry point rather than through a command. Wipe is the one
// command that already has to see them, and it is run as a command.
import { test } from "node:test";
import assert from "node:assert/strict";

import { createFakeDriver } from "../packages/course/fake.ts";
import { COURSE_ID, itemNamed, makeWorkspace } from "./harness.ts";

const PRINTED = "<!doctype html><title>Lab 1</title><p>Clone the repository.</p>";

test("a created file resource is recorded with its name, file name, section, visibility and HTML", async () => {
  const workspace = makeWorkspace();
  const course = createFakeDriver(workspace.coursePath, COURSE_ID);

  const { moduleId } = await course.createFileResource({
    name: "Lab 1 — Setup",
    section: "Labs",
    visible: true,
    fileName: "lab-1-setup.pdf",
    html: PRINTED,
  });
  await course.close();

  const stored = itemNamed(workspace, "Lab 1 — Setup");
  assert.deepEqual(stored, {
    moduleId,
    name: "Lab 1 — Setup",
    section: "Labs",
    visible: true,
    fileName: "lab-1-setup.pdf",
    body: PRINTED,
  });
});

test("the snapshot lists a file resource as a course item, hidden when created hidden", async () => {
  const workspace = makeWorkspace();
  const course = createFakeDriver(workspace.coursePath, COURSE_ID);

  const { moduleId } = await course.createFileResource({
    name: "Lab 1 — Answer key",
    section: "Labs",
    visible: false,
    fileName: "lab-1-answer-key.pdf",
    html: PRINTED,
  });
  const snapshot = await course.snapshot();

  assert.deepEqual(snapshot.items, [
    {
      moduleId,
      name: "Lab 1 — Answer key",
      section: "Labs",
      visible: false,
      stealth: false,
      devoir: false,
    },
  ]);
  assert.ok(snapshot.sections.some((section) => section.name === "Labs"));
});

test("replacing the file keeps the module id, section and visibility, and sets the name", async () => {
  const workspace = makeWorkspace();
  const course = createFakeDriver(workspace.coursePath, COURSE_ID);
  const { moduleId } = await course.createFileResource({
    name: "Lab 1 — Answer key",
    section: "Labs",
    visible: false,
    fileName: "lab-1-answer-key.pdf",
    html: PRINTED,
  });

  const revised = "<!doctype html><title>Lab 1</title><p>Fork it first.</p>";
  await course.replaceFile({
    moduleId,
    name: "Lab 1 — Worked answers",
    fileName: "lab-1-answer-key-v2.pdf",
    html: revised,
  });
  await course.close();

  assert.deepEqual(workspace.readCourse().items, [
    {
      moduleId,
      name: "Lab 1 — Worked answers",
      section: "Labs",
      visible: false,
      fileName: "lab-1-answer-key-v2.pdf",
      body: revised,
    },
  ]);
});

test("replacing the file cannot be told a visibility", async () => {
  const workspace = makeWorkspace();
  const course = createFakeDriver(workspace.coursePath, COURSE_ID);
  const { moduleId } = await course.createFileResource({
    name: "Lab 1 — Answer key",
    section: "Labs",
    visible: false,
    fileName: "lab-1-answer-key.pdf",
    html: PRINTED,
  });

  await course.replaceFile({
    moduleId,
    name: "Lab 1 — Answer key",
    fileName: "lab-1-answer-key.pdf",
    html: PRINTED,
    // @ts-expect-error — the guarantee is the interface's: there is no field to write it into.
    visible: true,
  });

  assert.equal(itemNamed(workspace, "Lab 1 — Answer key")?.visible, false);
});

test("replacing the file of an activity that is not a file resource fails", async () => {
  const workspace = makeWorkspace();
  workspace.writeCourse({
    courseId: COURSE_ID,
    nextModuleId: 2,
    sections: ["General", "Labs"],
    items: [
      {
        moduleId: "1",
        name: "Lab 1 — Setup",
        section: "Labs",
        visible: true,
        body: "<p>A page.</p>",
      },
    ],
  });
  const course = createFakeDriver(workspace.coursePath, COURSE_ID);

  await assert.rejects(
    course.replaceFile({
      moduleId: "1",
      name: "Lab 1",
      fileName: "lab-1.pdf",
      html: PRINTED,
    }),
    /no file resource with module id 1/
  );
  await assert.rejects(
    course.replaceFile({
      moduleId: "9",
      name: "Lab 1",
      fileName: "lab-1.pdf",
      html: PRINTED,
    }),
    /no file resource with module id 9/
  );
  assert.equal(itemNamed(workspace, "Lab 1 — Setup")?.body, "<p>A page.</p>");
});

test("wipe sees a file resource and deletes it", async () => {
  const workspace = makeWorkspace();
  const course = createFakeDriver(workspace.coursePath, COURSE_ID);
  await course.createFileResource({
    name: "Lab 1 — Setup",
    section: "Labs",
    visible: true,
    fileName: "lab-1-setup.pdf",
    html: PRINTED,
  });
  await course.close();

  const plan = await workspace.publisher(["wipe", "--course", COURSE_ID]);
  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /delete activity {2}Lab 1 — Setup/);

  const wiped = await workspace.publisher([
    "wipe",
    "--course",
    COURSE_ID,
    "--apply",
  ]);
  assert.equal(wiped.code, 0, wiped.stderr);
  assert.deepEqual(workspace.readCourse().items, []);
});
