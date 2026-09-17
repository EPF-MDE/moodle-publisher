// Drives the two file resource operations against the live course, through
// the browser driver itself, and leaves the result there for a human to look
// at.
//
// The suite runs them against the fake course only, so this is the one way to
// run them against Moodle. It creates one hidden resource in the Resources
// section, replaces its file under a new file name and a new name, and reads
// the course back after each step. What it cannot check is what a Student
// sees; it prints what to check by hand instead.
//
//     npm run check:file-resource
//
// Point it at a scratch course (MOODLE_COURSE_ID), never at a course Students
// are enrolled in: it writes, and it does not clean up after itself.
import { join } from "node:path";

import { readConfig } from "../src/config.ts";
import { createBrowserDriver } from "../src/packages/course/browser.ts";

/** A self-contained, print-ready document: styles inline, a background to print. */
function document(title: string, line: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: sans-serif; margin: 2cm; }
  h1 { background: #dde8f5; padding: 0.5em; }
</style></head>
<body><h1>${title}</h1><p>${line}</p></body></html>`;
}

const config = readConfig();
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const name = `check-${stamp} file resource`;
const renamed = `${name}, renamed`;

const course = await createBrowserDriver({
  baseUrl: config.baseUrl,
  courseId: config.courseId,
  sessionStatePath: config.sessionStatePath,
  runDir: join(config.runsRoot, `check-file-resource-${stamp}`),
});

let failed = false;
try {
  const { moduleId } = await course.createFileResource({
    name,
    section: "Resources",
    visible: false,
    fileName: `check-${stamp}-first.pdf`,
    html: document(name, "First version: created hidden."),
  });
  process.stdout.write(`created module ${moduleId}, hidden\n`);

  await course.replaceFile({
    moduleId,
    name: renamed,
    fileName: `check-${stamp}-second.pdf`,
    html: document(renamed, "Second version: the file was replaced."),
  });

  const after = (await course.snapshot()).items.find(
    (item) => item.moduleId === moduleId
  );
  if (after === undefined) {
    throw new Error(`module ${moduleId} is not in the course after the replace.`);
  }
  if (after.name !== renamed) {
    throw new Error(`module ${moduleId} is called "${after.name}" after the replace.`);
  }
  if (after.visible) {
    throw new Error(`module ${moduleId} is visible after the replace.`);
  }
  const url = new URL(`/mod/resource/view.php?id=${moduleId}`, config.baseUrl);
  process.stdout.write(
    `\nOK: module ${moduleId} kept its id, took its new name and stayed hidden through the replace.\n\n` +
      `Now check by hand:\n` +
      `  1. As yourself, open ${url} — the PDF opens in the browser and reads\n` +
      `     "Second version", under the title "${renamed}", shaded (backgrounds printed).\n` +
      `  2. The resource's files (edit settings) hold check-${stamp}-second.pdf alone.\n` +
      `  3. As a Student (or "Log in as"), the same URL is refused, and the\n` +
      `     resource is not on the course page.\n` +
      `  4. Delete "${renamed}" from the course when done.\n`
  );
} catch (error) {
  failed = true;
  process.stderr.write(
    `\nFAILED: ${error instanceof Error ? error.message : String(error)}\n` +
      `Look in ${config.runsRoot} for the run's screenshots, and delete anything ` +
      `named "${name}" or "${renamed}" from the course.\n`
  );
} finally {
  await course.close();
}
process.exitCode = failed ? 1 : 0;
