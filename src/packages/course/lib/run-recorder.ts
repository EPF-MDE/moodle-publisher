// Before/after captures for every mutating action, into one timestamped
// directory per run. An audit trail the instructor can look at, rather than a
// log they have to trust.
//
// A screenshot shows what a page looked like; it does not say which page it
// was, and it cannot be searched for the markup a selector missed. A failed
// run against a live course is diagnosed from what it left behind, so each
// capture also records the URL in `run.txt` and keeps the `after` page's HTML
// next to its screenshot.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The part of a Playwright page this module needs. Narrow on purpose: the
 * recorder is driven by a fake in its tests, and a wider type would make that
 * fake a mock of a browser.
 */
interface Recordable {
  screenshot(options: { path: string; fullPage: boolean }): Promise<unknown>;
  content(): Promise<string>;
  url(): string;
}

export interface RunRecorder {
  /** Captures `<n>-<label>-before.png` and returns the matching `after` capture. */
  capture(label: string): Promise<() => Promise<void>>;
  /** Appends a line to `run.txt` — an abort message, typically. */
  note(line: string): void;
  readonly dir: string;
}

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function createRunRecorder(
  dir: string,
  page: Recordable,
  header: string
): RunRecorder {
  mkdirSync(dir, { recursive: true });
  const log = join(dir, "run.txt");
  writeFileSync(log, header.endsWith("\n") ? header : `${header}\n`, "utf8");
  let step = 0;

  function note(line: string): void {
    appendFileSync(log, `${line}\n`, "utf8");
  }

  return {
    dir,
    note,
    async capture(label: string) {
      step += 1;
      const stem = `${String(step).padStart(2, "0")}-${slug(label)}`;
      note(`\n[${stem}] ${label}`);
      note(`  before ${page.url()}`);
      await page.screenshot({
        path: join(dir, `${stem}-before.png`),
        fullPage: true,
      });
      return async () => {
        // Owed whatever happened, so every step of it tolerates failure: a
        // recorder that threw here would replace the error the instructor
        // needs to read with one about recording it.
        note(`  after  ${page.url()}`);
        try {
          await page.screenshot({
            path: join(dir, `${stem}-after.png`),
            fullPage: true,
          });
        } catch {
          note("  after  screenshot failed");
        }
        // The HTML is what a missed selector is diagnosed from, and a Moodle
        // interstitial — a "course unavailable" notice, a confirmation page —
        // is recognised in the markup long before it is recognised in a
        // screenshot of it.
        try {
          writeFileSync(
            join(dir, `${stem}-after.html`),
            await page.content(),
            "utf8"
          );
        } catch {
          note("  after  html failed");
        }
      };
    },
  };
}
