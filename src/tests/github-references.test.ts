// A course names the issues it works from the way GitHub writes them,
// `EPF-MDE/OceENS#97`, and on GitHub that is a link. It is not markdown's, so
// a published PDF showed it as plain text: a Lab listing twenty issues left a
// student to retype every one. So a reference that names its repository is
// published as a link to it.
import { test } from "node:test";
import assert from "node:assert/strict";

import { contentHash, renderDocument } from "../packages/documents/index.ts";

import { makeWorkspace } from "./harness.ts";

/** A Lab whose body is `body`, rendered and hashed from a real workspace. */
function renderLab(body: string): { html: string; contentHash: string } {
  const workspace = makeWorkspace();
  const markdown = `# Lab 1\n\n${body}\n`;
  workspace.write("labs/lab-1.md", markdown);
  return renderDocument(workspace.root, "labs/lab-1.md", () => undefined);
}

const ISSUE_97 =
  '<a href="https://github.com/EPF-MDE/OceENS/issues/97">EPF-MDE/OceENS#97</a>';

test("a reference to an issue is published as a link to it", () => {
  const { html } = renderLab(
    "Its **Project Backlog**: EPF-MDE/OceENS#97 and EPF-MDE/MATHutrice#36."
  );
  assert.ok(html.includes(ISSUE_97), html);
  assert.ok(
    html.includes(
      '<a href="https://github.com/EPF-MDE/MATHutrice/issues/36">EPF-MDE/MATHutrice#36</a>.'
    ),
    html
  );
});

test("a reference is linked wherever prose is: a list, a table, emphasis", () => {
  const { html } = renderLab(
    [
      "1. **Seed it** (EPF-MDE/OceENS#97).",
      "",
      "| Step | OcéENS |",
      "|---|---|",
      "| 1 | EPF-MDE/OceENS#97, _EPF-MDE/OceENS#97_ |",
    ].join("\n")
  );
  assert.equal(html.split(ISSUE_97).length - 1, 3, html);
});

test("a reference already inside a link is left to that link", () => {
  const { html } = renderLab(
    "[EPF-MDE/OceENS#97](https://github.com/EPF-MDE/OceENS/issues/97#issuecomment-1)"
  );
  assert.equal(html.match(/<a\b/g)?.length, 1, html);
});

test("a reference quoted as code is left as code", () => {
  const { html } = renderLab("Write `EPF-MDE/OceENS#97` in the commit.");
  assert.doesNotMatch(html, /<a\b/);
  assert.match(html, /<code>EPF-MDE\/OceENS#97<\/code>/);
});

test("a reference naming no repository is left as text", () => {
  // `#97` is a link on GitHub only because the page it is on names the
  // repository. A PDF names none, so there is nothing to point it at.
  const { html } = renderLab("See #97, and the slide at a/b/c#3.");
  assert.doesNotMatch(html, /<a\b/);
});

test("a document with a reference is republished, one without is not", () => {
  // Linking changes the page published for markdown that did not change, so it
  // has to change the hash. A document making no reference hashes to its
  // markdown alone, as it did before, so it is not republished for nothing.
  const plain = "No references here.";
  assert.equal(
    renderLab(plain).contentHash,
    contentHash([`# Lab 1\n\n${plain}\n`])
  );
  const linked = "See EPF-MDE/OceENS#97.";
  assert.notEqual(
    renderLab(linked).contentHash,
    contentHash([`# Lab 1\n\n${linked}\n`])
  );
});
