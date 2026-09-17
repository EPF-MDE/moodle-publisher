// Every Published Document publishes into its Section as a PDF: a Moodle file
// resource holding one print-ready HTML document, which the fake course keeps
// as the resource's body.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

import { renderDocument } from "../packages/documents/index.ts";

import {
  DAY_ONE_ENTRIES,
  INSTRUCTOR_ENTRIES,
  LECTURE_MARKDOWN,
  itemNamed,
  makeWorkspace,
  writeDayOneSet,
  writeInstructorSet,
} from "./harness.ts";

const LECTURE = "Lecture 1 — Framing and decomposing";
const LAB = "Lab 1 — Frame and decompose your own work";

test("a run creates one file resource per listed document, named with its title and its source's basename", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const documents = workspace
    .readCourse()
    .items.filter((item) => item.section !== "Deliverables")
    .map(({ name, section, fileName }) => [name, section, fileName]);
  assert.deepEqual(documents, [
    ["Assessment Grid — how you are graded", "Assessment", "assessment-grid.pdf"],
    [LECTURE, "Lectures", "lecture-1.pdf"],
    [LAB, "Labs", "lab-1.pdf"],
    ["Instructor — Oral interview script", "Labs", "lab-3-oral--instructor.pdf"],
    ["Instructor — C1 banding anchors", "Assessment", "c1-assessment-examples--instructor.pdf"],
  ]);
});

test("Instructor Material and reveal-dated documents are created hidden, the rest visible", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);
  workspace.writeCatalog({
    published: [
      ...DAY_ONE_ENTRIES.map((entry) =>
        entry.title === LECTURE ? { ...entry, revealedOn: "2026-09-11" } : entry
      ),
      ...INSTRUCTOR_ENTRIES,
    ],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(itemNamed(workspace, "Assessment Grid — how you are graded")?.visible, true);
  assert.equal(itemNamed(workspace, LECTURE)?.visible, false);
  assert.equal(itemNamed(workspace, LAB)?.visible, true);
  assert.equal(itemNamed(workspace, "Instructor — Oral interview script")?.visible, false);
  assert.equal(itemNamed(workspace, "Instructor — C1 banding anchors")?.visible, false);
});

/** What follows the `<body>` tag of a printed document. */
function afterBodyTag(body: string): string {
  const [, rest = ""] = body.split(/<body[^>]*>/);
  return rest.trimStart();
}

/** Every `h1` in a printed document, tag and all. */
function levelOneHeadings(body: string): string[] {
  return body.match(/<h1[\s>][\s\S]*?<\/h1>/g) ?? [];
}

test("the HTML handed to the course opens with the title and holds the rendered body", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);

  await workspace.publisher(["publish", "--apply"]);

  const body = itemNamed(workspace, LECTURE)?.body ?? "";
  assert.match(body, /^<!doctype html>/i);
  assert.match(body, /<title>Lecture 1 — Framing and decomposing<\/title>/);
  // The title is the first thing a reader meets on the first page, and the
  // only h1 there: the document's own leading heading is dropped.
  assert.match(
    afterBodyTag(body),
    /^<h1 class="document-title">Lecture 1 — Framing and decomposing<\/h1>\s*<p>Framing is saying/
  );
  assert.equal(levelOneHeadings(body).length, 1);
  assert.match(body, /<li>A brief an agent can act on names the file, the seam and the check.<\/li>/);
});

// The table's title is the one title: the document's own leading heading
// would print it a second time, and not always spelled the same.
test("a document opening with its own heading prints the table title alone", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write(
    "lectures/lecture-1.md",
    "# Lecture 1: framing, and decomposing\n\nFraming comes first.\n"
  );

  await workspace.publisher(["publish", "--apply"]);

  const body = itemNamed(workspace, LECTURE)?.body ?? "";
  assert.deepEqual(levelOneHeadings(body), [
    '<h1 class="document-title">Lecture 1 — Framing and decomposing</h1>',
  ]);
  assert.doesNotMatch(body, /framing, and decomposing/);
  assert.match(
    afterBodyTag(body),
    /^<h1 class="document-title">[^<]*<\/h1>\s*<p>Framing comes first\.<\/p>/
  );
});

// A comment is not something a reader sees, so it does not stop the heading
// after it from being the first thing on the page.
test("a document opening with a comment and then its heading prints the table title alone", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write(
    "lectures/lecture-1.md",
    "<!-- Revised for 2026 -->\n# Lecture 1\n\nFraming comes first.\n"
  );

  await workspace.publisher(["publish", "--apply"]);

  const body = itemNamed(workspace, LECTURE)?.body ?? "";
  assert.deepEqual(levelOneHeadings(body), [
    '<h1 class="document-title">Lecture 1 — Framing and decomposing</h1>',
  ]);
  assert.match(body, /<p>Framing comes first\.<\/p>/);
});

test("a document with no leading heading prints its body whole under the table title", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write(
    "lectures/lecture-1.md",
    "Framing comes first.\n\n## Why\n\n# Not a title\n"
  );

  await workspace.publisher(["publish", "--apply"]);

  const body = itemNamed(workspace, LECTURE)?.body ?? "";
  assert.match(
    afterBodyTag(body),
    /^<h1 class="document-title">Lecture 1 — Framing and decomposing<\/h1>\s*<p>Framing comes first\.<\/p>\s*<h2>Why<\/h2>\s*<h1>Not a title<\/h1>/
  );
});

test("a document opening with a lower heading keeps it", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write("lectures/lecture-1.md", "## Before we start\n\nFraming.\n");

  await workspace.publisher(["publish", "--apply"]);

  const body = itemNamed(workspace, LECTURE)?.body ?? "";
  assert.match(
    afterBodyTag(body),
    /^<h1 class="document-title">[^<]*<\/h1>\s*<h2>Before we start<\/h2>/
  );
});

test("a later heading in a document that opens with one is kept", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write(
    "lectures/lecture-1.md",
    "# Lecture 1\n\nFraming.\n\n# Part two\n\nDecomposing.\n"
  );

  await workspace.publisher(["publish", "--apply"]);

  const body = itemNamed(workspace, LECTURE)?.body ?? "";
  assert.deepEqual(levelOneHeadings(body), [
    '<h1 class="document-title">Lecture 1 — Framing and decomposing</h1>',
    "<h1>Part two</h1>",
  ]);
});

// PDFs printed before the leading heading was dropped still show the title
// twice, and their markdown has not changed: the print layout is in the hash so
// that the next run reprints them, once.
test("a PDF printed with the old layout is replaced once, and then left alone", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const targets = new Map(
    DAY_ONE_ENTRIES.map((entry) => [
      entry.source,
      { title: entry.title, section: entry.section },
    ])
  );
  // What the manifest held before the layout was hashed: the document's own.
  const manifest = workspace.readManifest();
  for (const [source, entry] of Object.entries(manifest.documents)) {
    if (entry["kind"] !== "file-resource") continue;
    entry["contentHash"] = renderDocument(workspace.root, source, (link) =>
      targets.get(link.target)
    ).contentHash;
  }
  writeFileSync(workspace.manifestPath, JSON.stringify(manifest, null, 2));

  const first = await workspace.publisher(["publish", "--apply"]);
  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(first.code, 0, first.stderr);
  assert.match(first.stdout, /0 PDFs to create, 3 to replace, 0 to skip/);
  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /0 PDFs to create, 0 to replace, 3 to skip/);
});

// The layout only reprints what it changes: a document that never opened with
// a heading prints as it always did, and keeps the hash it always had.
test("a document with no leading heading keeps its document hash", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write("labs/lab-1.md", "Clone the repository.\n");

  await workspace.publisher(["publish", "--apply"]);

  assert.equal(
    workspace.readManifest().documents["labs/lab-1.md"]?.["contentHash"],
    renderDocument(workspace.root, "labs/lab-1.md", () => undefined).contentHash
  );
});

test("a title is escaped as text in the printed document", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(
    workspace,
    DAY_ONE_ENTRIES.map((entry) =>
      entry.title === LECTURE ? { ...entry, title: "Lecture 1 — <agents> & you" } : entry
    )
  );

  await workspace.publisher(["publish", "--apply"]);

  const body = itemNamed(workspace, "Lecture 1 — <agents> & you")?.body ?? "";
  assert.match(body, /<h1[^>]*>Lecture 1 — &lt;agents&gt; &amp; you<\/h1>/);
});

test("a link to another Published Document is in its text form in the printed document", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  workspace.write(
    "labs/lab-1.md",
    "# Lab 1\n\nRead [the lecture](../lectures/lecture-1.md) first.\n"
  );

  await workspace.publisher(["publish", "--apply"]);

  const body = itemNamed(workspace, LAB)?.body ?? "";
  assert.match(
    body,
    /Read "Lecture 1 — Framing and decomposing" \(document available in the Lectures section\) first\./
  );
  assert.doesNotMatch(body, /lecture-1\.md/);
});

test("the Manifest holds a file resource entry per document", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);

  await workspace.publisher(["publish", "--apply"]);

  const { documents } = workspace.readManifest();
  const script = itemNamed(workspace, "Instructor — Oral interview script");
  const entry = documents["labs/lab-3-oral--instructor.md"] ?? {};
  assert.deepEqual(
    {
      kind: entry["kind"],
      moduleId: entry["moduleId"],
      section: entry["section"],
      title: entry["title"],
    },
    {
      kind: "file-resource",
      moduleId: script?.moduleId,
      section: "Labs",
      title: "Instructor — Oral interview script",
    }
  );
  assert.match(String(entry["contentHash"]), /^sha256:[0-9a-f]{64}$/);
  assert.ok(entry["publishedAt"]);
  assert.ok(entry["updatedAt"]);
  const files = Object.entries(documents).filter(
    ([, recorded]) => recorded["kind"] === "file-resource"
  );
  assert.equal(files.length, 5);
});

// Two repositories alike but for one picture's bytes: the hash is the only
// thing a later run can tell them apart by, so the picture has to be in it.
test("a document's recorded hash covers the pictures it shows", async () => {
  const hashes = [];
  for (const drawing of ["first drawing", "second drawing"]) {
    const workspace = makeWorkspace();
    writeDayOneSet(workspace);
    workspace.write("assets/workflow.png", drawing);
    workspace.write(
      "lectures/lecture-1.md",
      `${LECTURE_MARKDOWN}\n![The workflow](../assets/workflow.png)\n`
    );
    const result = await workspace.publisher(["publish", "--apply"]);
    assert.equal(result.code, 0, result.stderr);
    hashes.push(workspace.readManifest().documents["lectures/lecture-1.md"]?.["contentHash"]);
  }

  assert.match(String(hashes[0]), /^sha256:/);
  assert.notEqual(hashes[0], hashes[1]);
});

test("the plan lists the PDFs a run would create", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);

  const result = await workspace.publisher(["publish"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    result.stdout,
    /create\s+Lecture 1 — Framing and decomposing\n\s+section: Lectures\s+source: lectures\/lecture-1\.md\s+pdf: lecture-1\.pdf/
  );
  assert.match(result.stdout, /5 PDFs to create, 0 to replace, 0 to skip, 0 to hide\./);
  assert.deepEqual(workspace.readCourse().items, []);
});

test("a re-run with nothing changed uploads nothing, and the plan says so", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const before = workspace.readCourse();
  const manifest = workspace.readManifest();

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /skip\s+Lecture 1 — Framing and decomposing\n\s+section: Lectures\s+source: lectures\/lecture-1\.md\n/);
  assert.match(result.stdout, /0 PDFs to create, 0 to replace, 3 to skip, 0 to hide\./);
  assert.doesNotMatch(result.stdout, /replaced|created {2}Lecture/);
  assert.deepEqual(workspace.readCourse(), before);
  assert.deepEqual(workspace.readManifest(), manifest);
});

test("a changed markdown replaces the file under the same module id", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const before = itemNamed(workspace, LECTURE);

  workspace.write("lectures/lecture-1.md", `${LECTURE_MARKDOWN}\nA new line.\n`);
  const plan = await workspace.publisher(["publish"]);
  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(plan.code, 0, plan.stderr);
  assert.match(
    plan.stdout,
    /replace\s+Lecture 1 — Framing and decomposing\n\s+section: Lectures\s+source: lectures\/lecture-1\.md\s+pdf: lecture-1\.pdf/
  );
  assert.match(plan.stdout, /0 PDFs to create, 1 to replace, 2 to skip, 0 to hide\./);
  assert.equal(result.code, 0, result.stderr);
  assert.match(
    result.stdout,
    new RegExp(`replaced ${LECTURE} as lecture-1\\.pdf \\(module ${before?.moduleId}\\)`)
  );
  const after = itemNamed(workspace, LECTURE);
  assert.equal(after?.moduleId, before?.moduleId);
  assert.equal(after?.fileName, "lecture-1.pdf");
  assert.match(after?.body ?? "", /^<!doctype html>/i);
  assert.match(after?.body ?? "", /A new line\./);
});

/** The day-one set with the lecture held back until its reveal date. */
function writeRevealDatedLecture(workspace: ReturnType<typeof makeWorkspace>): void {
  writeDayOneSet(
    workspace,
    DAY_ONE_ENTRIES.map((entry) =>
      entry.title === LECTURE ? { ...entry, revealedOn: "2026-09-11" } : entry
    )
  );
}

test("a replace leaves a PDF created hidden hidden", async () => {
  const workspace = makeWorkspace();
  writeRevealDatedLecture(workspace);
  await workspace.publisher(["publish", "--apply"]);

  workspace.write("lectures/lecture-1.md", `${LECTURE_MARKDOWN}\nA new line.\n`);
  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const lecture = itemNamed(workspace, LECTURE);
  assert.equal(lecture?.visible, false);
  assert.match(lecture?.body ?? "", /A new line\./);
});

test("a replace leaves a PDF the Instructor revealed by hand revealed", async () => {
  const workspace = makeWorkspace();
  writeRevealDatedLecture(workspace);
  await workspace.publisher(["publish", "--apply"]);
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.map((item) =>
      item.name === LECTURE ? { ...item, visible: true } : item
    ),
  });

  workspace.write("lectures/lecture-1.md", `${LECTURE_MARKDOWN}\nA new line.\n`);
  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const lecture = itemNamed(workspace, LECTURE);
  assert.equal(lecture?.visible, true);
  assert.match(lecture?.body ?? "", /A new line\./);
});

// The footer a PDF prints carries the run's date, so two runs on different
// days render different HTML from the same markdown. That is
// not a change: "changed" is read off the markdown, never off the render.
test("a run on another day replaces nothing", async () => {
  const workspace = makeWorkspace();
  writeDayOneSet(workspace);
  await workspace.publisher(["publish", "--apply"], {
    PUBLISHER_NOW: "2026-09-01T09:00:00+02:00",
  });
  const before = workspace.readCourse();

  const result = await workspace.publisher(["publish", "--apply"], {
    PUBLISHER_NOW: "2026-10-15T09:00:00+02:00",
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /0 PDFs to create, 0 to replace, 3 to skip/);
  assert.deepEqual(workspace.readCourse(), before);
});

test("publishing creates no page", async () => {
  const workspace = makeWorkspace();
  writeInstructorSet(workspace);

  await workspace.publisher(["publish", "--apply"]);

  const course = workspace.readCourse();
  const devoirs = new Set(Object.keys(course.devoirs ?? {}));
  for (const item of course.items) {
    if (devoirs.has(item.moduleId)) continue;
    assert.ok(item.fileName?.endsWith(".pdf"), `${item.name} is not a file resource`);
  }
});
