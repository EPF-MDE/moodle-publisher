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
 * The manifest as an earlier version of the publisher wrote it: its documents
 * recorded as pages with no `kind`, and no title. Devoir entries keep theirs,
 * because no version ever wrote one without it.
 */
function asKindlessPages(workspace: Workspace): void {
  const file = workspace.readManifest();
  const documents: Record<string, Record<string, string>> = {};
  for (const [source, entry] of Object.entries(file.documents)) {
    if (entry["kind"] !== "file-resource") {
      documents[source] = entry;
      continue;
    }
    const { kind: _kind, title: _title, ...rest } = entry;
    documents[source] = rest;
  }
  workspace.write(
    MANIFEST_FILE,
    `${JSON.stringify({ ...file, documents }, null, 2)}\n`
  );
}

test("a written entry says it is a file resource, alongside module, section, title and hash", async () => {
  const workspace = makeWorkspace();

  await workspace.publisher(["publish", "--apply"]);

  const entry = workspace.readManifest().documents["assessment-grid.md"];
  assert.ok(entry, "expected a manifest entry for the grid");
  assert.equal(entry["kind"], "file-resource");
  assert.equal(entry["title"], "Assessment Grid — how you are graded");
  assert.deepEqual(Object.keys(entry).sort(), [
    "contentHash",
    "kind",
    "moduleId",
    "publishedAt",
    "section",
    "title",
    "updatedAt",
  ]);
});

test("an entry written before entries had a kind is read as a page, and refused", async () => {
  const workspace = makeWorkspace();
  await workspace.publisher(["publish", "--apply"]);
  asKindlessPages(workspace);

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 1, second.stdout);
  assert.match(second.stderr, /as Moodle pages[^]*"assessment-grid\.md"/);
  // The grid and its two Devoirs, and nothing made a second time.
  assert.equal(workspace.readCourse().items.length, 3);
});

/**
 * The manifest as a publisher that still configured the gradebook left it: a
 * Grade Item recorded under each Competency's id, beside the documents and
 * Devoirs.
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
  assert.match(plan.stdout, /0 PDFs to create, 0 to replace, 1 to skip/);
  assert.ok(workspace.readManifest().documents["C1"], "reading wrote nothing");

  // Written, by the next run that changes something: a Deliverable retitled.
  writeGrid(
    workspace,
    GRID_FRONT_MATTER.replace(
      "Your repository — C1 and C2",
      "Your repository — C1 and C2, as a URL"
    ),
    GRID_MARKDOWN
  );
  const applied = await workspace.publisher(["publish", "--apply"]);
  assert.equal(applied.code, 0, applied.stderr);

  const after = workspace.readManifest().documents;
  assert.equal(after["C1"], undefined);
  assert.equal(after["C2"], undefined);
  assert.deepEqual(Object.keys(after).sort(), Object.keys(published).sort());
  assert.equal(workspace.readCourse().items.length, 3);
});

