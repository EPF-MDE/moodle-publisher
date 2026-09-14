// A picture a document shows has to be in the course before the document can
// show it. Nothing in the repository is a URL Moodle serves, so publishing a
// lecture with a diagram in it means uploading the file with the page that
// shows it and pointing the reference at what Moodle serves it back as —
// otherwise a student meets a broken image icon, which is exactly the thing
// found out in front of a class.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assetsFor,
  makeWorkspace,
  writeDayOneSet,
  itemNamed,
  LECTURE_MARKDOWN,
  LAB_MARKDOWN,
} from "./harness.ts";

import type { Workspace } from "./harness.ts";

/** Stand-in for a diagram: the publisher uploads bytes, not pixels. */
const DIAGRAM = "first drawing of the five-phase workflow";
const REDRAWN = "second drawing, arrows corrected";

/** The day-one set with one diagram, shown by the lecture. */
function writeLectureShowingDiagram(workspace: Workspace): void {
  writeDayOneSet(workspace);
  workspace.write("assets/workflow.png", DIAGRAM);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![The five-phase workflow](../assets/workflow.png)\n`
  );
}

test("a document showing a diagram publishes it with the page that shows it", async () => {
  const workspace = makeWorkspace();
  writeLectureShowingDiagram(workspace);

  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  const lecture = itemNamed(workspace, "Lecture 1 — Framing and decomposing");
  // What a student reads: no repository path, and no unresolved placeholder
  // either — a body still saying `@@PLUGINFILE@@` is a broken icon.
  assert.doesNotMatch(lecture?.body ?? "", /\.\.\/assets\/workflow\.png/);
  assert.doesNotMatch(lecture?.body ?? "", /@@PLUGINFILE@@/);

  const [asset, ...rest] = assetsFor(workspace, "lectures/lecture-1.md");
  assert.deepEqual(rest, []);
  assert.equal(asset?.path, "assets/workflow.png");
  assert.ok(
    lecture?.body.includes(asset?.url ?? "\0"),
    `the lecture body does not point at ${asset?.url}: ${lecture?.body}`
  );
});

test("the run says which picture it uploaded and where", async () => {
  const workspace = makeWorkspace();
  writeLectureShowingDiagram(workspace);

  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  assert.match(applied.stdout, /uploaded assets\/workflow\.png/);
});

test("a document naming a picture that is not in the repository stops the run", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![Not drawn yet](../assets/workflow.png)\n`
  );

  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 1);
  // Named both ways round: the document to open, and the path to put there.
  assert.match(applied.stderr, /lectures\/lecture-1\.md/);
  assert.match(applied.stderr, /assets\/workflow\.png/);
  // Before anything is written: not the grid, which the plan would otherwise
  // have created first, and not the manifest.
  assert.deepEqual(workspace.readCourse().items, []);
  assert.deepEqual(workspace.readManifest().documents, {});
});

test("a missing picture stops the plan too, before it is ever applied", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write(
    "labs/lab-1.md",
    `${LAB_MARKDOWN}\n<img src="../assets/screenshot.png" width="600">\n`
  );

  const plan = await workspace.publisher(["publish"]);

  assert.equal(plan.code, 1);
  assert.match(plan.stderr, /labs\/lab-1\.md/);
  assert.match(plan.stderr, /assets\/screenshot\.png/);
});

test("a picture kept outside the repository stops the run as a missing one", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![Elsewhere](../../elsewhere/workflow.png)\n`
  );

  const plan = await workspace.publisher(["publish"]);

  assert.equal(plan.code, 1);
  assert.match(plan.stderr, /lectures\/lecture-1\.md/);
  assert.match(plan.stderr, /elsewhere\/workflow\.png/);
});

test("running twice in a row leaves the course and the manifest unchanged", async () => {
  const workspace = makeWorkspace();
  writeLectureShowingDiagram(workspace);

  const first = await workspace.publisher(["publish", "--apply"]);
  const course = JSON.stringify(workspace.readCourse());
  const manifest = JSON.stringify(workspace.readManifest());
  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(first.code, 0, first.stderr);
  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /0 to create, 0 to update, 3 to skip/);
  assert.equal(JSON.stringify(workspace.readCourse()), course);
  assert.equal(JSON.stringify(workspace.readManifest()), manifest);
});

test("a redrawn diagram goes up again with the document that shows it", async () => {
  const workspace = makeWorkspace();
  writeLectureShowingDiagram(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const before = assetsFor(workspace, "lectures/lecture-1.md");

  workspace.write("assets/workflow.png", REDRAWN);
  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  assert.match(applied.stdout, /0 to create, 1 to update, 2 to skip/);
  assert.match(applied.stdout, /uploaded assets\/workflow\.png/);
  // The URL is the activity's own, so rewriting the page does not move the
  // picture: a link a student pasted into their notes still works. What the
  // record says the picture *is* does change, and has to — that is what the
  // next run compares the redrawn file against.
  assert.deepEqual(
    assetsFor(workspace, "lectures/lecture-1.md").map((asset) => asset.url),
    before.map((asset) => asset.url)
  );
});

test("two documents showing one picture each get their own copy of it", async () => {
  const workspace = makeWorkspace();
  writeLectureShowingDiagram(workspace);
  workspace.write(
    "labs/lab-1.md",
    `${LAB_MARKDOWN}\n![The five-phase workflow](../assets/workflow.png)\n`
  );

  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  const lecture = assetsFor(workspace, "lectures/lecture-1.md");
  const lab = assetsFor(workspace, "labs/lab-1.md");
  assert.equal(lecture[0]?.path, "assets/workflow.png");
  assert.equal(lab[0]?.path, "assets/workflow.png");
  // A page serves its own files. Pointing the lab at the lecture's copy would
  // break the lab the day the lecture is deleted.
  assert.notEqual(lecture[0]?.url, lab[0]?.url);
});

test("two pictures with the same file name stay two pictures", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write("assets/before/diagram.png", DIAGRAM);
  workspace.write("assets/after/diagram.png", REDRAWN);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![Before](../assets/before/diagram.png)\n\n` +
      `![After](../assets/after/diagram.png)\n`
  );

  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  const assets = assetsFor(workspace, "lectures/lecture-1.md");
  assert.deepEqual(assets.map((asset) => asset.path).sort(), [
    "assets/after/diagram.png",
    "assets/before/diagram.png",
  ]);
  // Uploaded under names that are not the same, or the second would overwrite
  // the first and both references would show one drawing.
  assert.notEqual(assets[0]?.url, assets[1]?.url);
});

test("the same picture shown twice in one document is uploaded once", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write("assets/workflow.png", DIAGRAM);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![Wide](../assets/workflow.png)\n\n` +
      `<img src="../assets/workflow.png" width="300">\n`
  );

  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  assert.deepEqual(assetsFor(workspace, "lectures/lecture-1.md").length, 1);
});

test("a picture hosted elsewhere is left where it is", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![Hosted](https://example.test/workflow.png)\n`
  );

  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  const lecture = itemNamed(workspace, "Lecture 1 — Framing and decomposing");
  assert.match(lecture?.body ?? "", /https:\/\/example\.test\/workflow\.png/);
  assert.deepEqual(assetsFor(workspace, "lectures/lecture-1.md"), []);
});

test("a document showing nothing records no assets at all", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);

  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  // Load-bearing: an entry for a document with no pictures must stay exactly
  // what it was, or the first run after this change rewrites every entry in a
  // manifest that is read in a diff.
  const entry = workspace.readManifest().documents["lectures/lecture-1.md"];
  assert.deepEqual(Object.keys(entry ?? {}).sort(), [
    "contentHash",
    "kind",
    "moduleId",
    "publishedAt",
    "section",
    "updatedAt",
  ]);
});
