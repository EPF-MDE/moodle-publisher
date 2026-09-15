// Links from one document of the repository to another.
//
// A link that resolves takes a student to the activity its target was published
// as. A link that would strand them — or worse, hand them the answer key —
// stops the run before anything is written.
//
// The rules key on who each end of a link is for — which is the `--instructor`
// suffix and nothing else — so the same link is a refusal from a lab brief and
// an ordinary rewrite from the oral script.
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

const BASE_URL = "https://moodle.example.test";

const GRID = "Assessment Grid — how you are graded";
/** What an examiner reads: the entry's plain title, under the derived prefix. */
const SCRIPT = "Instructor — Oral interview script";
const SCRIPT_ENTRY = {
  source: ORAL_SCRIPT_SOURCE,
  title: "Oral interview script",
  section: "Labs",
} as const;

/** Where the course serves the activity published under `title`. */
function urlOf(workspace: Workspace, title: string): string {
  const item = itemNamed(workspace, title);
  assert.ok(item, `no activity called "${title}"`);
  return `${BASE_URL}/mod/page/view.php?id=${item.moduleId}`;
}

/** The body of the activity published under `title`. */
function bodyOf(workspace: Workspace, title: string): string {
  return itemNamed(workspace, title)?.body ?? "";
}

/**
 * A link in `html` still pointing at a repository path, or `undefined` when
 * every one of them became a URL.
 *
 * Quote-agnostic on purpose. This is the assertion that would catch a
 * single-quoted href the rewrite skipped, so it is the last place that should
 * assume the quotes are double — the bug it exists to catch is exactly that
 * assumption made one layer down.
 */
function deadLinkIn(html: string): string | undefined {
  // Neither an absolute URL nor an in-page anchor: those are left as written on
  // purpose and Moodle follows them fine.
  return /href=['"](?!https?:|#)[^'"]*\.md/i.exec(html)?.[0];
}

/**
 * A lab brief that links wherever the test needs it to. Student-facing, in the
 * day-one set, so a link out of it is a link a student can click.
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

/**
 * The day-one set, with the lab brief replaced by one that links.
 *
 * The grid and the lecture come along unchanged: a link has two ends, and the
 * documents these tests link *to* have to be in the course for the rewrite to
 * have anything to say.
 */
function writeLinkingLab(workspace: Workspace, markdown: string): void {
  workspace.write("lectures/lecture-1.md", "# Lecture 1\n\nFraming.\n");
  workspace.write("labs/lab-1.md", markdown);
  workspace.writeCatalog({ published: DAY_ONE_ENTRIES });
}

test("a link between two published documents becomes the target's Moodle URL", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("../assessment-grid.md"));

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    bodyOf(workspace, "Lab 1 — Frame and decompose your own work"),
    new RegExp(`href="${urlOf(workspace, GRID).replace(/[?]/g, "\\?")}"`)
  );
});

// What a reader sees, as opposed to where the link goes. Most of this
// repository writes a cross-reference by spelling its own path twice — once as
// the href and once as the text — which publishes a working link labelled with
// a repository path nobody can act on, and labelled differently from the title
// the same document was published under.

/** A lab brief whose links name themselves, in the two spellings authors use. */
function labNaming(link: string, { code }: { code: boolean }): string {
  const text = code ? `\`${link}\`` : link;
  return `# Lab 1 — Frame and decompose your own work

You take one piece of your own backlog and cut it into agent-sized briefs.

Read [${text}](${link}) first.
`;
}

for (const code of [false, true]) {
  test(`a link whose text is its own path${code ? " in a code span" : ""} is published under the target's title`, async () => {
    const workspace = makeWorkspace();
    writeLinkingLab(workspace, labNaming("../assessment-grid.md", { code }));

    const result = await workspace.publisher(["publish", "--apply"]);

    assert.equal(result.code, 0, result.stderr);
    const body = bodyOf(workspace, "Lab 1 — Frame and decompose your own work");
    assert.match(
      body,
      new RegExp(
        `href="${urlOf(workspace, GRID).replace(/[?]/g, "\\?")}"[^>]*>${GRID}</a>`
      )
    );
    // Not merely accompanied by the title: the path is gone from the text, and
    // so is the code formatting around it — a title is prose, not code.
    assert.doesNotMatch(body, /assessment-grid\.md/);
    assert.doesNotMatch(body, /<code>[^<]*<\/code><\/a>/);
  });
}

test("a link whose text is prose is published byte-for-byte as written", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("../assessment-grid.md"));

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const body = bodyOf(workspace, "Lab 1 — Frame and decompose your own work");
  assert.match(body, />the other document<\/a>/);
  assert.doesNotMatch(body, new RegExp(`>${GRID}</a>`));
});

// A path is prose when it sits in a sentence, even a sentence that ends in one.
test("a sentence that merely ends in a path is not a self-naming link", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(
    workspace,
    `# Lab 1 — Frame and decompose your own work

Read [the grid, ../assessment-grid.md](../assessment-grid.md) first.
`
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    bodyOf(workspace, "Lab 1 — Frame and decompose your own work"),
    />the grid, \.\.\/assessment-grid\.md<\/a>/
  );
});

test("an examiner-only document's self-naming links are relabelled too", async () => {
  const workspace = makeWorkspace();
  workspace.write("lectures/lecture-1.md", "# Lecture 1\n\nFraming.\n");
  workspace.write("labs/lab-1.md", "# Lab 1\n\nYour own backlog.\n");
  workspace.write(
    ORAL_SCRIPT_SOURCE,
    `${INTERVIEW_MARKDOWN}\nSee [\`../assessment-grid.md\`](../assessment-grid.md).\n`
  );
  workspace.writeCatalog({ published: [...DAY_ONE_ENTRIES, SCRIPT_ENTRY] });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(bodyOf(workspace, SCRIPT), new RegExp(`>${GRID}</a>`));
});

// The second pass exists because a document and the document it links to can
// both be made in the same run. A link's text must not depend on which pass
// answered it: both go through the one rewrite.
test("a link resolved on the second pass is relabelled like any other", async () => {
  const workspace = makeWorkspace();
  // The grid points back at the lab, which does not exist in the course when
  // the grid is written, so this link can only be answered after both pages
  // are made.
  writeGrid(
    workspace,
    GRID_FRONT_MATTER,
    `${GRID_MARKDOWN}\nThe brief is [\`labs/lab-1.md\`](labs/lab-1.md).\n`
  );
  writeLinkingLab(workspace, labLinking("../assessment-grid.md"));

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /relinked /);
  const body = bodyOf(workspace, GRID);
  assert.match(body, />Lab 1 — Frame and decompose your own work<\/a>/);
  assert.doesNotMatch(body, /labs\/lab-1\.md/);
});

// The title is not in the markdown, so nothing about the linking document
// changes when the table renames its target — and the page would keep the old
// name for good if the hash could not see it.
test("renaming a linked document republishes the documents that link to it", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(
    workspace,
    labNaming("../assessment-grid.md", { code: true })
  );
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
  assert.match(
    bodyOf(workspace, "Lab 1 — Frame and decompose your own work"),
    new RegExp(`>${RENAMED}</a>`)
  );
});

test("a link to a document no table names stops the run", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("../notes/scratch.md"));
  workspace.write("notes/scratch.md", "# Scratch\n\nNot course material.\n");

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /notes\/scratch\.md/);
  assert.match(result.stderr, /the table does not name/);
});

test("a link climbing out of the repository is a link no table can name", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("../../elsewhere/notes.md"));

  const result = await workspace.publisher(["publish"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /the table does not name/);
});

// The regression test for the leak this whole check exists for. The live defect
// — the oral brief pointing at the interview script — was fixed on `master`, so
// the rule stands on a fixture reproducing its shape instead. A guard that has
// never been seen to fire is not a guard.
test("a student-facing document linking to examiner-only material stops the run", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("./lab-3-oral--instructor.md"));
  workspace.writeCatalog({
    published: [...DAY_ONE_ENTRIES, SCRIPT_ENTRY],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /labs\/lab-1\.md/);
  assert.match(result.stderr, /lab-3-oral--instructor\.md/);
  assert.match(result.stderr, /examiner-only/);
  assert.equal(workspace.readCourse().items.length, 0);
});

test("an examiner-only document may link to another, and the run says so once", async () => {
  const workspace = makeWorkspace();
  workspace.write("lectures/lecture-1.md", "# Lecture 1\n\nFraming.\n");
  workspace.write("labs/lab-1.md", "# Lab 1\n\nYour own backlog.\n");
  // Five links from the script to the anchors, so the warning is seen in the
  // bulk it actually fires in.
  workspace.write(
    ORAL_SCRIPT_SOURCE,
    scriptLinking(
      "../c1-assessment-examples--instructor.md",
      "../c2-assessment-examples--instructor.md",
      "../c3-assessment-examples--instructor.md",
      "../c4-assessment-examples--instructor.md",
      "../c5-assessment-examples--instructor.md"
    )
  );
  const anchors = ["c1", "c2", "c3", "c4", "c5"].map((name) => ({
    source: `${name}-assessment-examples--instructor.md`,
    title: `${name.toUpperCase()} banding anchors`,
    published: `Instructor — ${name.toUpperCase()} banding anchors`,
    section: "Assessment" as const,
  }));
  for (const anchor of anchors)
    workspace.write(anchor.source, ANCHORS_MARKDOWN);
  workspace.writeCatalog({
    published: [
      ...DAY_ONE_ENTRIES,
      SCRIPT_ENTRY,
      ...anchors.map(({ source, title, section }) => ({
        source,
        title,
        section,
      })),
    ],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  // Every link rewritten…
  for (const anchor of anchors) {
    assert.match(
      bodyOf(workspace, SCRIPT),
      new RegExp(
        `href="${urlOf(workspace, anchor.published).replace(/[?]/g, "\\?")}"`
      )
    );
  }
  // …and the explanation given once, over a count, rather than five times.
  assert.match(result.stdout, /Warning: 5 links point at a document/);
  assert.equal(
    result.stdout.match(/Examiner-only material is always hidden/g)?.length,
    1
  );
});

test("an examiner-only document linking to student-facing material warns about nothing", async () => {
  const workspace = makeWorkspace();
  workspace.write("lectures/lecture-1.md", "# Lecture 1\n\nFraming.\n");
  workspace.write("labs/lab-1.md", "# Lab 1\n\nYour own backlog.\n");
  workspace.write(ORAL_SCRIPT_SOURCE, scriptLinking("../assessment-grid.md"));
  workspace.writeCatalog({ published: [...DAY_ONE_ENTRIES, SCRIPT_ENTRY] });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    bodyOf(workspace, SCRIPT),
    new RegExp(`href="${urlOf(workspace, GRID).replace(/[?]/g, "\\?")}"`)
  );
  assert.doesNotMatch(result.stdout, /Warning: /);
});

test("a link to a document later in the table is an ordinary rewrite", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("../labs/lab-2.md"));
  workspace.write("labs/lab-2.md", "# Lab 2\n\nExtend and constrain.\n");
  const LAB_2 = "Lab 2 — Extend and constrain your agent";
  workspace.writeCatalog({
    published: [
      ...DAY_ONE_ENTRIES,
      { source: "labs/lab-2.md", title: LAB_2, section: "Labs" },
    ],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    bodyOf(workspace, "Lab 1 — Frame and decompose your own work"),
    new RegExp(`href="${urlOf(workspace, LAB_2).replace(/[?]/g, "\\?")}"`)
  );
});

test("a link to a document that ships hidden warns and publishes anyway", async () => {
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
  assert.match(result.stdout, /Warning: 1 link points at a document/);
  assert.match(
    result.stdout,
    /labs\/lab-1\.md → autonomy\/autonomy-2-c3-exercise-brief\.md/
  );
  assert.match(
    bodyOf(workspace, "Lab 1 — Frame and decompose your own work"),
    new RegExp(`href="${urlOf(workspace, BRIEF).replace(/[?]/g, "\\?")}"`)
  );
});

test("in-page anchors and absolute URLs are left exactly as written", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(
    workspace,
    `# Lab 1 — Frame and decompose your own work

Jump to [the appendix](#appendix), and read [the crash course](https://www.aihero.dev/).
Neither is a document of this repository.

## Appendix
`
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const body = bodyOf(workspace, "Lab 1 — Frame and decompose your own work");
  assert.match(body, /href="#appendix"/);
  assert.match(body, /href="https:\/\/www\.aihero\.dev\/"/);
});

test("a link to a page made in the same run is rewritten before the run ends", async () => {
  const workspace = makeWorkspace();
  // The grid links back at the lab, and the lab at the grid: neither can be
  // made after the other, so at least one of them is written before its target
  // has a module id at all.
  writeGrid(
    workspace,
    GRID_FRONT_MATTER,
    `${GRID_MARKDOWN}\nThe brief is [here](labs/lab-1.md).\n`
  );
  writeLinkingLab(workspace, labLinking("../assessment-grid.md"));

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    bodyOf(workspace, GRID),
    new RegExp(
      `href="${urlOf(workspace, "Lab 1 — Frame and decompose your own work").replace(/[?]/g, "\\?")}"`
    )
  );
  assert.match(
    bodyOf(workspace, "Lab 1 — Frame and decompose your own work"),
    new RegExp(`href="${urlOf(workspace, GRID).replace(/[?]/g, "\\?")}"`)
  );
});

test("a link's fragment survives the rewrite", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("../assessment-grid.md#bands"));

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    bodyOf(workspace, "Lab 1 — Frame and decompose your own work"),
    new RegExp(`href="${urlOf(workspace, GRID).replace(/[?]/g, "\\?")}#bands"`)
  );
});

test("a relative path quoted in a code span is text, not a link, and is left alone", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(
    workspace,
    `# Lab 1 — Frame and decompose your own work

Full protocol: see \`./lab-3-oral--instructor.md\`, beside this brief.
`
  );
  workspace.writeCatalog({ published: [...DAY_ONE_ENTRIES, SCRIPT_ENTRY] });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    bodyOf(workspace, "Lab 1 — Frame and decompose your own work"),
    /<code>\.\/lab-3-oral--instructor\.md<\/code>/
  );
});

test("the plan reports a refused link before anything is applied", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(workspace, labLinking("./lab-3-oral--instructor.md"));
  workspace.writeCatalog({ published: [...DAY_ONE_ENTRIES, SCRIPT_ENTRY] });

  const result = await workspace.publisher(["publish"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /examiner-only/);
});

// Authors write links as raw HTML when markdown will not do — a link inside a
// table cell, a link with a class on it — and they write the attribute in
// whichever quotes come to hand. Both halves of this feature have to agree on
// that, because a link the reading half validates and the writing half leaves
// alone ships to Moodle as a dead relative path with nothing said.
test("a raw-HTML link written in single quotes is rewritten too", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(
    workspace,
    `# Lab 1 — Frame and decompose your own work

Read <a href='../assessment-grid.md'>the grid</a> first.
`
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const body = bodyOf(workspace, "Lab 1 — Frame and decompose your own work");
  assert.match(
    body,
    new RegExp(`href="${urlOf(workspace, GRID).replace(/[?]/g, "\\?")}"`)
  );
  // The repository path is gone, not merely accompanied by the URL.
  assert.doesNotMatch(body, /href=['"][^'"]*assessment-grid\.md/);
});

// The other way the two halves can end up looking at different strings, and the
// one that is not hypothetical in a French curriculum: the reading half is given
// the href as the document spells it, `../résumé.md`, while the renderer
// percent-encodes on the way into the attribute, so the writing half meets
// `../r%C3%A9sum%C3%A9.md`. Compared directly those are different links and the
// rewrite quietly declines to happen. An accent or a space in a filename was
// enough — going the other way too, since a document may percent-encode the
// path itself and both spellings must land on the same activity.
test("a link to a document whose name needs escaping is rewritten too", async () => {
  const workspace = makeWorkspace();
  const SUMMARY = "Résumé du cours";
  const NOTES = "Notes de cours";
  workspace.write("lectures/lecture-1.md", "# Lecture 1\n\nFraming.\n");
  workspace.write(
    "labs/lab-1.md",
    // The first spelled plainly, the second escaped by the author.
    labLinking("../résumé.md", "../notes%20de%20cours.md")
  );
  workspace.write("résumé.md", "# Résumé\n\nLe cours en bref.\n");
  workspace.write("notes de cours.md", "# Notes\n\nPrises en cours.\n");
  workspace.writeCatalog({
    published: [
      ...DAY_ONE_ENTRIES,
      { source: "résumé.md", title: SUMMARY, section: "Resources" },
      {
        source: "notes de cours.md",
        title: NOTES,
        section: "Resources",
      },
    ],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const body = bodyOf(workspace, "Lab 1 — Frame and decompose your own work");
  for (const title of [SUMMARY, NOTES]) {
    assert.match(
      body,
      new RegExp(`href="${urlOf(workspace, title).replace(/[?]/g, "\\?")}"`)
    );
  }
  assert.equal(deadLinkIn(body), undefined);
});

// An `href` on anything that is not an `<a>` was never read as a
// cross-reference, so it must not be rewritten either: the halves disagreeing in
// that direction is the same defect pointing the other way.
test("an href on an element that is not a link is left alone", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(
    workspace,
    `# Lab 1 — Frame and decompose your own work

<link rel="alternate" href="../assessment-grid.md">

Nothing above is a link a student can click.
`
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    bodyOf(workspace, "Lab 1 — Frame and decompose your own work"),
    /<link rel="alternate" href="\.\.\/assessment-grid\.md">/
  );
});

// Now that the rewrite spans the whole element, an anchor an author never
// closed is the one shape the reading half accepts and the writing half cannot
// place. It must fail as itself: the malformed link is the one named, and the
// good link beside it is published as it always was, rather than being eaten by
// the match that went looking for a closing tag.
test("an anchor that is never closed fails as itself, taking no other link with it", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(
    workspace,
    `# Lab 1 — Frame and decompose your own work

Read <a href="../assessment-grid.md">the grid first.

Then read <a href="../lectures/lecture-1.md">the lecture</a>.
`
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /assessment-grid\.md/);
  assert.doesNotMatch(result.stderr, /lecture-1\.md/);
  // The well-formed link was published, and published normally: the abort
  // comes after the course is written, and it is about the other link.
  assert.match(
    bodyOf(workspace, "Lab 1 — Frame and decompose your own work"),
    new RegExp(
      `href="${urlOf(workspace, "Lecture 1 — Framing and decomposing").replace(/[?]/g, "\\?")}"[^>]*>the lecture</a>`
    )
  );
});

// The same link, refused rather than rewritten: the quote style decides nothing
// about whether the guard fires either.
test("a single-quoted raw-HTML link to examiner-only material stops the run", async () => {
  const workspace = makeWorkspace();
  writeLinkingLab(
    workspace,
    `# Lab 1 — Frame and decompose your own work

Read <a href='./lab-3-oral--instructor.md'>the script</a> first.
`
  );
  workspace.writeCatalog({ published: [...DAY_ONE_ENTRIES, SCRIPT_ENTRY] });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /examiner-only/);
  assert.equal(workspace.readCourse().items.length, 0);
});
