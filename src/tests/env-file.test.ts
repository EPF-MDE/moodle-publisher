// The .env file: a convenience for not retyping the course id, and never an
// authority over the shell. What matters here is the precedence — a run
// launched with an explicit course id must go to that course, whatever a file
// left in the working copy says.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { makeWorkspace } from "./harness.ts";

test("the course comes from the env file when the shell does not set it", async () => {
  const workspace = makeWorkspace();
  workspace.writeEnv(
    [
      "MOODLE_BASE_URL=https://moodle.from-file.test",
      "MOODLE_COURSE_ID=771",
    ].join("\n")
  );

  const result = await workspace.publisher(["publish"], {
    MOODLE_BASE_URL: undefined,
    MOODLE_COURSE_ID: undefined,
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    result.stdout,
    /Course 771 at https:\/\/moodle\.from-file\.test/
  );
});

test("the shell wins over the env file", async () => {
  const workspace = makeWorkspace();
  workspace.writeEnv("MOODLE_COURSE_ID=771");

  // The harness exports 4242, as an instructor would for a one-off run.
  const result = await workspace.publisher(["publish"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Course 4242 /);
  assert.doesNotMatch(result.stdout, /771/);
});

test("an env file may be absent, and then the shell alone configures the run", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["publish"], {
    PUBLISHER_ENV_FILE: undefined,
    // Reaching for the publisher's own .env is what the default does; the
    // repository has none, and the run must simply proceed on the shell.
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Course 4242 /);
});

test("an env file named and not found aborts, naming the path", async () => {
  const workspace = makeWorkspace();
  const missing = join(workspace.root, "nope.env");

  const result = await workspace.publisher(["publish"], {
    PUBLISHER_ENV_FILE: missing,
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /nope\.env/);
  assert.match(result.stderr, /No such file/);
});

test("comments, quotes and blank assignments do not leak into values", async () => {
  const workspace = makeWorkspace();
  workspace.writeEnv(
    [
      "# The scratch course, not the real one.",
      "",
      "export MOODLE_COURSE_ID=771 # scratch",
      'MOODLE_BASE_URL="https://moodle.from-file.test"',
      "MOODLE_RUN_DIR=",
      "this line is a note, not an assignment",
    ].join("\n")
  );

  const result = await workspace.publisher(["publish"], {
    MOODLE_BASE_URL: undefined,
    MOODLE_COURSE_ID: undefined,
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    result.stdout,
    /Course 771 at https:\/\/moodle\.from-file\.test/
  );
});

test("an empty assignment in the file does not satisfy a required variable", async () => {
  const workspace = makeWorkspace();
  workspace.writeEnv("MOODLE_COURSE_ID=");

  const result = await workspace.publisher(["publish"], {
    MOODLE_COURSE_ID: undefined,
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /MOODLE_COURSE_ID/);
  assert.match(result.stderr, /no default course/i);
});
