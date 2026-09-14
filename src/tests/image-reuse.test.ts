// Uploading is the expensive half of publishing a lecture: 28 pictures and
// five megabytes go through a browser session one file picker at a time. So a
// run only sends the bytes the course does not already hold, and says how many
// that is before it sends any of them.
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

import type { RecordedAsset, Workspace } from "./harness.ts";

const WORKFLOW = "first drawing of the five-phase workflow";
const REDRAWN = "second drawing, arrows corrected";
const SEAMS = "a drawing of two modules and the seam between them";

/** The day-one set with a lecture showing two diagrams. */
function writeLectureShowingTwo(workspace: Workspace): void {
  writeDayOneSet(workspace);
  workspace.write("assets/workflow.png", WORKFLOW);
  workspace.write("assets/seams.png", SEAMS);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![The five-phase workflow](../assets/workflow.png)\n\n` +
      `![Seams](../assets/seams.png)\n`
  );
}

/** What the manifest says each of a document's pictures hashes to, by path. */
function hashesFor(
  workspace: Workspace,
  source: string
): Record<string, string | undefined> {
  return Object.fromEntries(
    assetsFor(workspace, source).map((asset) => [asset.path, asset.contentHash])
  );
}

/** The paths the run says it uploaded, in the order it reported them. */
function uploaded(stdout: string): string[] {
  return [...stdout.matchAll(/uploaded (\S+)/g)].map(([, path]) => path ?? "");
}

test("the plan says how many pictures it would upload before it uploads any", async () => {
  const workspace = makeWorkspace();
  writeLectureShowingTwo(workspace);

  const plan = await workspace.publisher(["publish"]);

  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /2 pictures to upload/);
  assert.match(plan.stdout, /pictures: 2 of 2 to upload/);
  // Before any of them: nothing has been written to the course at all.
  assert.deepEqual(workspace.readCourse().items, []);
  assert.deepEqual(workspace.readManifest().documents, {});
});

test("the manifest records what each picture in the course hashes to", async () => {
  const workspace = makeWorkspace();
  writeLectureShowingTwo(workspace);

  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  const assets = assetsFor(workspace, "lectures/lecture-1.md");
  assert.equal(assets.length, 2);
  for (const asset of assets) {
    assert.match(asset.contentHash ?? "", /^sha256:[0-9a-f]{64}$/);
  }
  // Two different drawings, so two different hashes: a hash that did not
  // depend on the bytes would let a redrawn diagram pass as unchanged.
  assert.notEqual(assets[0]?.contentHash, assets[1]?.contentHash);
});

test("re-publishing a document whose prose changed uploads none of its pictures", async () => {
  const workspace = makeWorkspace();
  writeLectureShowingTwo(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const before = assetsFor(workspace, "lectures/lecture-1.md");

  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\nOne more sentence about framing.\n\n` +
      `![The five-phase workflow](../assets/workflow.png)\n\n` +
      `![Seams](../assets/seams.png)\n`
  );
  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  assert.match(applied.stdout, /0 to create, 1 to update/);
  assert.match(applied.stdout, /0 pictures to upload/);
  assert.deepEqual(uploaded(applied.stdout), []);
  // Not uploading is not forgetting: the page still shows both, and the
  // manifest still says where the course serves them.
  assert.deepEqual(assetsFor(workspace, "lectures/lecture-1.md"), before);
  const lecture = itemNamed(workspace, "Lecture 1 — Framing and decomposing");
  assert.doesNotMatch(lecture?.body ?? "", /@@PLUGINFILE@@/);
  assert.ok(lecture?.body.includes(before[0]?.url ?? "\0"));
  assert.ok(lecture?.body.includes(before[1]?.url ?? "\0"));
});

test("only the picture that was redrawn goes up again", async () => {
  const workspace = makeWorkspace();
  writeLectureShowingTwo(workspace);
  await workspace.publisher(["publish", "--apply"]);

  const before = hashesFor(workspace, "lectures/lecture-1.md");

  workspace.write("assets/seams.png", REDRAWN);
  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  assert.deepEqual(uploaded(applied.stdout), ["assets/seams.png"]);
  assert.match(applied.stdout, /1 picture to upload/);
  // The record now says what the course holds: the new bytes for the drawing
  // that changed, and the old ones, untouched, for the drawing that did not.
  const after = hashesFor(workspace, "lectures/lecture-1.md");
  assert.notEqual(after["assets/seams.png"], before["assets/seams.png"]);
  assert.equal(after["assets/workflow.png"], before["assets/workflow.png"]);
});

test("a picture added to a published document is the only one uploaded", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write("assets/workflow.png", WORKFLOW);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![The five-phase workflow](../assets/workflow.png)\n`
  );
  await workspace.publisher(["publish", "--apply"]);

  workspace.write("assets/seams.png", SEAMS);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![The five-phase workflow](../assets/workflow.png)\n\n` +
      `![Seams](../assets/seams.png)\n`
  );
  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  assert.deepEqual(uploaded(applied.stdout), ["assets/seams.png"]);
  assert.deepEqual(
    assetsFor(workspace, "lectures/lecture-1.md")
      .map((asset) => asset.path)
      .sort(),
    ["assets/seams.png", "assets/workflow.png"]
  );
});

test("a document that loses a picture stops recording it", async () => {
  const workspace = makeWorkspace();
  writeLectureShowingTwo(workspace);
  await workspace.publisher(["publish", "--apply"]);

  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![The five-phase workflow](../assets/workflow.png)\n`
  );
  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  assert.deepEqual(uploaded(applied.stdout), []);
  assert.deepEqual(
    assetsFor(workspace, "lectures/lecture-1.md").map((asset) => asset.path),
    ["assets/workflow.png"]
  );
});

test("an entry recorded before pictures were hashed uploads them once, then stops", async () => {
  const workspace = makeWorkspace();
  writeLectureShowingTwo(workspace);
  await workspace.publisher(["publish", "--apply"]);

  // The manifest as an older run left it: a URL per picture and no hash. The
  // run cannot tell whether those bytes are still what the course holds, so it
  // sends them — once — and records what it sent.
  const manifest = workspace.readManifest();
  const entry = manifest.documents["lectures/lecture-1.md"] as unknown as {
    assets: RecordedAsset[];
  };
  entry.assets = entry.assets.map(({ path, url }) => ({ path, url }));
  workspace.write("moodle-manifest.json", JSON.stringify(manifest, null, 2));
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\nA sentence that makes this an update.\n\n` +
      `![The five-phase workflow](../assets/workflow.png)\n\n` +
      `![Seams](../assets/seams.png)\n`
  );

  const first = await workspace.publisher(["publish", "--apply"]);
  assert.equal(first.code, 0, first.stderr);
  assert.deepEqual(uploaded(first.stdout).sort(), [
    "assets/seams.png",
    "assets/workflow.png",
  ]);

  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\nAnd another sentence.\n\n` +
      `![The five-phase workflow](../assets/workflow.png)\n\n` +
      `![Seams](../assets/seams.png)\n`
  );
  const second = await workspace.publisher(["publish", "--apply"]);
  assert.equal(second.code, 0, second.stderr);
  assert.deepEqual(uploaded(second.stdout), []);
});

test("a document the course holds no pictures for is published again, unchanged text and all", async () => {
  const workspace = makeWorkspace();
  writeLectureShowingTwo(workspace);
  await workspace.publisher(["publish", "--apply"]);

  // The state the real course is in: a lecture published before pictures were
  // uploaded at all. Its text has not changed since, so its hash still
  // matches, and the manifest records no picture for it — because the activity
  // holds none.
  const course = workspace.readCourse();
  const items = course.items.map(({ ...item }) => {
    delete (item as { files?: unknown }).files;
    return item;
  });
  workspace.writeCourse({ ...course, items });
  const manifest = workspace.readManifest();
  delete (manifest.documents["lectures/lecture-1.md"] as { assets?: unknown })
    .assets;
  workspace.write("moodle-manifest.json", JSON.stringify(manifest, null, 2));

  const plan = await workspace.publisher(["publish"]);
  const applied = await workspace.publisher(["publish", "--apply"]);

  // A hash that says the prose is unchanged says nothing about whether the
  // course ever received the drawings. It did not, and a student would be
  // reading a page of broken icons, so the run puts them there.
  assert.match(plan.stdout, /2 pictures to upload/);
  assert.equal(applied.code, 0, applied.stderr);
  assert.deepEqual(uploaded(applied.stdout).sort(), [
    "assets/seams.png",
    "assets/workflow.png",
  ]);
  const lecture = itemNamed(workspace, "Lecture 1 — Framing and decomposing");
  assert.doesNotMatch(lecture?.body ?? "", /@@PLUGINFILE@@/);
  assert.equal(assetsFor(workspace, "lectures/lecture-1.md").length, 2);
});

test("an interrupted run records what it uploaded, and running again finishes the job", async () => {
  const workspace = makeWorkspace();
  writeLectureShowingTwo(workspace);
  workspace.write(
    "labs/lab-1.md",
    `${LAB_MARKDOWN}\n![Seams](../assets/seams.png)\n`
  );
  // The grid, then the lecture with its two pictures, then the lab: the third
  // create is the one that never happens.
  workspace.writeCourse({ courseId: "4242", failCreateAfter: 2, items: [] });

  const interrupted = await workspace.publisher(["publish", "--apply"]);

  assert.equal(interrupted.code, 1);
  const lecture = assetsFor(workspace, "lectures/lecture-1.md");
  assert.equal(lecture.length, 2);
  assert.deepEqual(assetsFor(workspace, "labs/lab-1.md"), []);

  // The same command again. What was uploaded is not uploaded a second time,
  // and what never made it goes up now.
  workspace.writeCourse({
    ...workspace.readCourse(),
    failCreateAfter: undefined,
  });
  const finished = await workspace.publisher(["publish", "--apply"]);

  assert.equal(finished.code, 0, finished.stderr);
  assert.deepEqual(uploaded(finished.stdout), ["assets/seams.png"]);
  assert.deepEqual(assetsFor(workspace, "lectures/lecture-1.md"), lecture);
  assert.equal(assetsFor(workspace, "labs/lab-1.md").length, 1);
  const lab = itemNamed(workspace, "Lab 1 — Frame and decompose");
  assert.doesNotMatch(lab?.body ?? "", /@@PLUGINFILE@@/);
});

test("two documents showing one picture each hold their own copy of it", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write("assets/workflow.png", WORKFLOW);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![The five-phase workflow](../assets/workflow.png)\n`
  );
  workspace.write(
    "labs/lab-1.md",
    `${LAB_MARKDOWN}\n![The five-phase workflow](../assets/workflow.png)\n`
  );

  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  // A page serves its own files, so the file goes into both activities — and
  // the plan says so, in pictures, before it does it.
  assert.match(applied.stdout, /2 pictures to upload/);
  assert.deepEqual(uploaded(applied.stdout), [
    "assets/workflow.png",
    "assets/workflow.png",
  ]);
  const lecture = assetsFor(workspace, "lectures/lecture-1.md");
  const lab = assetsFor(workspace, "labs/lab-1.md");
  assert.notEqual(lecture[0]?.url, lab[0]?.url);
  // One file, one set of bytes: the same picture hashes the same wherever it
  // is shown, which is what makes a re-run of either document upload nothing.
  assert.equal(lecture[0]?.contentHash, lab[0]?.contentHash);
});
