// The commands the publisher has, and the one it no longer has.
//
// The Audit is retired: what it read off the live course is now read by eye,
// against the human-review checklist in `docs/`. A command line that still
// answered to `audit` would print a verdict nothing is checking any more, so
// it is refused like any other word the publisher does not know, and the help
// does not offer it.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeWorkspace } from "./harness.ts";

test("audit is not a command, and it touches nothing", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /^Usage:/);
  assert.doesNotMatch(result.stderr, /audit/i);
  assert.deepEqual(workspace.readCourse().items, []);
});

test("the help names every command, and not audit", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["--help"]);

  assert.equal(result.code, 0);
  for (const command of ["install-browser", "install-skills", "check", "publish", "wipe"]) {
    assert.match(result.stderr, new RegExp(`publisher ${command}\\b`), command);
  }
  assert.doesNotMatch(result.stderr, /audit/i);
});
