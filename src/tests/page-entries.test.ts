// A Manifest that still records pages, as the publisher before PDFs left it.
//
// Pages are not migrated: publishing refuses such a Manifest and says how to
// clean it up, and the Wipe — one of the two ways out — still runs against it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { makeWorkspace, writeDayOneSet } from "./harness.ts";
import type { Workspace } from "./harness.ts";

const MANIFEST_FILE = "moodle-manifest.json";

const DOCUMENTS = [
  "assessment-grid.md",
  "labs/lab-1.md",
  "lectures/lecture-1.md",
] as const;

/**
 * The day-one set published, then turned back into what the publisher before
 * PDFs left: every document a page, in the course and in the Manifest, beside
 * the Devoirs.
 */
async function publishedAsPages(): Promise<Workspace> {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  const published = await workspace.publisher(["publish", "--apply"]);
  assert.equal(published.code, 0, published.stderr);

  const file = workspace.readManifest();
  const documents: Record<string, Record<string, string>> = {};
  for (const [source, entry] of Object.entries(file.documents)) {
    if (entry["kind"] !== "file-resource") {
      documents[source] = entry;
      continue;
    }
    const { title: _title, ...rest } = entry;
    documents[source] = { ...rest, kind: "page" };
  }
  workspace.write(
    MANIFEST_FILE,
    `${JSON.stringify({ ...file, documents }, null, 2)}\n`
  );

  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.map(({ fileName: _fileName, ...item }) => item),
  });
  return workspace;
}

/** Both files a refused run must leave exactly as they were. */
function state(workspace: Workspace): string {
  return (
    readFileSync(workspace.manifestPath, "utf8") +
    readFileSync(workspace.coursePath, "utf8")
  );
}

for (const args of [["publish"], ["publish", "--apply"]]) {
  test(`${args.join(" ")} refuses a Manifest recording pages, naming each and both clean-ups`, async () => {
    const workspace = await publishedAsPages();
    const before = state(workspace);

    const result = await workspace.publisher(args);

    assert.equal(result.code, 1, result.stdout);
    for (const source of DOCUMENTS) {
      assert.ok(
        result.stderr.includes(`"${source}"`),
        `expected ${source} named in:\n${result.stderr}`
      );
    }
    assert.match(result.stderr, /delete .*pages in Moodle/i);
    assert.match(result.stderr, /keep.*Devoir entries/i);
    assert.match(result.stderr, /wipe/i);
    // Refused before planning: no plan printed, nothing written.
    assert.doesNotMatch(result.stdout, /Plan/);
    assert.equal(state(workspace), before);
  });
}

test("with the pages cleaned up and the Devoirs kept, every document publishes as a new PDF", async () => {
  const workspace = await publishedAsPages();
  // The clean-up: the pages deleted in Moodle, and their entries with them.
  const course = workspace.readCourse();
  const devoirIds = Object.keys(course.devoirs ?? {}).sort();
  workspace.writeCourse({
    ...course,
    items: course.items.filter((item) => devoirIds.includes(item.moduleId)),
  });
  const file = workspace.readManifest();
  const devoirEntries = Object.fromEntries(
    Object.entries(file.documents).filter(
      ([, entry]) => entry["kind"] === "devoir"
    )
  );
  workspace.write(
    MANIFEST_FILE,
    `${JSON.stringify({ ...file, documents: devoirEntries }, null, 2)}\n`
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /3 PDFs to create, 0 to replace, 0 to skip/);
  const after = workspace.readCourse();
  // The Devoirs are the same activities, and no second one was made.
  assert.deepEqual(Object.keys(after.devoirs ?? {}).sort(), devoirIds);
  assert.equal(after.items.length, devoirIds.length + DOCUMENTS.length);
  const documents = workspace.readManifest().documents;
  for (const source of DOCUMENTS) {
    assert.equal(documents[source]?.["kind"], "file-resource");
  }
  for (const [key, entry] of Object.entries(devoirEntries)) {
    assert.equal(documents[key]?.["moduleId"], entry["moduleId"]);
  }
});

test("the Wipe still empties a course whose Manifest records pages", async () => {
  const workspace = await publishedAsPages();

  const result = await workspace.publisher([
    "wipe",
    "--course",
    "4242",
    "--apply",
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(workspace.readCourse().items, []);
  assert.deepEqual(workspace.readManifest().documents, {});
});
