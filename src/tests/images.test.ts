// A document is its markdown and the pictures it shows. Redrawing a diagram
// the morning of the lecture changes what students see, so it has to change
// the verdict the plan reports — otherwise the run says there is no work to do
// and leaves the old picture up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  makeWorkspace,
  writeDayOneSet,
  LECTURE_MARKDOWN,
  LAB_MARKDOWN,
} from "./harness.ts";

import type { Workspace } from "./harness.ts";

/**
 * Replacing a changed document's PDF in the same module is the next ticket
 * (#24). Until it lands a run leaves a published document alone, so these wait
 * for it rather than being deleted with the page path they were written for.
 */
const AWAITS_REPLACE = { skip: "replacing a changed PDF is #24" };

/** Stand-in for a diagram: the publisher hashes bytes, not pixels. */
const DIAGRAM = "first drawing of the five-phase workflow";
const REDRAWN = "second drawing, arrows corrected";

/**
 * The day-one set with a diagram beside it, shown by the documents `showing`
 * names. References are written the way the real lectures write them:
 * relative to the document, not to the repository root.
 */
function writeSetShowingDiagram(
  workspace: Workspace,
  showing: readonly string[]
): void {
  writeDayOneSet(workspace);
  workspace.write("assets/workflow.png", DIAGRAM);
  if (showing.includes("lectures/lecture-1.md")) {
    workspace.write(
      "lectures/lecture-1.md",
      `${LECTURE_MARKDOWN}\n![The five-phase workflow](../assets/workflow.png)\n`
    );
  }
  if (showing.includes("labs/lab-1.md")) {
    workspace.write(
      "labs/lab-1.md",
      `${LAB_MARKDOWN}\n![The five-phase workflow](../assets/workflow.png)\n`
    );
  }
}

test("redrawing a diagram plans the document that shows it as an update", AWAITS_REPLACE, async () => {
  const workspace = makeWorkspace();
  writeSetShowingDiagram(workspace, ["lectures/lecture-1.md"]);
  await workspace.publisher(["publish", "--apply"]);

  workspace.write("assets/workflow.png", REDRAWN);
  const plan = await workspace.publisher(["publish"]);

  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /update .*Lecture 1/);
  assert.match(plan.stdout, /0 to create, 1 to update, 2 to skip/);
  // The verdict is visible before anything is applied, as every other verdict
  // is: reporting still applies nothing.
  assert.match(plan.stdout, /Nothing has been applied/);
});

test("redrawing one diagram marks every document that shows it", AWAITS_REPLACE, async () => {
  const workspace = makeWorkspace();
  writeSetShowingDiagram(workspace, ["lectures/lecture-1.md", "labs/lab-1.md"]);
  await workspace.publisher(["publish", "--apply"]);

  workspace.write("assets/workflow.png", REDRAWN);
  const plan = await workspace.publisher(["publish"]);

  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /update .*Lecture 1/);
  assert.match(plan.stdout, /update .*Lab 1/);
  assert.match(plan.stdout, /0 to create, 2 to update, 1 to skip/);
});

test("editing a picture no published document shows changes nothing", async () => {
  const workspace = makeWorkspace();
  writeSetShowingDiagram(workspace, ["lectures/lecture-1.md"]);
  await workspace.publisher(["publish", "--apply"]);

  workspace.write("assets/unused.png", REDRAWN);
  const plan = await workspace.publisher(["publish"]);

  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /0 PDFs to create, 3 to skip/);
});

test("a second consecutive run after a redrawn diagram reports zero changes", AWAITS_REPLACE, async () => {
  const workspace = makeWorkspace();
  writeSetShowingDiagram(workspace, ["lectures/lecture-1.md", "labs/lab-1.md"]);
  await workspace.publisher(["publish", "--apply"]);
  workspace.write("assets/workflow.png", REDRAWN);

  const first = await workspace.publisher(["publish", "--apply"]);
  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(first.code, 0, first.stderr);
  assert.match(first.stdout, /0 to create, 2 to update, 1 to skip/);
  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /0 PDFs to create, 3 to skip/);
});

test("a picture that is not there yet holds its document back until it arrives", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![Not drawn yet](../assets/workflow.png)\n`
  );

  // The picture is embedded in the document that shows it, so a document
  // whose diagram is missing cannot be published at all — see
  // `image-upload.test.ts` for what the refusal says.
  const missing = await workspace.publisher(["publish", "--apply"]);
  workspace.write("assets/workflow.png", DIAGRAM);
  const arrived = await workspace.publisher(["publish", "--apply"]);

  assert.equal(missing.code, 1);
  assert.equal(arrived.code, 0, arrived.stderr);
  assert.match(arrived.stdout, /3 PDFs to create/);
});

test("a diagram shown as HTML counts as much as one shown as markdown", AWAITS_REPLACE, async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write("assets/workflow.png", DIAGRAM);
  // Authors reach for HTML whenever a diagram needs a width.
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n<img src="../assets/workflow.png" width="600">\n`
  );
  await workspace.publisher(["publish", "--apply"]);

  workspace.write("assets/workflow.png", REDRAWN);
  const plan = await workspace.publisher(["publish"]);

  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /0 to create, 1 to update, 2 to skip/);
});

test("a diagram named by a link definition counts too", AWAITS_REPLACE, async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write("assets/workflow.png", DIAGRAM);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![The five-phase workflow][workflow]\n\n` +
      `[workflow]: ../assets/workflow.png\n`
  );
  await workspace.publisher(["publish", "--apply"]);

  workspace.write("assets/workflow.png", REDRAWN);
  const plan = await workspace.publisher(["publish"]);

  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /0 to create, 1 to update, 2 to skip/);
});

test("a picture quoted in a code fence is shown to nobody, and counts for nothing", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write("assets/workflow.png", DIAGRAM);
  // The lab teaches the syntax; it does not show the picture.
  workspace.write(
    "labs/lab-1.md",
    `${LAB_MARKDOWN}\n\`\`\`md\n![How you write one](../assets/workflow.png)\n\`\`\`\n`
  );
  await workspace.publisher(["publish", "--apply"]);

  workspace.write("assets/workflow.png", REDRAWN);
  const plan = await workspace.publisher(["publish"]);

  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /0 PDFs to create, 3 to skip/);
});

test("a diagram whose name has a space in it is found, however the link spells it", AWAITS_REPLACE, async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write("assets/five phase workflow.png", DIAGRAM);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![The workflow](../assets/five%20phase%20workflow.png)\n`
  );
  await workspace.publisher(["publish", "--apply"]);

  workspace.write("assets/five phase workflow.png", REDRAWN);
  const plan = await workspace.publisher(["publish"]);

  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /0 to create, 1 to update, 2 to skip/);
});

test("a link that sizes the same diagram twice does not confuse the verdict", AWAITS_REPLACE, async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write("assets/workflow.png", DIAGRAM);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![Wide](../assets/workflow.png?w=800)\n\n` +
      `![Narrow](../assets/workflow.png?w=400)\n`
  );
  await workspace.publisher(["publish", "--apply"]);

  workspace.write("assets/workflow.png", REDRAWN);
  const plan = await workspace.publisher(["publish"]);

  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /0 to create, 1 to update, 2 to skip/);
});

test("a document showing no pictures still hashes to its markdown alone", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);

  await workspace.publisher(["publish", "--apply"]);

  // Load-bearing: counting pictures must not change the hash of a document
  // that shows none, or the first run after this change would report every
  // already-published document as an update.
  const recorded =
    workspace.readManifest().documents["lectures/lecture-1.md"]?.[
      "contentHash"
    ];
  const markdownAlone = createHash("sha256")
    .update(LECTURE_MARKDOWN, "utf8")
    .digest("hex");
  assert.equal(recorded, `sha256:${markdownAlone}`);
});

test("a picture hosted elsewhere leaves the verdict alone", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n![Hosted](https://example.test/workflow.png)\n`
  );

  const applied = await workspace.publisher(["publish", "--apply"]);
  const plan = await workspace.publisher(["publish"]);

  assert.equal(applied.code, 0, applied.stderr);
  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /0 PDFs to create, 3 to skip/);
});
