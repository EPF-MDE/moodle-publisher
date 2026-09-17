// The shape of the manifest file itself: what a written entry says it is, and
// what happens to an entry written before entries said anything.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  makeWorkspace,
  writeGrid,
  GRID_FRONT_MATTER,
  GRID_MARKDOWN,
} from "./harness.ts";
import type { Workspace } from "./harness.ts";

const MANIFEST_FILE = "moodle-manifest.json";

/**
 * The manifest as an earlier version of the publisher wrote it: no `kind` on
 * its pages. Devoir entries keep theirs, because no version ever wrote one
 * without it.
 */
function stripKinds(workspace: Workspace): void {
  const file = workspace.readManifest();
  const documents: Record<string, Record<string, string>> = {};
  for (const [source, entry] of Object.entries(file.documents)) {
    if (entry["kind"] !== "page") {
      documents[source] = entry;
      continue;
    }
    const { kind: _kind, ...rest } = entry;
    documents[source] = rest;
  }
  workspace.write(
    MANIFEST_FILE,
    `${JSON.stringify({ ...file, documents }, null, 2)}\n`
  );
}

test("a written entry says it is a page, alongside module, section and hash", async () => {
  const workspace = makeWorkspace();

  await workspace.publisher(["publish", "--apply"]);

  const entry = workspace.readManifest().documents["assessment-grid.md"];
  assert.ok(entry, "expected a manifest entry for the grid");
  assert.equal(entry["kind"], "page");
  assert.deepEqual(Object.keys(entry).sort(), [
    "contentHash",
    "kind",
    "moduleId",
    "publishedAt",
    "section",
    "updatedAt",
  ]);
});

test("an entry written before entries had a kind is read as a page and skipped", async () => {
  const workspace = makeWorkspace();
  await workspace.publisher(["publish", "--apply"]);
  stripKinds(workspace);

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /0 to create, 0 to update, 1 to skip/);
  // The grid and its two Devoirs, and nothing made a second time.
  assert.equal(workspace.readCourse().items.length, 3);
});

/**
 * The manifest as a publisher that still configured the gradebook left it: a
 * Grade Item recorded under each Competency's id, beside the pages and Devoirs.
 */
function addGradeItems(workspace: Workspace): void {
  const file = workspace.readManifest();
  const documents: Record<string, Record<string, string>> = {
    ...file.documents,
  };
  for (const [id, itemId] of [
    ["C1", "101"],
    ["C2", "102"],
  ] as const) {
    documents[id] = {
      kind: "grade-item",
      itemId,
      name: `${id} — a Competency`,
      scaleId: "77",
      createdAt: "2026-09-01T10:00:00.000Z",
    };
  }
  workspace.write(
    MANIFEST_FILE,
    `${JSON.stringify({ ...file, documents }, null, 2)}\n`
  );
}

test("a manifest holding Grade Items still reads, and the next write drops them", async () => {
  const workspace = makeWorkspace();
  await workspace.publisher(["publish", "--apply"]);
  const published = workspace.readManifest().documents;
  addGradeItems(workspace);

  // Read, by a plan, and not refused.
  const plan = await workspace.publisher(["publish"]);
  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /0 to create, 0 to update, 1 to skip/);
  assert.ok(workspace.readManifest().documents["C1"], "reading wrote nothing");

  // Written, by the next run that changes something.
  writeGrid(
    workspace,
    GRID_FRONT_MATTER,
    `${GRID_MARKDOWN}\n| Strong | Rare. |\n`
  );
  const applied = await workspace.publisher(["publish", "--apply"]);
  assert.equal(applied.code, 0, applied.stderr);

  const after = workspace.readManifest().documents;
  assert.equal(after["C1"], undefined);
  assert.equal(after["C2"], undefined);
  assert.deepEqual(Object.keys(after).sort(), Object.keys(published).sort());
  assert.equal(workspace.readCourse().items.length, 3);
});

test("updating an entry written before kinds keeps its module and names it a page", async () => {
  const workspace = makeWorkspace();
  await workspace.publisher(["publish", "--apply"]);
  const before = workspace.readManifest().documents["assessment-grid.md"];
  stripKinds(workspace);
  writeGrid(
    workspace,
    GRID_FRONT_MATTER,
    `${GRID_MARKDOWN}\n| Strong | Rare. |\n`
  );

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /0 to create, 1 to update, 0 to skip/);
  const after = workspace.readManifest().documents["assessment-grid.md"];
  assert.ok(before && after);
  // What an update does to the rest of the entry is rerun.test.ts's subject.
  // What matters here is that the entry came back through the update path
  // still attached to its activity, and now says what it is.
  assert.equal(after["kind"], "page");
  assert.equal(after["moduleId"], before["moduleId"]);
  assert.equal(workspace.readCourse().items.length, 3);
});
