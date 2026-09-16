// A course repository never has to know about Playwright.
//
// The browser binary lives in a per-machine cache keyed by Chromium revision,
// so a Playwright release that moves the revision leaves every machine without
// the browser the publisher launches. The publisher installs its own, through
// the Playwright it depends on, and a run that finds it missing names that
// command rather than Playwright's. Asserted through the installed binary with
// `--dry-run` and an empty browsers directory: nothing is downloaded and no
// window is opened.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installedPublisher, makeWorkspace } from "./harness.ts";

/** The Chromium revision of the Playwright installed beside the publisher. */
function chromiumRevision(): string {
  // Hoisted into the course repository's node_modules, beside the publisher.
  const browsers = JSON.parse(
    readFileSync(
      join(installedPublisher(), "..", "..", "playwright-core", "browsers.json"),
      "utf8"
    )
  ) as { browsers: { name: string; revision: string }[] };
  const chromium = browsers.browsers.find(({ name }) => name === "chromium");
  assert.ok(chromium, "playwright-core names no chromium revision");
  return chromium.revision;
}

test("install-browser installs Chromium only, at the publisher's own Playwright revision", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["install-browser", "--dry-run"], {
    PLAYWRIGHT_BROWSERS_PATH: undefined,
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`chromium v${chromiumRevision()}\\b`));
  assert.doesNotMatch(result.stdout, /firefox|webkit/i);
});

test("install-browser takes --dry-run and nothing else", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["install-browser", "firefox"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /install-browser takes --dry-run and nothing else/);
  assert.match(result.stderr, /firefox/);
});

test("a missing browser names the publisher's command, not Playwright's", async () => {
  const workspace = makeWorkspace();

  // The one test that lets the real browser driver past its CI refusal. It is
  // safe only because Playwright is pointed at an empty browsers directory:
  // launch is the driver's first step after that refusal, and it fails there,
  // before any window or any Moodle page.
  const browsers = mkdtempSync(join(tmpdir(), "no-browsers-"));
  const result = await workspace.publisher(["publish"], {
    PUBLISHER_DRIVER: undefined,
    CI: undefined,
    PLAYWRIGHT_BROWSERS_PATH: browsers,
    MOODLE_SESSION_STATE: join(workspace.root, "session.json"),
    MOODLE_RUN_DIR: join(workspace.root, "runs"),
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /moodle-publisher install-browser/);
  // Where Playwright looked, which names the revision it wanted.
  assert.ok(result.stderr.includes(browsers), result.stderr);
  assert.doesNotMatch(result.stderr, /npx playwright install/);
});
