// A run happens in a course repository: the directory the command line is
// started in is the repository root, and the course's run state is kept there.
//
// Installed, the publisher's own folder is inside node_modules, which the next
// install deletes. A manifest kept beside the publisher would go with it, and
// the next run would create every activity a second time. So these tests start
// the packaged binary from the workspace — the harness sets none of the path
// overrides — and look for what it left behind in the workspace.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  BOTH_DELIVERABLES,
  GRID_TITLE,
  enrol,
  gridDefining,
  makeWorkspace,
  probeSheetsText,
} from "./harness.ts";

test("publishing reads documents from, and records the manifest in, the directory it is started in", async () => {
  const workspace = makeWorkspace();

  const plan = await workspace.publisher(["publish"]);
  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /create/);

  const applied = await workspace.publisher(["publish", "--apply"]);
  assert.equal(applied.code, 0, applied.stderr);
  assert.ok(
    workspace.readManifest().documents["assessment-grid.md"],
    "the manifest is written under the course repository root"
  );
});

test("the Probe Sheets are written under the course repository root", async () => {
  const workspace = gridDefining(
    `${BOTH_DELIVERABLES}\nprobes:\n  C1:\n    - Three or more units of work?\n  C2:\n    - An instruction document?\n  C3:\n    - One command that goes red?`
  );
  workspace.writeCatalog({
    published: [
      { source: "assessment-grid.md", title: GRID_TITLE, section: "Assessment" },
    ],
    deliverableSources: ["assessment-grid.md"],
    probeSources: ["assessment-grid.md"],
  });
  const published = await workspace.publisher(["publish", "--apply"]);
  assert.equal(published.code, 0, published.stderr);
  enrol(workspace, [{ email: "amina@epf.fr", name: "Amina Diallo" }]);

  const result = await workspace.publisher(["probes"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(probeSheetsText(workspace) ?? "", /amina@epf\.fr/);
});

test("PUBLISHER_REPO_ROOT still names the repository, and its run state follows it", async () => {
  const startedIn = makeWorkspace();
  const repository = makeWorkspace();
  repository.writeEnv("MOODLE_COURSE_ID=771\n");

  const result = await startedIn.publisher(["publish", "--apply"], {
    MOODLE_COURSE_ID: undefined,
    PUBLISHER_REPO_ROOT: repository.root,
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Course 771 /);
  assert.ok(repository.readManifest().documents["assessment-grid.md"]);
  assert.equal(existsSync(startedIn.manifestPath), false);
});

test("the per-file overrides still win over the defaults", async () => {
  const workspace = makeWorkspace();
  const manifest = join(workspace.root, "state", "elsewhere.json");
  // The manifest store writes the file, not its directory.
  workspace.write("state/.keep", "");

  const result = await workspace.publisher(["publish", "--apply"], {
    PUBLISHER_MANIFEST: manifest,
  });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(existsSync(manifest), true);
  assert.equal(existsSync(workspace.manifestPath), false);
});

test("the site still has no default", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["publish"], {
    MOODLE_BASE_URL: undefined,
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /MOODLE_BASE_URL is not set/);
});
