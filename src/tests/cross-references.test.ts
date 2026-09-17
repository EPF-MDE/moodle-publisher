// Links from one document of the repository to another.
//
// A link to another Published Document is not a link in the published page: it
// is text naming the target and the Section to find it in, so no document needs
// another's module id to publish. The one link that stops the run is a
// student-facing document pointing at examiner-only material.
//
// The rules key on who each end of a link is for — which is the `--instructor`
// suffix and nothing else — so the same link is a refusal from a lab brief and
// ordinary text from the oral script.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ANCHORS_MARKDOWN,
  DAY_ONE_ENTRIES,
  GRID_FRONT_MATTER,
  GRID_MARKDOWN,
  INTERVIEW_MARKDOWN,
  ORAL_SCRIPT_SOURCE,
  itemNamed,
  makeWorkspace,
  writeGrid,
} from "./harness.ts";

import type { Workspace } from "./harness.ts";

const GRID = "Assessment Grid — how you are graded";
const LAB = "Lab 1 — Frame and decompose your own work";
/** What an examiner reads: the entry's plain title, under the derived prefix. */
const SCRIPT = "Instructor — Oral interview script";
const SCRIPT_ENTRY = {
  source: ORAL_SCRIPT_SOURCE,
  title: "Oral interview script",
  section: "Labs",
} as const;

/** What a link to the document published as `title`, in `section`, reads as. */
function named(title: string, section: string): string {
  return `"${title}" (document available in the ${section} section)`;
}

const GRID_TEXT = named(GRID, "Assessment");

/** The body of the activity published under `title`. */
function bodyOf(workspace: Workspace, title: string): string {
  return itemNamed(workspace, title)?.body ?? "";
}

/**
 * A link in `html` to anything but the web or a heading, or `undefined` when
 * there is none. Quote-agnostic, because a single-quoted href the rewrite
 * skipped is exactly what this is here to catch.
 */
function localLinkIn(html: string): string | undefined {
  return /<a\b[^>]*href=['"](?!https?:|#)[^'"]*/i.exec(html)?.[0];
}

/**
 * A lab brief that links wherever the test needs it to. Student-facing, in the
 * day-one set, so a link out of it is one a student reads.
 */
function labLinking(...links: readonly string[]): string {
  return `# Lab 1 — Frame and decompose your own work

You take one piece of your own backlog and cut it into agent-sized briefs.

${links.map((link) => `Read [the other document](${link}) first.`).join("\n\n")}
`;
}

/** The same, for a document published to examiners rather than to students. */
function scriptLinking(...links: readonly string[]): string {
  return `${INTERVIEW_MARKDOWN}
${links.map((link) => `See [the other document](${link}).`).join("\n\n")}
`;
}

/** The day-one set, with the lab brief replaced by one that links. */
function writeLinkingLab(workspace: Workspace, markdown: string): void {
  workspace.write("lectures/lecture-1.md", "# Lecture 1\n\nFraming.\n");
  workspace.write("labs/lab-1.md", markdown);
  workspace.writeCatalog({ published: DAY_ONE_ENTRIES });
}

test("a link to a listed document publishes as its title and Section, not as a link", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("../assessment-grid.md"));

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const body = bodyOf(workspace, LAB);
  assert.ok(body.includes(`Read ${GRID_TEXT} first.`), body);
  // The link's own text is dropped, and nothing is left to click.
  assert.doesNotMatch(body, /the other document/);
  assert.equal(localLinkIn(body), undefined);
});

test("a link's fragment does not change what it reads as", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("../assessment-grid.md#bands"));

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const body = bodyOf(workspace, LAB);
  assert.ok(body.includes(`Read ${GRID_TEXT} first.`), body);
  assert.doesNotMatch(body, /#bands/);
});

// Spelled with the document's own path, a link to a heading in the same page
// is a link to a Published Document like any other: it reads as the document's
// own title. An in-page anchor is written `#heading`, and stays a link.
test("a link to a heading in the same document, by its own path, reads as that document", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("lab-1.md#appendix"));

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const body = bodyOf(workspace, LAB);
  assert.ok(body.includes(`Read ${named(LAB, "Labs")} first.`), body);
  assert.equal(localLinkIn(body), undefined);
  assert.doesNotMatch(body, /#appendix/);
});

for (const code of [false, true]) {
  test(`a link whose text is its own path${code ? " in a code span" : ""} publishes under the target's title`, async () => {
    const workspace = makeWorkspace();
    const text = code ? "`../assessment-grid.md`" : "../assessment-grid.md";
    writeLinkingLab(
      workspace,
      `# Lab 1\n\nRead [${text}](../assessment-grid.md) first.\n`
    );

    const result = await workspace.publisher(["publish", "--apply"]);

    assert.equal(result.code, 0, result.stderr);
    const body = bodyOf(workspace, LAB);
    assert.ok(body.includes(`Read ${GRID_TEXT} first.`), body);
    assert.doesNotMatch(body, /assessment-grid\.md/);
    assert.doesNotMatch(body, /<code>/);
  });
}

test("a link to examiner-only material reads under its Instructor title", async () => {
  const workspace = makeWorkspace();
  workspace.write("lectures/lecture-1.md", "# Lecture 1\n\nFraming.\n");
  workspace.write("labs/lab-1.md", "# Lab 1\n\nYour own backlog.\n");
  workspace.write(ORAL_SCRIPT_SOURCE, INTERVIEW_MARKDOWN);
  workspace.write(
    "assessment-grid--instructor.md",
    "# Notes\n\nSee [the script](labs/lab-3-oral--instructor.md).\n"
  );
  workspace.writeCatalog({
    published: [
      ...DAY_ONE_ENTRIES,
      SCRIPT_ENTRY,
      {
        source: "assessment-grid--instructor.md",
        title: "Grid notes",
        section: "Assessment",
      },
    ],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const body = bodyOf(workspace, "Instructor — Grid notes");
  assert.ok(body.includes(`See ${named(SCRIPT, "Labs")}.`), body);
});

test("an examiner-only document may link to student-facing material, as text", async () => {
  const workspace = makeWorkspace();
  workspace.write("lectures/lecture-1.md", "# Lecture 1\n\nFraming.\n");
  workspace.write("labs/lab-1.md", "# Lab 1\n\nYour own backlog.\n");
  workspace.write(ORAL_SCRIPT_SOURCE, scriptLinking("../assessment-grid.md"));
  workspace.writeCatalog({ published: [...DAY_ONE_ENTRIES, SCRIPT_ENTRY] });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const body = bodyOf(workspace, SCRIPT);
  assert.ok(body.includes(`See ${GRID_TEXT}.`), body);
  assert.equal(localLinkIn(body), undefined);
  assert.doesNotMatch(result.stdout, /Warning: /);
});

test("a link to a document no table lists publishes as its link text alone", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("../notes/scratch.md"));
  workspace.write("notes/scratch.md", "# Scratch\n\nNot course material.\n");

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const body = bodyOf(workspace, LAB);
  assert.match(body, /Read the other document first\./);
  assert.doesNotMatch(body, /scratch|document available/);
  assert.equal(localLinkIn(body), undefined);
});

test("a link climbing out of the repository publishes as its link text alone", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("../../elsewhere/notes.md#top"));

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const body = bodyOf(workspace, LAB);
  assert.match(body, /Read the other document first\./);
  assert.equal(localLinkIn(body), undefined);
});

// Link text is kept as markup, so an emphasised phrase stays emphasised.
test("an unlisted link's text keeps its formatting", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(
    workspace,
    "# Lab 1\n\nRead [the *scratch* notes](../notes/scratch.md) first.\n"
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    bodyOf(workspace, LAB),
    /Read the <em>scratch<\/em> notes first\./
  );
});

// The regression test for the leak this whole check exists for. A guard that
// has never been seen to fire is not a guard.
test("a student-facing document linking to examiner-only material stops the run", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("./lab-3-oral--instructor.md"));
  workspace.writeCatalog({
    published: [...DAY_ONE_ENTRIES, SCRIPT_ENTRY],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /labs\/lab-1\.md/);
  assert.match(result.stderr, /"\.\/lab-3-oral--instructor\.md"/);
  assert.match(result.stderr, /examiner-only/);
  assert.equal(workspace.readCourse().items.length, 0);
});

test("the plan reports a refused link before anything is applied", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("./lab-3-oral--instructor.md"));
  workspace.writeCatalog({ published: [...DAY_ONE_ENTRIES, SCRIPT_ENTRY] });

  const result = await workspace.publisher(["publish"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /examiner-only/);
});

// The same link, refused rather than rewritten: the quote style decides nothing
// about whether the guard fires.
test("a single-quoted raw-HTML link to examiner-only material stops the run", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(
    workspace,
    "# Lab 1\n\nRead <a href='./lab-3-oral--instructor.md'>the script</a> first.\n"
  );
  workspace.writeCatalog({ published: [...DAY_ONE_ENTRIES, SCRIPT_ENTRY] });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /examiner-only/);
  assert.equal(workspace.readCourse().items.length, 0);
});

test("an examiner-only document may link to another, and the run does not warn", async () => {
  const workspace = makeWorkspace();
  workspace.write("lectures/lecture-1.md", "# Lecture 1\n\nFraming.\n");
  workspace.write("labs/lab-1.md", "# Lab 1\n\nYour own backlog.\n");
  const anchors = ["c1", "c2", "c3", "c4", "c5"].map((name) => ({
    source: `${name}-assessment-examples--instructor.md`,
    title: `${name.toUpperCase()} banding anchors`,
    section: "Assessment" as const,
  }));
  workspace.write(
    ORAL_SCRIPT_SOURCE,
    scriptLinking(...anchors.map((anchor) => `../${anchor.source}`))
  );
  for (const anchor of anchors)
    workspace.write(anchor.source, ANCHORS_MARKDOWN);
  workspace.writeCatalog({
    published: [...DAY_ONE_ENTRIES, SCRIPT_ENTRY, ...anchors],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  for (const anchor of anchors) {
    assert.ok(
      bodyOf(workspace, SCRIPT).includes(
        named(`Instructor — ${anchor.title}`, "Assessment")
      )
    );
  }
  // Every examiner-only activity is hidden, and a link that is only text
  // leads nowhere a reader could be refused, so there is nothing to say.
  assert.doesNotMatch(result.stdout, /Warning: /);
});

test("a link to a document that ships hidden publishes like any other, without a warning", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(
    workspace,
    labLinking("../autonomy/autonomy-2-c3-exercise-brief.md")
  );
  workspace.write(
    "autonomy/autonomy-2-c3-exercise-brief.md",
    "# C3 Exercise\n\nThe suite passes. Note that.\n"
  );
  const BRIEF = "C3 Exercise — the sales pipeline bug";
  workspace.writeCatalog({
    published: [
      ...DAY_ONE_ENTRIES,
      {
        source: "autonomy/autonomy-2-c3-exercise-brief.md",
        title: BRIEF,
        section: "Autonomy",
        revealedOn: "2026-09-11",
      },
    ],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Warning: /);
  assert.ok(bodyOf(workspace, LAB).includes(named(BRIEF, "Autonomy")));
});

test("in-page anchors and web links stay links", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(
    workspace,
    `# Lab 1 — Frame and decompose your own work

Jump to [the appendix](#appendix), and read [the crash course](https://www.aihero.dev/).

## Appendix
`
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const body = bodyOf(workspace, LAB);
  assert.match(body, /<a href="#appendix">the appendix<\/a>/);
  assert.match(
    body,
    /<a href="https:\/\/www\.aihero\.dev\/">the crash course<\/a>/
  );
});

// Two documents that link to each other and are both new: neither needs the
// other's module id, so there is no second pass to wait for.
test("two new documents linking to each other publish in one pass", async () => {
  const workspace = makeWorkspace();
  writeGrid(
    workspace,
    GRID_FRONT_MATTER,
    `${GRID_MARKDOWN}\nThe brief is [here](labs/lab-1.md).\n`
  );
  writeLinkingLab(workspace, labLinking("../assessment-grid.md"));

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  // One write per document: nothing is written twice to fill in a module id.
  assert.equal(result.stdout.match(/^updated /gm), null);
  assert.ok(bodyOf(workspace, GRID).includes(named(LAB, "Labs")));
  assert.ok(bodyOf(workspace, LAB).includes(GRID_TEXT));
});

// The title and Section are not in the markdown, so nothing about the linking
// document changes when the table renames its target — and the PDF would keep
// the old text for good if the hash could not see it.
test("renaming a linked document republishes the documents that link to it", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("../assessment-grid.md"));
  await workspace.publisher(["publish", "--apply"]);
  const RENAMED = "Assessment Grid — the bands in full";
  workspace.writeCatalog({
    published: DAY_ONE_ENTRIES.map((entry) =>
      entry.source === "assessment-grid.md"
        ? { ...entry, title: RENAMED }
        : entry
    ),
  });

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  const body = bodyOf(workspace, LAB);
  assert.ok(body.includes(named(RENAMED, "Assessment")), body);
});

test("a title with markup characters in it is published as text", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("../resources/bloat.md"));
  workspace.write("resources/bloat.md", "# Bloat\n\nCut it.\n");
  workspace.writeCatalog({
    published: [
      ...DAY_ONE_ENTRIES,
      {
        source: "resources/bloat.md",
        title: "Killing <bloat> & friends",
        section: "Resources",
      },
    ],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const body = bodyOf(workspace, LAB);
  assert.ok(
    body.includes(
      `"Killing &lt;bloat&gt; &amp; friends" (document available in the Resources section)`
    ),
    body
  );
});

test("a relative path quoted in a code span is text, and is left alone", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(
    workspace,
    "# Lab 1\n\nFull protocol: see `./lab-3-oral--instructor.md`, beside this brief.\n"
  );
  workspace.writeCatalog({ published: [...DAY_ONE_ENTRIES, SCRIPT_ENTRY] });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    bodyOf(workspace, LAB),
    /<code>\.\/lab-3-oral--instructor\.md<\/code>/
  );
});

// Authors write links as raw HTML when markdown will not do, in whichever
// quotes come to hand. The reading half and the writing half have to agree on
// both, or a link ships as a dead relative path with nothing said.
test("a raw-HTML link written in single quotes becomes text too", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(
    workspace,
    `# Lab 1\n\nRead <a class="x" href='../assessment-grid.md'>the grid</a> first.\n`
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const body = bodyOf(workspace, LAB);
  assert.ok(body.includes(`Read ${GRID_TEXT} first.`), body);
  assert.equal(localLinkIn(body), undefined);
});

// The reading half sees `../résumé.md` as the document spells it; the renderer
// percent-encodes it into the attribute. Both spellings must land on the same
// document.
test("a link to a document whose name needs escaping becomes text too", async () => {
  const workspace = makeWorkspace();
  const SUMMARY = "Résumé du cours";
  const NOTES = "Notes de cours";
  workspace.write("lectures/lecture-1.md", "# Lecture 1\n\nFraming.\n");
  workspace.write(
    "labs/lab-1.md",
    labLinking("../résumé.md", "../notes%20de%20cours.md")
  );
  workspace.write("résumé.md", "# Résumé\n\nLe cours en bref.\n");
  workspace.write("notes de cours.md", "# Notes\n\nPrises en cours.\n");
  workspace.writeCatalog({
    published: [
      ...DAY_ONE_ENTRIES,
      { source: "résumé.md", title: SUMMARY, section: "Resources" },
      { source: "notes de cours.md", title: NOTES, section: "Resources" },
    ],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const body = bodyOf(workspace, LAB);
  for (const title of [SUMMARY, NOTES]) {
    assert.ok(body.includes(named(title, "Resources")), body);
  }
  assert.equal(localLinkIn(body), undefined);
});

// An `href` on anything that is not an `<a>` was never read as a
// cross-reference, so it must not be rewritten either.
test("an href on an element that is not a link is left alone", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(
    workspace,
    `# Lab 1\n\n<link rel="alternate" href="../assessment-grid.md">\n\nNothing above is a link a student can click.\n`
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    bodyOf(workspace, LAB),
    /<link rel="alternate" href="\.\.\/assessment-grid\.md">/
  );
});

// An anchor an author never closed is the one shape the reading half accepts
// and the writing half cannot place. It fails as itself, before anything is
// written, rather than shipping as a relative path.
test("an anchor that is never closed stops the run before anything is written", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(
    workspace,
    `# Lab 1

Read <a href="../assessment-grid.md">the grid first.

Then read <a href="../lectures/lecture-1.md">the lecture</a>.
`
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /assessment-grid\.md/);
  assert.doesNotMatch(result.stderr, /lecture-1\.md/);
  assert.equal(workspace.readCourse().items.length, 0);
});
