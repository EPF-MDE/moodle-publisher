// A Manifest that still records pages, as the publisher before PDFs left it.
//
// Pages are not migrated: publishing refuses such a Manifest and says how to
// clean it up, and the Wipe — one of the two ways out — still runs against it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

import { COURSE_ID, GRID_SOURCE, makeWorkspace, writeDayOneSet } from "./harness.ts";
import type { Workspace } from "./harness.ts";

type Documents = Record<string, Record<string, string>>;

/** Replaces the Manifest's entries, keeping the rest of the file. */
function writeDocuments(workspace: Workspace, documents: Documents): void {
  const file = workspace.readManifest();
  writeFileSync(
    workspace.manifestPath,
    `${JSON.stringify({ ...file, documents }, null, 2)}\n`,
    "utf8"
  );
}

/**
 * The day-one set published, then turned back into what the publisher before
 * PDFs left: every document a page, in the course and in the Manifest, beside
 * the Devoirs. Returns the sources recorded as pages.
 */
async function publishedAsPages(): Promise<{
  workspace: Workspace;
  pages: readonly string[];
}> {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  const published = await workspace.publisher(["publish", "--apply"]);
  assert.equal(published.code, 0, published.stderr);

  const documents: Documents = {};
  const pages: string[] = [];
  for (const [source, entry] of Object.entries(
    workspace.readManifest().documents
  )) {
    if (entry["kind"] !== "file-resource") {
      documents[source] = entry;
      continue;
    }
    const { title: _title, ...rest } = entry;
    documents[source] = { ...rest, kind: "page" };
    pages.push(source);
  }
  writeDocuments(workspace, documents);

  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.map(({ fileName: _fileName, ...item }) => item),
  });
  return { workspace, pages };
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
    const { workspace, pages } = await publishedAsPages();
    const before = state(workspace);

    const result = await workspace.publisher(args);

    assert.equal(result.code, 1, result.stdout);
    assert.equal(pages.length, 3);
    for (const source of pages) {
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
  const { workspace, pages } = await publishedAsPages();
  // The clean-up: the pages deleted in Moodle, and their entries with them.
  const course = workspace.readCourse();
  const devoirIds = Object.keys(course.devoirs ?? {}).sort();
  workspace.writeCourse({
    ...course,
    items: course.items.filter((item) => devoirIds.includes(item.moduleId)),
  });
  const devoirEntries = Object.fromEntries(
    Object.entries(workspace.readManifest().documents).filter(
      ([, entry]) => entry["kind"] === "devoir"
    )
  );
  writeDocuments(workspace, devoirEntries);

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /3 PDFs to create, 0 to replace, 0 to skip/);
  const after = workspace.readCourse();
  // The Devoirs are the same activities, and no second one was made.
  assert.deepEqual(Object.keys(after.devoirs ?? {}).sort(), devoirIds);
  assert.equal(after.items.length, devoirIds.length + pages.length);
  const documents = workspace.readManifest().documents;
  for (const source of pages) {
    assert.equal(documents[source]?.["kind"], "file-resource");
  }
  for (const [key, entry] of Object.entries(devoirEntries)) {
    assert.equal(documents[key]?.["moduleId"], entry["moduleId"]);
  }
  // Their descriptions are the one thing rewritten: the brief they link to is
  // the new PDF, not the page that was deleted.
  const grid = documents[GRID_SOURCE]?.["moduleId"];
  for (const devoir of after.items.filter((item) =>
    devoirIds.includes(item.moduleId)
  )) {
    assert.match(
      devoir.body,
      new RegExp(`href="[^"]*/mod/resource/view\\.php\\?id=${grid}"`)
    );
  }
});

test("the Wipe still empties a course whose Manifest records pages", async () => {
  const { workspace } = await publishedAsPages();

  const result = await workspace.publisher([
    "wipe",
    "--course",
    COURSE_ID,
    "--apply",
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(workspace.readCourse().items, []);
  assert.deepEqual(workspace.readManifest().documents, {});
});
