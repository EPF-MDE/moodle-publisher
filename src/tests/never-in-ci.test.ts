// Nothing publishes to a Course unattended.
//
// The browser driver is the only way this program reaches a real Moodle, and it
// refuses to start where `CI` is set. Asserted through the installed binary, as
// a course repository would run it, with no fake driver in the environment:
// the refusal comes before a browser is launched, so this test never opens one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { makeWorkspace } from "./harness.ts";

test("the browser driver refuses to run when CI is set", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["publish"], {
    PUBLISHER_DRIVER: undefined,
    CI: "true",
    MOODLE_SESSION_STATE: join(workspace.root, "session.json"),
    MOODLE_RUN_DIR: join(workspace.root, "runs"),
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /never runs in CI/);
});
