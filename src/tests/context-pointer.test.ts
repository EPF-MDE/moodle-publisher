// The publisher's glossary and ADRs ship with the package, and a course
// repository reaches them through a context pointer into the installed
// publisher.
//
// Nothing is copied into the course repository, so upgrading the pinned tag is
// the sync. What can go wrong is the pointer: a path into `node_modules` that
// a rename, a typo or a missing install leaves naming nothing. `check` is what
// says so, before an agent follows it into a folder that is not there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  PUBLISHER_PACKAGE,
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
  "Probe Sheet",
  "Probes",
  "Enrolment",
  "Grade Item",
];

/** The decisions the publisher keeps, under the numbers they were taken under. */
const ADRS = ["0002", "0003", "0004", "0005", "0007"];

/** Where the course repository's `node_modules` holds the publisher. */
const INSTALLED = `node_modules/${PUBLISHER_PACKAGE}`;

/** The publisher installed into the course repository, as `npm install` leaves it. */
function install(workspace: Workspace): void {
  const target = join(workspace.root, INSTALLED);
  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(installedPublisher(), target, "dir");
}

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

test("check passes when the context pointer resolves into the installed publisher", async () => {
  const workspace = makeWorkspace();
  install(workspace);
  workspace.write("CONTEXT.md", "# The course\n");
  workspace.write(
    "CONTEXT-MAP.md",
    contextMap(`${INSTALLED}/CONTEXT.md`, `${INSTALLED}/docs/adr/`)
  );

  const result = await check(workspace);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Check passed/);
});

test("check fails, naming the path, when the pointer names an ADR folder the publisher does not have", async () => {
  const workspace = makeWorkspace();
  install(workspace);
  workspace.write(
    "CONTEXT-MAP.md",
    contextMap(`${INSTALLED}/CONTEXT.md`, `${INSTALLED}/docs/adrs/`)
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
    contextMap(`${INSTALLED}/CONTEXT.md`, `${INSTALLED}/docs/adr/`)
  );

  const result = await check(workspace);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /node_modules\/@epf-mde\/moodle-publisher\/CONTEXT\.md/);
});
