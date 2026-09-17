// The table of Published Documents, as rules over whatever a course
// repository's `publisher.json` holds.
//
// Driven through the command line like the rest of the suite, because every
// run reads the file: what is under test is a course repository saying what
// it publishes, and the refusals that keep a mistaken edit out of the course.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { documentsToPublish } from "../packages/catalog/index.ts";
import { SECTION_ORDER } from "../packages/course/index.ts";
import {
  DAY_ONE_ENTRIES,
  makeWorkspace,
  writeDayOneSet,
} from "./harness.ts";

import type { Workspace } from "./harness.ts";

/**
 * A run with the real driver, where no browser may start: `CI` is set, so a
 * run that got past the catalog would stop at the driver saying so. A refusal
 * about `publisher.json` is therefore proof that a real run read it first.
 */
function realRun(workspace: Workspace) {
  return workspace.publisher(["publish", "--apply"], {
    PUBLISHER_DRIVER: undefined,
    CI: "true",
    MOODLE_SESSION_STATE: join(workspace.root, "session.json"),
  });
}

for (const [driver, run] of [
  ["a fake", (workspace: Workspace) => workspace.publisher(["publish", "--apply"])],
  ["a real", realRun],
] as const) {
  test(`a document bound for a section the course page does not have stops ${driver} run`, async () => {
    // A catalog read from a file is untyped by the time it is loaded, and a
    // section nobody named would be created outside the order students read
    // the page in.
    const workspace = makeWorkspace();
    writeDayOneSet(workspace);
    workspace.writeCatalog({
      published: [{ source: "labs/lab-1.md", title: "Lab 1", section: "Labss" }],
    });

    const result = await run(workspace);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /labs\/lab-1\.md/);
    assert.match(result.stderr, /"Labss"/);
    assert.match(result.stderr, new RegExp(SECTION_ORDER.join(", ")));
    assert.deepEqual(workspace.readCourse().items, []);
  });

  test(`a document published to Deliverables stops ${driver} run`, async () => {
    // ADR-0005: what is in the section is decided by the Deliverables the grid
    // defines, never by an entry naming it.
    const workspace = makeWorkspace();
    writeDayOneSet(workspace);
    workspace.writeCatalog({
      published: [
        { source: "labs/lab-1.md", title: "Lab 1", section: "Deliverables" },
      ],
    });

    const result = await run(workspace);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /labs\/lab-1\.md/);
    assert.match(result.stderr, /holds the Devoirs and nothing else/);
    assert.deepEqual(workspace.readCourse().items, []);
  });

  test(`a reveal date nobody can read stops ${driver} run`, async () => {
    const workspace = makeWorkspace();
    writeDayOneSet(workspace);
    workspace.writeCatalog({
      published: [
        {
          source: "labs/lab-1.md",
          title: "Lab 1",
          section: "Labs",
          revealedOn: "11/09/2026",
        },
      ],
    });

    const result = await run(workspace);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /labs\/lab-1\.md/);
    assert.match(result.stderr, /"11\/09\/2026"/);
    assert.deepEqual(workspace.readCourse().items, []);
  });
}

/**
 * A `publisher.json` somebody got wrong, and what the refusal must name. Each
 * spoils a course that has already been published once, so that "nothing is
 * written" is checked against a course and a Manifest that exist rather than
 * against their absence.
 */
const MALFORMED: readonly (readonly [
  what: string,
  spoil: (workspace: Workspace) => void,
  named: RegExp,
])[] = [
  [
    // No fallback: a run that found nothing to read must not publish nothing
    // and call it done, nor publish something it was never told to.
    "no publisher.json",
    (workspace) => workspace.remove("publisher.json"),
    /there is no .*publisher\.json/,
  ],
  [
    "a publisher.json that is not JSON",
    (workspace) => workspace.write("publisher.json", "{ grid: assessment-grid.md"),
    /It is not JSON/,
  ],
  [
    "a publisher.json that is a list",
    (workspace) => workspace.write("publisher.json", "[]"),
    /not a JSON object/,
  ],
  [
    // No default: the Competencies and the Deliverables are read from the grid, and
    // a catalog that forgot to name it must not have one guessed for it.
    "no grid",
    (workspace) => workspace.writeCatalog({ grid: undefined, published: [] }),
    /names no grid/,
  ],
  [
    "a grid that is not a string",
    (workspace) => workspace.writeCatalog({ grid: ["assessment-grid.md"], published: [] }),
    /"grid" that is object, not a path/,
  ],
  [
    // No default: the name is printed at the foot of every page a Student
    // takes away, and a guessed one would be printed there just the same.
    "no course",
    (workspace) => workspace.writeCatalog({ course: undefined, published: [] }),
    /names no course/,
  ],
  [
    "a course that is blank",
    (workspace) => workspace.writeCatalog({ course: "  ", published: [] }),
    /names no course/,
  ],
  [
    "a course that is not a string",
    (workspace) => workspace.writeCatalog({ course: 2026, published: [] }),
    /"course" that is number, not a name/,
  ],
  [
    "no published",
    (workspace) => workspace.writeCatalog({ published: undefined }),
    /has no "published"/,
  ],
  [
    "a published that is not a list",
    (workspace) => workspace.writeCatalog({ published: { source: "labs/lab-1.md" } }),
    /"published" is not a list/,
  ],
  [
    // Read from a course repository, an entry is whatever somebody typed: one
    // missing what every entry carries is refused by name rather than crash
    // the run or publish a document nobody can find.
    "an entry that is not an object",
    (workspace) => workspace.writeCatalog({ published: [null] }),
    /"published" entry 1 is not an object/,
  ],
  [
    "an entry with no source",
    (workspace) =>
      workspace.writeCatalog({
        published: [...DAY_ONE_ENTRIES, { title: "Lab 2", section: "Labs" }],
      }),
    /"published" entry 4 has no "source"/,
  ],
  [
    "an entry with no title",
    (workspace) =>
      workspace.writeCatalog({
        published: [{ source: "labs/lab-1.md", section: "Labs" }],
      }),
    /"labs\/lab-1\.md" has no "title"/,
  ],
  [
    "an entry with no section",
    (workspace) =>
      workspace.writeCatalog({
        published: [{ source: "labs/lab-1.md", title: "Lab 1" }],
      }),
    /"labs\/lab-1\.md" has no "section"/,
  ],
];

for (const [what, spoil, named] of MALFORMED) {
  test(`${what} stops a plan and a publish, naming the file and what is wrong, writing nothing`, async () => {
    // Every command that reads the catalog reads it before anything opens, so
    // each refuses with the same message and leaves everything as it was.
    const workspace = makeWorkspace();
    writeDayOneSet(workspace);
    const published = await workspace.publisher(["publish", "--apply"]);
    assert.equal(published.code, 0, published.stderr);
    const before = writtenState(workspace);

    spoil(workspace);

    for (const args of [["publish", "--apply"], ["publish"]]) {
      const result = await workspace.publisher(args);

      assert.equal(result.code, 1, `${args.join(" ")}: ${result.stdout}`);
      assert.match(result.stderr, /Refusing to start/);
      // The directory by its own name: the temporary root may print behind a
      // symlink the workspace was not created through.
      assert.match(
        result.stderr,
        new RegExp(`${basename(workspace.root)}/publisher\\.json`)
      );
      assert.match(result.stderr, named);
      assert.deepEqual(writtenState(workspace), before);
    }
  });
}

/** What a refused run must leave byte for byte: the course and the Manifest. */
function writtenState(workspace: Workspace): readonly (string | undefined)[] {
  return [workspace.coursePath, workspace.manifestPath].map((path) => (existsSync(path) ? readFileSync(path, "utf8") : undefined));
}

test("two documents sharing a title, once the prefix is derived, stop the run", async () => {
  // A title is how `AlreadyInCourse` recognises a document the manifest has
  // lost, so two documents sharing one would have a later run refuse to
  // publish the second over an activity that is not it. Asked of the published
  // titles rather than of the entries: the prefix is part of what an examiner
  // reads, so a student document titled with it collides with the material.
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write("labs/lab-3-oral--instructor.md", "# Script\n");
  workspace.writeCatalog({
    published: [
      { source: "labs/lab-1.md", title: "Instructor — Lab 1", section: "Labs" },
      { source: "labs/lab-3-oral--instructor.md", title: "Lab 1", section: "Labs" },
    ],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Instructor — Lab 1/);
  assert.match(result.stderr, /labs\/lab-1\.md/);
  assert.match(result.stderr, /labs\/lab-3-oral--instructor\.md/);
  assert.deepEqual(workspace.readCourse().items, []);
});

test("renaming a document is the whole of the change", async () => {
  // The suffix decides, and nothing else does: the same entry, published under
  // two names, publishes visible or hidden accordingly. This is the guarantee
  // that replaced a table entry saying who a document was for.
  const entry = {
    title: "C1 banding anchors",
    section: "Assessment" as const,
  };
  const [visible] = documentsToPublish({
    published: [{ ...entry, source: "c1-assessment-examples.md" }],
    course: "Coding Agents Management 2026",
    grid: "assessment-grid.md",
  });
  const [hidden] = documentsToPublish({
    published: [{ ...entry, source: "c1-assessment-examples--instructor.md" }],
    course: "Coding Agents Management 2026",
    grid: "assessment-grid.md",
  });

  assert.equal(visible?.visibleOnCreate, true);
  assert.equal(visible?.title, "C1 banding anchors");
  assert.equal(hidden?.visibleOnCreate, false);
  assert.equal(hidden?.title, "Instructor — C1 banding anchors");
});
