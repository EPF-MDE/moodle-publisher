// The run directory is what a failed run against the live course is diagnosed
// from, so what it keeps is worth pinning down. These drive the recorder with
// a stand-in page: no browser is involved.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createRunRecorder } from "../packages/course/recorder.ts";

function fakePage(url: string, html: string) {
  return {
    url: () => url,
    content: async () => html,
    screenshot: async () => undefined,
    goto(next: string) {
      url = next;
    },
  };
}

function newRunDir(): string {
  return mkdtempSync(join(tmpdir(), "publisher-run-"));
}

test("the run log names the page each action was taken on", async () => {
  const dir = newRunDir();
  const page = fakePage(
    "https://moodle.example/course/view.php?id=7",
    "<html></html>"
  );
  const recorder = createRunRecorder(
    dir,
    page,
    "course 7 at https://moodle.example"
  );

  const after = await recorder.capture("create section Lectures");
  page.goto("https://moodle.example/course/changenumsections.php?courseid=7");
  await after();

  const log = readFileSync(join(dir, "run.txt"), "utf8");
  assert.match(log, /course 7 at https:\/\/moodle\.example/);
  assert.match(log, /create section Lectures/);
  assert.match(
    log,
    /before https:\/\/moodle\.example\/course\/view\.php\?id=7/
  );
  assert.match(
    log,
    /after {2}https:\/\/moodle\.example\/course\/changenumsections\.php\?courseid=7/
  );
});

test("the after capture keeps the page's html, not only a picture of it", async () => {
  const dir = newRunDir();
  const notice =
    "<html><body>Ce cours n'est actuellement pas disponible</body></html>";
  const recorder = createRunRecorder(
    dir,
    fakePage("https://moodle.example/x", notice),
    "h"
  );

  const after = await recorder.capture("create section Lectures");
  await after();

  const files = readdirSync(dir);
  assert.ok(
    files.includes("01-create-section-lectures-after.html"),
    files.join(", ")
  );
  assert.equal(
    readFileSync(join(dir, "01-create-section-lectures-after.html"), "utf8"),
    notice
  );
});

test("an abort noted against an action lands in the run log", async () => {
  const dir = newRunDir();
  const recorder = createRunRecorder(
    dir,
    fakePage("https://moodle.example/x", ""),
    "h"
  );

  const after = await recorder.capture("create section Lectures");
  recorder.note("  ABORTED the page carries no course identity");
  await after();

  assert.match(
    readFileSync(join(dir, "run.txt"), "utf8"),
    /ABORTED the page carries no course identity/
  );
});

test("the after capture is owed even when the page can no longer be read", async () => {
  const dir = newRunDir();
  // Healthy when the action starts, gone by the time the capture is owed —
  // a browser that died mid-mutation, which is the case worth surviving.
  let closed = false;
  const dying = {
    url: () => "https://moodle.example/x",
    content: async () => {
      if (closed) throw new Error("target closed");
      return "<html></html>";
    },
    screenshot: async () => {
      if (closed) throw new Error("target closed");
      return undefined;
    },
  };
  const recorder = createRunRecorder(dir, dying, "h");

  const after = await recorder.capture("create section Lectures");
  closed = true;
  // The error the instructor needs to read is the one from the run, not one
  // about failing to record it.
  await assert.doesNotReject(after());

  const log = readFileSync(join(dir, "run.txt"), "utf8");
  assert.match(log, /screenshot failed/);
  assert.match(log, /html failed/);
});
