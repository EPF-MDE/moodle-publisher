// How a Published Document reads once printed: a footer on every page naming
// the Course, the page and the day it was published, and a print stylesheet
// that keeps code blocks, tables, quotes and pictures readable in one portrait
// layout. Asserted on the HTML handed to the course; nothing here prints.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COURSE_NAME,
  DAY_ONE_ENTRIES,
  LECTURE_MARKDOWN,
  itemNamed,
  makeWorkspace,
  writeDayOneSet,
} from "./harness.ts";

import type { Workspace } from "./harness.ts";

const LECTURE = "Lecture 1 — Framing and decomposing";

/** Late on the 11th in UTC, and already the 12th in Paris. */
const PARIS_MIDNIGHT = { PUBLISHER_NOW: "2026-09-11T22:30:00Z" };

async function printedLecture(
  workspace: Workspace,
  env: Record<string, string | undefined> = PARIS_MIDNIGHT
): Promise<string> {
  const result = await workspace.publisher(["publish", "--apply"], env);
  assert.equal(result.code, 0, result.stderr);
  return itemNamed(workspace, LECTURE)?.body ?? "";
}

/** Everything the document's embedded stylesheets say. */
function stylesheet(html: string): string {
  const [, head = ""] = /<head>([\s\S]*)<\/head>/.exec(html) ?? [];
  return [...head.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map(([, css]) => css)
    .join("\n");
}

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const [, body = ""] = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`, "m").exec(css) ?? [];
  return body;
}

test("every page's footer names the Course, the page and the day it was published in Paris", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);

  const css = stylesheet(await printedLecture(workspace));

  assert.match(css, /@page\s*\{/);
  assert.match(css, new RegExp(`@bottom-left\\s*\\{[^}]*content:\\s*"${COURSE_NAME}"`));
  assert.match(css, /@bottom-center\s*\{[^}]*content:[^;}]*counter\(page\)/);
  assert.match(css, /@bottom-right\s*\{[^}]*content:\s*"Published 12 September 2026"/);
});

test("the footer's Course is the one publisher.json names", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.writeCatalog({ course: "Complex Web Services", published: DAY_ONE_ENTRIES });

  const css = stylesheet(await printedLecture(workspace));

  assert.match(css, /@bottom-left\s*\{[^}]*content:\s*"Complex Web Services"/);
});

test("a Course name is a CSS string that cannot close the stylesheet", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.writeCatalog({
    course: 'Agents "in practice" \\ </style><script>x</script>',
    published: DAY_ONE_ENTRIES,
  });

  const html = await printedLecture(workspace);

  assert.doesNotMatch(html, /<script>/);
  assert.match(
    stylesheet(html),
    /content:\s*"Agents \\"in practice\\" \\\\ \\3c \/style>\\3c script>x\\3c \/script>"/
  );
});

test("without PUBLISHER_NOW, the footer is dated today in Paris", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  const today = (): string =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date());
  const before = today();

  const css = stylesheet(await printedLecture(workspace, { PUBLISHER_NOW: undefined }));

  // Either side of a midnight the run straddled.
  const dated = [before, today()].map((day) => `"Published ${day}"`);
  assert.ok(
    dated.some((footer) => css.includes(footer)),
    `expected one of ${dated.join(", ")} in:\n${css}`
  );
});

test("a PUBLISHER_NOW that is not a date aborts before anything is published", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);

  const result = await workspace.publisher(["publish", "--apply"], {
    PUBLISHER_NOW: "next tuesday",
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /PUBLISHER_NOW is set to "next tuesday", which is not a date/);
  assert.deepEqual(workspace.readCourse().items, []);
});

test("a run handed a date says so before anything else", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);

  const result = await workspace.publisher(["publish"], PARIS_MIDNIGHT);

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    result.stdout,
    /^PUBLISHER_NOW is set: publishing as of 2026-09-11T22:30:00\.000Z, not now\.\n/
  );
});

test("every document prints portrait on A4, whatever its kind", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await printedLecture(workspace);

  for (const { title } of DAY_ONE_ENTRIES) {
    const css = stylesheet(itemNamed(workspace, title)?.body ?? "");
    assert.match(css, /@page\s*\{[^@]*size:\s*A4 portrait/, title);
  }
});

test("the print stylesheet lays out code blocks, tables, quotes and pictures", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);

  const css = stylesheet(await printedLecture(workspace));

  // A long line wraps rather than running off the page.
  assert.match(rule(css, "pre"), /white-space:\s*pre-wrap/);
  assert.match(rule(css, "pre"), /font-family:[^;]*monospace/);
  // A table is ruled, and its header repeats on the pages it runs onto.
  assert.match(rule(css, "table"), /border-collapse:\s*collapse/);
  assert.match(rule(css, "th, td"), /border:/);
  assert.match(rule(css, "thead"), /display:\s*table-header-group/);
  assert.match(rule(css, "tr"), /break-inside:\s*avoid/);
  // A quote stands apart from the prose around it.
  assert.match(rule(css, "blockquote"), /border-left:/);
  // A picture fits the column and is never cut across two pages.
  assert.match(rule(css, "img"), /max-width:\s*100%/);
  assert.match(rule(css, "img"), /break-inside:\s*avoid/);
});

test("a Lecture's slide-shaped headings stay headings, kept with what follows them", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write(
    "lectures/lecture-1.md",
    `${LECTURE_MARKDOWN}\n---\n\n## Sycophancy\n\nAn agent agreeing instead of aligning.\n`
  );

  const html = await printedLecture(workspace);

  assert.match(html, /<h2[^>]*>Sycophancy<\/h2>/);
  assert.match(rule(stylesheet(html), "h1, h2, h3, h4"), /break-after:\s*avoid/);
});
