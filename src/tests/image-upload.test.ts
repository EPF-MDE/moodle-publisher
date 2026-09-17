// A picture a document shows travels inside the PDF that shows it. Nothing in
// the repository is a URL Moodle serves, so the print-ready HTML handed to the
// course carries every picture's bytes — otherwise a printed or offline copy
// is missing its diagrams, and a student meets a broken image, which is
// exactly the thing found out in front of a class.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  makeWorkspace,
  writeDayOneSet,
  itemNamed,
  LECTURE_MARKDOWN,
  LAB_MARKDOWN,
} from "./harness.ts";

import type { Workspace } from "./harness.ts";

/** Stand-in for a diagram: the publisher embeds bytes, not pixels. */
const DIAGRAM = "first drawing of the five-phase workflow";
const REDRAWN = "second drawing, arrows corrected";

const LECTURE = "Lecture 1 — Framing and decomposing";

/** How `bytes` read once embedded in a document, as a picture of `type`. */
function embedded(bytes: string, type = "image/png"): string {
  return `src="data:${type};base64,${Buffer.from(bytes).toString("base64")}"`;
}

/** The HTML the course was handed for the lecture. */
function lectureBody(workspace: Workspace): string {
  return itemNamed(workspace, LECTURE)?.body ?? "";
}

/** The day-one set with one diagram, shown by the lecture. */
function writeLectureShowingDiagram(workspace: Workspace): void {
  writeDayOneSet(workspace);
  workspace.write("assets/workflow.png", DIAGRAM);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![The five-phase workflow](../assets/workflow.png)\n`
  );
}

test("every picture the document shows is embedded in the HTML handed to the course", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write("assets/workflow.png", DIAGRAM);
  workspace.write("assets/flow.svg", "<svg xmlns='http://www.w3.org/2000/svg'/>");
  // Markdown, and the HTML authors reach for whenever a diagram needs a width.
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![Workflow](../assets/workflow.png)\n\n` +
      `<img src="../assets/flow.svg" width="300">\n`
  );

  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  const body = lectureBody(workspace);
  assert.ok(body.includes(embedded(DIAGRAM)), body);
  // An SVG is only drawn when it is labelled as one.
  assert.ok(
    body.includes(
      embedded("<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml")
    ),
    body
  );
  // What a student reads: no repository path, and no Moodle file reference.
  assert.doesNotMatch(body, /assets\//);
  assert.doesNotMatch(body, /@@PLUGINFILE@@/);
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
  assert.match(applied.stderr, /shows the picture "assets\/workflow\.png"/);
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
  assert.match(second.stdout, /0 PDFs to create, 3 to skip/);
  assert.equal(JSON.stringify(workspace.readCourse()), course);
  assert.equal(JSON.stringify(workspace.readManifest()), manifest);
});

test("two documents showing one picture each embed it", async () => {
  const workspace = makeWorkspace();
  writeLectureShowingDiagram(workspace);
  workspace.write(
    "labs/lab-1.md",
    `${LAB_MARKDOWN}\n![The five-phase workflow](../assets/workflow.png)\n`
  );

  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  assert.ok(lectureBody(workspace).includes(embedded(DIAGRAM)));
  const lab = itemNamed(workspace, "Lab 1 — Frame and decompose your own work");
  assert.ok(lab?.body.includes(embedded(DIAGRAM)));
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
  const body = lectureBody(workspace);
  assert.ok(
    body.indexOf(embedded(DIAGRAM)) < body.indexOf(embedded(REDRAWN)),
    "the two drawings are both there, in the order the document shows them"
  );
});

test("the same picture shown twice in one document is embedded where each shows it", async () => {
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
  assert.equal(lectureBody(workspace).split(embedded(DIAGRAM)).length - 1, 2);
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
  assert.match(
    lectureBody(workspace),
    /src="https:\/\/example\.test\/workflow\.png"/
  );
});

test("a document's manifest entry records no pictures, only its hash", async () => {
  const workspace = makeWorkspace();
  writeLectureShowingDiagram(workspace);

  const applied = await workspace.publisher(["publish", "--apply"]);

  assert.equal(applied.code, 0, applied.stderr);
  // The pictures are inside the PDF, so there is nothing of theirs for the
  // course to serve and nothing to record beyond the hash they are part of.
  const entry = workspace.readManifest().documents["lectures/lecture-1.md"];
  assert.deepEqual(Object.keys(entry ?? {}).sort(), [
    "contentHash",
    "kind",
    "moduleId",
    "publishedAt",
    "section",
    "title",
    "updatedAt",
  ]);
});
