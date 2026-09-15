// Re-running the publisher, which is the thing that has to become boring: a
// changed document updates its own activity in place, everything else is
// skipped, and a run with nothing to do says so.
import { test } from "node:test";
import assert from "node:assert/strict";

import { DELIVERABLE_SECTION } from "../packages/course/index.ts";
import {
  makeWorkspace,
  writeDayOneSet,
  writeGrid,
  DAY_ONE_ENTRIES,
  LECTURE_MARKDOWN,
  GRID_FRONT_MATTER,
  GRID_MARKDOWN,
  LAB_MARKDOWN,
} from "./harness.ts";

test("a second consecutive run reports zero changes", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /0 to create, 0 to update, 3 to skip/);
  // Three documents and two Devoirs, none of them made twice.
  assert.equal(workspace.readCourse().items.length, 5);
});

test("a changed document is planned as an update before anything is applied", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n- Added the morning of the lecture.\n`
  );

  const plan = await workspace.publisher(["publish"]);

  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /update .*Lecture 1/);
  assert.match(plan.stdout, /0 to create, 1 to update, 2 to skip/);
  // Reporting still applies nothing: the update path is opt-in like the rest.
  const bodies = workspace.readCourse().items.map((item) => item.body);
  assert.equal(
    bodies.filter((body) => body.includes("morning of the lecture")).length,
    0
  );
});

test("editing one document updates exactly that activity, keeping its module id", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const before = workspace.readCourse().items;
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n- Added the morning of the lecture.\n`
  );

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  const after = workspace.readCourse().items;
  // No activity was deleted and recreated: same count, same module ids, in
  // the same order. That is what keeps student bookmarks and completion
  // tracking alive across a re-run.
  assert.deepEqual(
    after.map((item) => item.moduleId),
    before.map((item) => item.moduleId)
  );
  const lecture = after.find((item) => item.name.startsWith("Lecture 1"));
  assert.match(lecture?.body ?? "", /morning of the lecture/);

  // Every other activity is byte-identical to what it was.
  const untouched = after.filter((item) => !item.name.startsWith("Lecture 1"));
  assert.deepEqual(
    untouched,
    before.filter((item) => !item.name.startsWith("Lecture 1"))
  );
  // The grid, the lab and the two Devoirs.
  assert.equal(untouched.length, 4);
});

test("an update refreshes the hash and keeps the first publication date", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const first = workspace.readManifest().documents["lectures/lecture-1.md"];
  workspace.write("lectures/lecture-1.md", `${LECTURE_MARKDOWN}\n- More.\n`);

  await workspace.publisher(["publish", "--apply"]);

  const second = workspace.readManifest().documents["lectures/lecture-1.md"];
  assert.ok(first && second);
  assert.equal(second["moduleId"], first["moduleId"]);
  assert.equal(second["section"], first["section"]);
  assert.equal(second["publishedAt"], first["publishedAt"]);
  assert.notEqual(second["contentHash"], first["contentHash"]);
  assert.notEqual(second["updatedAt"], first["updatedAt"]);
});

test("an interrupted run of updates leaves an accurate manifest, and re-running finishes it", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const published = workspace.readManifest().documents;

  // All three documents change, and the driver raises on the second update.
  writeGrid(
    workspace,
    GRID_FRONT_MATTER,
    `${GRID_MARKDOWN}\n| Strong | Rare. |\n`
  );
  workspace.write("lectures/lecture-1.md", `${LECTURE_MARKDOWN}\n- More.\n`);
  workspace.write("labs/lab-1.md", `${LAB_MARKDOWN}\n- More.\n`);
  workspace.writeCourse({ ...workspace.readCourse(), failUpdateAfter: 1 });

  const interrupted = await workspace.publisher(["publish", "--apply"]);

  assert.equal(interrupted.code, 1);
  // The manifest records the one that succeeded and nothing it did not do.
  const midway = workspace.readManifest().documents;
  assert.notEqual(
    midway["assessment-grid.md"]?.["contentHash"],
    published["assessment-grid.md"]?.["contentHash"]
  );
  assert.equal(
    midway["lectures/lecture-1.md"]?.["contentHash"],
    published["lectures/lecture-1.md"]?.["contentHash"]
  );

  // Recovery is running the same command again: the item already updated is
  // skipped, and the rest completes.
  workspace.writeCourse({
    ...workspace.readCourse(),
    failUpdateAfter: undefined,
  });
  const resumed = await workspace.publisher(["publish", "--apply"]);

  assert.equal(resumed.code, 0, resumed.stderr);
  assert.match(resumed.stdout, /0 to create, 2 to update, 1 to skip/);
  // The three documents, each carrying its edit. The Devoirs beside them were
  // never part of the change.
  const after = workspace
    .readCourse()
    .items.filter((item) => item.section !== DELIVERABLE_SECTION);
  assert.equal(after.length, 3);
  for (const item of after) assert.match(item.body, /More\.|Strong/);
});

test("a document moved to another section in the table aborts rather than reporting no work", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const before = workspace.readCourse();

  // The table now sends the lab brief somewhere else. Nothing about the
  // document itself changed, so a content hash alone would say "skip".
  writeDayOneSet(
    workspace,
    DAY_ONE_ENTRIES.map((entry) =>
      entry.source === "labs/lab-1.md"
        ? { ...entry, section: "Lectures" }
        : entry
    )
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /labs\/lab-1\.md/);
  assert.match(result.stderr, /published in section Labs/);
  assert.match(result.stderr, /table now says Lectures/);
  assert.deepEqual(workspace.readCourse().items, before.items);
});

test("an update leaves visibility alone: revealing is the instructor's call", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);

  // The instructor hides the lecture by hand between runs.
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.map((item) =>
      item.name.startsWith("Lecture 1") ? { ...item, visible: false } : item
    ),
  });
  workspace.write("lectures/lecture-1.md", `${LECTURE_MARKDOWN}\n- More.\n`);

  await workspace.publisher(["publish", "--apply"]);

  const lecture = workspace
    .readCourse()
    .items.find((item) => item.name.startsWith("Lecture 1"));
  assert.equal(lecture?.visible, false);
  assert.match(lecture?.body ?? "", /More\./);
});

/** The day-one set with the lecture renamed and nothing else changed. */
const RENAMED_LECTURE = DAY_ONE_ENTRIES.map((entry) =>
  entry.source === "lectures/lecture-1.md"
    ? { ...entry, title: "Framing and decomposing" }
    : entry
);

test("retitling an entry in the table renames the activity, leaving its body alone", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const before = workspace.readCourse().items;

  // Only the title changes. The document on disk is untouched, so its hash is
  // unchanged — which is exactly the change a manifest comparison cannot see,
  // and why the plan reads the name off the course instead.
  workspace.writeCatalog({ published: RENAMED_LECTURE });

  const plan = await workspace.publisher(["publish"]);
  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /0 to create, 1 to update, 2 to skip/);

  const second = await workspace.publisher(["publish", "--apply"]);
  assert.equal(second.code, 0, second.stderr);

  const after = workspace.readCourse().items;
  // Renamed where it stands: same module ids, so the activity keeps its
  // history rather than being deleted and made again under the new name.
  assert.deepEqual(
    after.map((item) => item.moduleId),
    before.map((item) => item.moduleId)
  );
  const renamed = after.find((item) => item.name === "Framing and decomposing");
  assert.ok(
    renamed,
    `nothing is called "Framing and decomposing": ${after
      .map((item) => item.name)
      .join(", ")}`
  );
  assert.equal(
    renamed.body,
    before.find((item) => item.moduleId === renamed.moduleId)?.body
  );
  assert.equal(
    after.filter((item) => item.name.startsWith("Lecture 1")).length,
    0
  );
});

test("a run after a rename has nothing left to do", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  workspace.writeCatalog({ published: RENAMED_LECTURE });
  await workspace.publisher(["publish", "--apply"]);

  const third = await workspace.publisher(["publish", "--apply"]);

  assert.equal(third.code, 0, third.stderr);
  assert.match(third.stdout, /0 to create, 0 to update, 3 to skip/);
});
