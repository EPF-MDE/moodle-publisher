// The audit, which reads the live course and writes nothing to it.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ANCHORS_MARKDOWN,
  ANCHORS_SOURCE,
  INSTRUCTOR_ENTRIES,
  itemNamed,
  makeWorkspace,
  writeDayOneSet,
  writeInstructorSet,
} from "./harness.ts";

test("the audit reports every manifest-published document present", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Audit passed/);
  assert.match(result.stdout, /3 published document\(s\) present/);
});

test("the audit still passes after an update, which moves nothing", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  workspace.write("labs/lab-1.md", "# Lab 1\n\nRewritten the night before.\n");

  await workspace.publisher(["publish", "--apply"]);
  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /3 published document\(s\) present/);
});

test("the audit runs on its own and reports the published document present", async () => {
  const workspace = makeWorkspace();
  await workspace.publisher(["publish", "--apply"]);

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Audit passed/);
  assert.match(result.stdout, /1 published document\(s\) present/);
});

test("the audit fails when a published document has gone from the course", async () => {
  const workspace = makeWorkspace();
  await workspace.publisher(["publish", "--apply"]);
  workspace.writeCourse({ courseId: "4242", nextModuleId: 2, items: [] });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /Audit failed/);
  assert.match(result.stdout, /not in the course/);
});

test("the audit fails when a published document has moved to another section", async () => {
  const workspace = makeWorkspace();
  await workspace.publisher(["publish", "--apply"]);
  const course = workspace.readCourse();
  // A section the publisher knows nothing about. The audit compares what the
  // course reports against the manifest, so it must carry the section the
  // course actually names rather than assume the one section it publishes into.
  workspace.writeCourse({
    ...course,
    items: course.items.map((item) => ({ ...item, section: "Archive" })),
  });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /Audit failed/);
  assert.match(result.stdout, /in section Archive/);
  assert.match(result.stdout, /manifest records Assessment/);
});

test("the audit writes nothing to the course", async () => {
  const workspace = makeWorkspace();
  await workspace.publisher(["publish", "--apply"]);
  const before = JSON.stringify(workspace.readCourse());

  await workspace.publisher(["audit"]);

  assert.equal(JSON.stringify(workspace.readCourse()), before);
});

// The audit's rules about instructor material. Hiding is per activity and read
// back per activity, by module id: hidden must mean hidden rather than
// stealthed, and the same text found in an activity nothing published is a
// copy somebody made by hand.

test("the audit passes on instructor material published hidden", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  await workspace.publisher(["publish", "--apply"]);

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 0, result.stdout);
  assert.match(result.stdout, /Audit passed/);
  assert.match(result.stdout, /5 published document\(s\) present/);
  assert.match(
    result.stdout,
    /2 instructor document\(s\) hidden in the course/
  );
});

test("the audit fails when one instructor activity has been revealed", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.map((item) =>
      item.name.startsWith("Instructor — ") ? { ...item, visible: true } : item
    ),
  });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /Instructor material is visible/);
  // Where it sits is reported, and is not what the finding is about.
  assert.match(result.stdout, /in section "Labs"/);
});

test("the audit fails on a stealthed instructor activity, which is not hidden", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.map((item) =>
      item.name.startsWith("Instructor — ") ? { ...item, stealth: true } : item
    ),
  });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /stealthed rather than hidden/);
  assert.match(result.stdout, /leaves a working URL/);
});

test("the audit fails when instructor text is pasted into a student-facing activity", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const course = workspace.readCourse();
  const leaked = ANCHORS_MARKDOWN.split("\n").find((line) => line.length >= 60);
  assert.ok(leaked);
  workspace.writeCourse({
    ...course,
    items: [
      ...course.items,
      {
        moduleId: "99",
        name: "Lecture 2 — reading notes",
        section: "Lectures",
        visible: true,
        body: `<p>${leaked}</p>`,
      },
    ],
  });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /student-facing part of the course/);
  assert.match(result.stdout, /Lecture 2 — reading notes/);
  assert.match(result.stdout, /c1-assessment-examples--instructor\.md/);
});

test("the audit fails when a hand-made copy carries the plain title, without the prefix", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const course = workspace.readCourse();
  // What somebody making the copy by hand types: the title as the table writes
  // it. The `Instructor — ` prefix is the publisher's doing, so a page nobody
  // published never carries it — and a body retyped from memory carries none
  // of the fingerprints either, which leaves the title as the only evidence.
  workspace.writeCourse({
    ...course,
    items: [
      ...course.items,
      {
        moduleId: "98",
        name: "C1 banding anchors",
        section: "Assessment",
        visible: true,
        body: "<p>Ask me for these.</p>",
      },
    ],
  });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /student-facing part of the course/);
  assert.match(
    result.stdout,
    /matches "c1-assessment-examples--instructor\.md" by title/
  );
});

test("the audit fails when an instructor document is not in the course at all", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /is instructor material and is not in/);
  assert.match(result.stdout, /An examiner has no way to read it/);
});

test("the audit names the activity and the section of every finding", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.map((item) =>
      item.name === "Instructor — C1 banding anchors"
        ? { ...item, visible: true }
        : item
    ),
  });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  const anchors = itemNamed(workspace, "Instructor — C1 banding anchors");
  assert.ok(anchors);
  assert.match(
    result.stdout,
    new RegExp(`module ${anchors.moduleId}, in section "Assessment"`)
  );
});

test("an instructor document the course has lost is reported once, by name", async () => {
  // An examiner arriving to a missing script, as the audit sees it: the entry
  // is in the table, the document is in the repository, and the activity is
  // gone from the course.
  const workspace = makeWorkspace();
  writeInstructorSet(workspace, [
    ...INSTRUCTOR_ENTRIES,
    {
      source: "c2-assessment-examples--instructor.md",
      title: "C2 banding anchors",
      section: "Assessment",
    },
  ]);
  workspace.write(
    "c2-assessment-examples--instructor.md",
    "# C2 banding anchors\n\nA Solid answer says what it checked and what it decided not to check, and why.\n"
  );
  await workspace.publisher(["publish", "--apply"]);
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.filter(
      (item) => item.name !== "Instructor — C2 banding anchors"
    ),
  });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /C2 banding anchors/);
});

test("a sentence the grid publishes on purpose is not a leak of the anchors that quote it", async () => {
  // The oral questions live in both places by design: the anchors are worked
  // answers to the questions the grid puts in front of students. A phrase a
  // student is meant to read cannot be evidence that examiner material has
  // leaked, whichever document the audit happens to fingerprint it from.
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  const question =
    "Walk me through how you framed this work. Show me one unit you would hand to a fresh agent session.";
  workspace.write(
    "assessment-grid.md",
    `# Assessment Grid\n\nThree competencies, each graded independently on a five band scale.\n\n${question}\n`
  );
  workspace.write(
    ANCHORS_SOURCE,
    `# C1 banding anchors\n\n${question}\n\n${ANCHORS_MARKDOWN}`
  );

  await workspace.publisher(["publish", "--apply"]);
  const result = await workspace.publisher(["audit"]);

  assert.doesNotMatch(result.stdout, /student-facing part of the course/);
  assert.equal(result.code, 0, result.stdout);
});
