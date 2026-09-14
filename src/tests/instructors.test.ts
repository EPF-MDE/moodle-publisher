// Instructor material: published hidden, in the section its student
// counterpart sits in, and re-hidden when a run finds it showing.
//
// This is the riskiest thing the publisher does — the answer key goes into the
// course the students are enrolled in — so these tests are about what a
// student could see, not about how the publisher arranges it internally.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ANCHORS_SOURCE,
  DAY_ONE_ENTRIES,
  INSTRUCTOR_ENTRIES,
  itemNamed,
  makeWorkspace,
  sectionsOf,
  writeInstructorSet,
} from "./harness.ts";

const SCRIPT = "Instructor — Oral interview script";
const ANCHORS = "Instructor — C1 banding anchors";
const LECTURE = "Lecture 1 — Framing and decomposing";

test("instructor material is created hidden, beside the documents it pairs with", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  // Every section visible, including the two holding an answer key: hiding is
  // a property of the page, and a section nobody hid is a section nobody can
  // reveal by accident.
  assert.deepEqual(sectionsOf(workspace), [
    ["General", true],
    ["Assessment", true],
    ["Lectures", true],
    ["Labs", true],
  ]);
  assert.deepEqual(
    workspace
      .readCourse()
      .items.filter((item) => item.name.startsWith("Instructor — "))
      .map((item) => [item.name, item.section, item.visible]),
    [
      [SCRIPT, "Labs", false],
      [ANCHORS, "Assessment", false],
    ]
  );
  // The student-facing half of the same run is untouched by any of this.
  assert.equal(itemNamed(workspace, LECTURE)?.visible, true);
});

test("the plan says where instructor material goes and that it will be hidden", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);

  const result = await workspace.publisher(["publish"]);

  assert.match(result.stdout, new RegExp(`create\\s+${SCRIPT}`));
  assert.match(
    result.stdout,
    /section: Labs \(created hidden, examiners only\)/
  );
  assert.deepEqual(workspace.readCourse().items, []);
});

test("a second run reports zero changes for instructor material too", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  await workspace.publisher(["publish", "--apply"]);

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /0 to create, 0 to update, 5 to skip, 0 to hide/);
  assert.doesNotMatch(result.stdout, /re-hid/);
});

test("editing a banding anchor updates the activity in place and leaves it hidden", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const before = itemNamed(workspace, ANCHORS);
  workspace.write(
    ANCHORS_SOURCE,
    "# C1 banding anchors\n\nRewritten the night before the orals, after the first lab group.\n"
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.match(result.stdout, new RegExp(`updated\\s+${ANCHORS}`));
  const after = itemNamed(workspace, ANCHORS);
  assert.equal(after?.moduleId, before?.moduleId);
  assert.equal(after?.visible, false);
  assert.match(after?.body ?? "", /the night before the orals/);
});

test("a run that finds one instructor activity revealed re-hides that one only", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.map((item) =>
      item.name === SCRIPT ? { ...item, visible: true } : item
    ),
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.match(result.stdout, new RegExp(`re-hid\\s+${SCRIPT}`));
  assert.doesNotMatch(result.stdout, new RegExp(`re-hid\\s+${ANCHORS}`));
  assert.equal(itemNamed(workspace, SCRIPT)?.visible, false);
  assert.equal(itemNamed(workspace, ANCHORS)?.visible, false);
});

test("a document the instructor revealed by hand stays revealed", async () => {
  // The rule this change must not weaken: student-facing visibility is set on
  // create and never touched again, so the C3 brief's reveal on 11 September
  // stays a human decision.
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.map((item) =>
      item.name === LECTURE ? { ...item, visible: false } : item
    ),
  });

  await workspace.publisher(["publish", "--apply"]);

  assert.equal(itemNamed(workspace, LECTURE)?.visible, false);
});

test("a dry run over a revealed instructor page changes nothing and reports the hide", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.map((item) =>
      item.name === SCRIPT ? { ...item, visible: true } : item
    ),
  });

  const result = await workspace.publisher(["publish"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`hide\\s+${SCRIPT}`));
  assert.match(result.stdout, /visible, will be re-hidden/);
  // The re-hidden document is counted once, as a hide: its line says `hide`,
  // and counting it as a skip too would describe more work than is listed.
  assert.match(result.stdout, /4 to skip, 1 to hide/);
  assert.match(result.stdout, /Nothing has been applied/);
  assert.equal(itemNamed(workspace, SCRIPT)?.visible, true);
});

test("a document listed without the suffix publishes visible, and nothing stops it", async () => {
  // Deliberate: the filename is the statement, and there is no second place
  // that says who a document is for to disagree with it. An entry naming the
  // student copy of a path publishes the student copy.
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  workspace.write(
    "labs/lab-3-oral.md",
    "# Lab 3 — Orals\n\nThe three questions.\n"
  );
  workspace.writeCatalog({
    published: [
      ...DAY_ONE_ENTRIES,
      ...INSTRUCTOR_ENTRIES,
      {
        source: "labs/lab-3-oral.md",
        title: "Lab 3 — Orals",
        section: "Labs",
      },
    ],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(itemNamed(workspace, "Lab 3 — Orals")?.visible, true);
  assert.equal(itemNamed(workspace, SCRIPT)?.visible, false);
});

test("wipe reports and deletes the instructor activities with everything else", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  await workspace.publisher(["publish", "--apply"]);

  const planned = await workspace.publisher(["wipe", "--course", "4242"]);
  assert.match(planned.stdout, new RegExp(`delete activity\\s+${SCRIPT}`));
  assert.match(planned.stdout, /delete section\s+3\. Labs/);

  const result = await workspace.publisher([
    "wipe",
    "--course",
    "4242",
    "--apply",
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(workspace.readCourse().items, []);
  assert.deepEqual(sectionsOf(workspace), [["General", true]]);
});

test("a document added later has no say over instructor material's visibility", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  await workspace.publisher(["publish", "--apply"]);

  // The table grows, as it does whenever the second half of the course is
  // written, and the run that publishes the new document is an ordinary one.
  workspace.write("labs/lab-3.md", "# Lab 3 — the brief\n\nWritten later.\n");
  workspace.writeCatalog({
    published: [
      ...DAY_ONE_ENTRIES,
      ...INSTRUCTOR_ENTRIES,
      {
        source: "labs/lab-3.md",
        title: "Lab 3 — Debug a system you did not write",
        section: "Labs",
      },
    ],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  // The new document arrives visible, and the instructor material it arrives
  // beside is exactly where the first run left it: publishing a student
  // document has no vocabulary for revealing anything else.
  assert.equal(
    itemNamed(workspace, "Lab 3 — Debug a system you did not write")?.visible,
    true
  );
  assert.equal(itemNamed(workspace, SCRIPT)?.visible, false);
  assert.equal(itemNamed(workspace, ANCHORS)?.visible, false);
});

test("an instructor activity the manifest lost is not published a second time", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  // The answer key is in the course and the manifest has no record of it: a
  // manifest restored from before it was published, or a copy made by hand.
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 9,
    sections: ["General", "Assessment", "Lectures", "Labs"],
    items: [
      {
        moduleId: "8",
        name: SCRIPT,
        section: "Labs",
        visible: false,
        body: "<h1>Oral interview script</h1>",
      },
    ],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /lab-3-oral--instructor\.md/);
  assert.match(result.stderr, /second copy of examiner-only material/);
  // Nothing was created beside it, and the run stopped before it wrote the
  // student-facing half either.
  assert.deepEqual(
    workspace.readCourse().items.map((item) => item.moduleId),
    ["8"]
  );
});
