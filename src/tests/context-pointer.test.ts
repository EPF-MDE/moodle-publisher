// The publisher's glossary and ADRs ship with the package, and a course
// repository reaches them through a context pointer into the installed
// publisher.
//
// Nothing is copied into the course repository, so upgrading the pinned tag is
// the sync. What can go wrong is the pointer: a `CONTEXT-MAP.md` nobody wrote,
// one that never links to the publisher's glossary or its ADRs, or a path into
// `node_modules` that a rename, a typo or a missing install leaves naming
// nothing. `check` requires the map and says so, before an agent goes looking
// for a folder it has no way to find.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  CONTEXT_MAP_MARKDOWN,
  INSTALLED_PUBLISHER,
  installPublisher,
  installedPublisher,
  makeWorkspace,
} from "./harness.ts";

import type { CommandResult, Workspace } from "./harness.ts";

/** The terms the publisher's glossary defines, every one of them. */
const TERMS = [
  "Published Document",
  "Instructor Material",
  "Manifest",
  "Section",
  "Audit",
  "Wipe",
  "Deliverable",
  "Devoir",
  "Submission",
  "Freeze",
  "Extension",
  "Competency",
  "Band",
  "Feedback Letter",
  "Banding Anchors",
];

/** The decisions the publisher keeps, under the numbers they were taken under. */
const ADRS = ["0002", "0003", "0004", "0005", "0007", "0011"];

/** A `CONTEXT-MAP.md` naming the course's own context and the publisher's. */
function contextMap(glossary: string, adrs: string): string {
  return `# Context map

- [Course](./CONTEXT.md): this course, its Students and its Orals.
- [Publisher](./${glossary}): publishing and grading, as the installed publisher defines them.
  Its decisions are in [${adrs}](./${adrs}).
`;
}

/** `check` as a pre-commit hook runs it: nothing about Moodle in the environment. */
function check(workspace: Workspace): Promise<CommandResult> {
  return workspace.publisher(["check"], {
    MOODLE_BASE_URL: undefined,
    MOODLE_COURSE_ID: undefined,
    PUBLISHER_DRIVER: undefined,
    PUBLISHER_FAKE_COURSE: undefined,
    CI: "true",
    MOODLE_SESSION_STATE: join(workspace.root, "session.json"),
  });
}

test("the packed publisher holds its glossary, defining every publishing and grading term", () => {
  const glossary = readFileSync(join(installedPublisher(), "CONTEXT.md"), "utf8");

  for (const term of TERMS) {
    assert.match(glossary, new RegExp(`^\\*\\*${term}\\*\\*:`, "m"), `${term} is defined`);
  }
});

test("the packed publisher holds its ADRs, under their existing numbers", () => {
  const folder = join(installedPublisher(), "docs", "adr");
  const shipped = existsSync(folder) ? readdirSync(folder) : [];

  for (const number of ADRS) {
    assert.ok(
      shipped.some((file) => file.startsWith(`${number}-`) && file.endsWith(".md")),
      `ADR-${number} ships in docs/adr/`
    );
  }
});

test("the glossary says Competencies are declared per course and the Band scale is fixed", () => {
  const glossary = readFileSync(join(installedPublisher(), "CONTEXT.md"), "utf8");

  const entry = (term: string): string =>
    glossary.match(new RegExp(`^\\*\\*${term}\\*\\*:.*$`, "m"))?.[0] ?? "";
  assert.match(entry("Competency"), /declared/);
  assert.match(entry("Competency"), /grid/);
  assert.match(entry("Band"), /every course/);
});

test("check passes on the context map the README shows", async () => {
  const workspace = makeWorkspace();
  installPublisher(workspace);
  workspace.write("CONTEXT-MAP.md", CONTEXT_MAP_MARKDOWN);
  const readme = readFileSync(join(installedPublisher(), "README.md"), "utf8");
  assert.ok(readme.includes(CONTEXT_MAP_MARKDOWN), "the README shows this map");

  const result = await check(workspace);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Check passed/);
});

test("check fails, naming the path, when the pointer names an ADR folder the publisher does not have", async () => {
  const workspace = makeWorkspace();
  installPublisher(workspace);
  workspace.write(
    "CONTEXT-MAP.md",
    contextMap(`${INSTALLED_PUBLISHER}/CONTEXT.md`, `${INSTALLED_PUBLISHER}/docs/adrs/`)
  );

  const result = await check(workspace);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /CONTEXT-MAP\.md/);
  assert.match(result.stderr, /node_modules\/@epf-mde\/moodle-publisher\/docs\/adrs\//);
});

test("check fails, naming the glossary, when the publisher is not installed where the pointer says", async () => {
  const workspace = makeWorkspace();
  workspace.write(
    "CONTEXT-MAP.md",
    contextMap(`${INSTALLED_PUBLISHER}/CONTEXT.md`, `${INSTALLED_PUBLISHER}/docs/adr/`)
  );

  const result = await check(workspace);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /node_modules\/@epf-mde\/moodle-publisher\/CONTEXT\.md/);
});

test("check fails on a course repository with no CONTEXT-MAP.md, giving both links to add", async () => {
  const workspace = makeWorkspace();
  installPublisher(workspace);

  const result = await check(workspace);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /CONTEXT-MAP\.md/);
  assert.match(result.stderr, /required/);
  assert.ok(result.stderr.includes(`(./${INSTALLED_PUBLISHER}/CONTEXT.md)`), result.stderr);
  assert.ok(result.stderr.includes(`(./${INSTALLED_PUBLISHER}/docs/adr/)`), result.stderr);
});

test("check fails, naming the glossary, when the map does not link to it", async () => {
  const workspace = makeWorkspace();
  installPublisher(workspace);
  workspace.write(
    "CONTEXT-MAP.md",
    `# Context map\n\n- [Course](./CONTEXT.md)\n- [Publisher ADRs](./${INSTALLED_PUBLISHER}/docs/adr/)\n`
  );

  const result = await check(workspace);

  assert.equal(result.code, 1);
  assert.ok(result.stderr.includes(`${INSTALLED_PUBLISHER}/CONTEXT.md`), result.stderr);
  assert.ok(!result.stderr.includes(`${INSTALLED_PUBLISHER}/docs/adr/`), result.stderr);
});

test("check fails, naming the ADR folder, when the map does not link to it", async () => {
  const workspace = makeWorkspace();
  installPublisher(workspace);
  workspace.write(
    "CONTEXT-MAP.md",
    `# Context map\n\n- [Course](./CONTEXT.md)\n- [Publisher](./${INSTALLED_PUBLISHER}/CONTEXT.md)\n`
  );

  const result = await check(workspace);

  assert.equal(result.code, 1);
  assert.ok(result.stderr.includes(`${INSTALLED_PUBLISHER}/docs/adr/`), result.stderr);
  assert.ok(!result.stderr.includes(`${INSTALLED_PUBLISHER}/CONTEXT.md`), result.stderr);
});

test("check fails, naming both links, when the map never links into the publisher", async () => {
  const workspace = makeWorkspace();
  installPublisher(workspace);
  workspace.write("CONTEXT-MAP.md", "# Context map\n\n- [Course](./CONTEXT.md)\n");

  const result = await check(workspace);

  assert.equal(result.code, 1);
  assert.ok(result.stderr.includes(`${INSTALLED_PUBLISHER}/CONTEXT.md`), result.stderr);
  assert.ok(result.stderr.includes(`${INSTALLED_PUBLISHER}/docs/adr/`), result.stderr);
});

test("check counts the links however they are written: reference-style, bare, without a slash, with an anchor", async () => {
  const workspace = makeWorkspace();
  installPublisher(workspace);
  workspace.write(
    "CONTEXT-MAP.md",
    `# Context map

- The [publisher's glossary][glossary], and [its decisions](${INSTALLED_PUBLISHER}/docs/adr).

[glossary]: ./${INSTALLED_PUBLISHER}/CONTEXT.md#language
`
  );

  const result = await check(workspace);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Check passed/);
});

test("publish plans a course repository with no CONTEXT-MAP.md exactly as before", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["publish"]);

  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /CONTEXT-MAP/);
});
