// Checks the gradebook import's selectors against the page Moodle actually
// serves, offline and in a real browser.
//
// The markup is a fixture cut from a captured run rather than a live course:
// this screen is behind SSO, and the selectors are the whole of what broke on
// the evening of 9 September. A fixture makes the check a second long and
// runnable by anyone, and the thing it checks is the real page's bytes.
//
//     node scripts/check-grade-import-selectors.ts
//
// Green means every control the import drives is findable where the driver
// looks for it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright";

import { required } from "../src/packages/course/lib/atto-upload.ts";
import { SELECTORS } from "../src/packages/course/lib/selectors.ts";

const FIXTURE = join(
  import.meta.dirname,
  "../src/tests/fixtures/grade-import-file-picker.html"
);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(readFileSync(FIXTURE, "utf8"));

const failures: string[] = [];

async function check(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    process.stdout.write(`  ok    ${name}\n`);
  } catch (error) {
    failures.push(name);
    process.stdout.write(
      `  FAIL  ${name}\n        ${error instanceof Error ? error.message : String(error)}\n`
    );
  }
}

process.stdout.write("Grade import selectors, against a captured page:\n");

// The control the failed run could not find. `required` is the driver's own
// helper, so this goes red on exactly what the driver goes red on.
await check('the "Choose a file" button is found', async () => {
  const found = await required(
    page,
    SELECTORS.gradeImportChooseFile,
    "checking the grade import",
    1000
  );
  // Found is not enough: what the driver does next is click it.
  if (!(await found.isEnabled())) throw new Error("found, but not clickable");
});

// The guard that says the upload has landed. Moodle serves the container it
// matches from the start, holding the "drop files here" message, so the
// container alone is never evidence of an upload — which is why the driver
// waits for the uploaded file's own name inside it. This pins both halves: the
// container is there before anything is chosen, and the name is not.
await check(
  "a chosen file is recognised by its name, not by its container",
  async () => {
    const container = page.locator(SELECTORS.gradeImportChosenFile);
    if ((await container.count()) === 0) {
      throw new Error(
        `"${SELECTORS.gradeImportChosenFile}" matches nothing on the served form, ` +
          `so the driver is waiting on markup this page does not have`
      );
    }
    // What the driver actually waits for, on a form with no file in it.
    const named = container.filter({ hasText: "probe-sheets.csv" });
    if ((await named.count()) > 0) {
      throw new Error(
        `the form reports "probe-sheets.csv" before any file was chosen, so ` +
          `waiting for it proves nothing`
      );
    }
  }
);

await browser.close();

if (failures.length > 0) {
  process.stdout.write(`\n${failures.length} selector(s) not found.\n`);
  process.exit(1);
}
process.stdout.write("\nAll grade import selectors found.\n");
