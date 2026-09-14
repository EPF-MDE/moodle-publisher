// A picture wider than Moodle's page column is cut off at the right edge, and
// on a lecture slide the right edge is where the annotation usually is. So
// every picture is published told to fit the column it lands in.
import { test } from "node:test";
import assert from "node:assert/strict";

import { renderDocument } from "../packages/documents/index.ts";

import { makeWorkspace } from "./harness.ts";

/** A document showing whatever `body` says, rendered from a real workspace. */
function renderShowing(body: string): string {
  const workspace = makeWorkspace();
  workspace.write("assets/workflow.png", "a drawing wider than the column");
  workspace.write("lectures/lecture-1.md", `# Lecture 1\n\n${body}\n`);
  // Nothing to say about what the links are called: these documents make none,
  // and this is about the HTML rather than the hash.
  return renderDocument(
    workspace.root,
    "lectures/lecture-1.md",
    () => undefined
  ).html;
}

test("a picture written in markdown is published fitted to the column", () => {
  const html = renderShowing(
    "![The five-phase workflow](../assets/workflow.png)"
  );
  assert.match(html, /<img[^>]*style="[^"]*max-width:\s*100%/);
  // Without this a picture that shrank to fit keeps its original height and
  // students get a squashed diagram instead of a cut-off one.
  assert.match(html, /<img[^>]*style="[^"]*height:\s*auto/);
});

test("a picture hosted elsewhere is fitted too", () => {
  // Nothing is uploaded for it and its `src` is left alone, but it lands in
  // the same column and overflows it the same way.
  const html = renderShowing(
    '<img src="https://example.test/wide.png" alt="Wide">'
  );
  assert.match(html, /<img[^>]*style="[^"]*max-width:\s*100%/);
  assert.match(html, /src="https:\/\/example\.test\/wide\.png"/);
});

test("a width the author asked for survives being fitted", () => {
  const html = renderShowing(
    '<img src="../assets/workflow.png" alt="Narrow" width="320">'
  );
  assert.match(html, /width="320"/);
  assert.match(html, /<img[^>]*style="[^"]*max-width:\s*100%/);
});

test("an author's own style declarations are kept, and win", () => {
  const html = renderShowing(
    '<img src="../assets/workflow.png" alt="Half" style="max-width:50%">'
  );
  const style = /<img[^>]*style="([^"]*)"/.exec(html)?.[1] ?? "";
  assert.match(style, /max-width:\s*100%/);
  assert.match(style, /max-width:\s*50%/);
  // Later declarations win in CSS, so the author's cap has to come last.
  assert.ok(
    style.lastIndexOf("50%") > style.lastIndexOf("100%"),
    `the author's own max-width should be the last one to apply, got "${style}"`
  );
});

test("a self-closing tag is not mangled by being fitted", () => {
  const html = renderShowing(
    '<img src="../assets/workflow.png" alt="Closed" />'
  );
  assert.doesNotMatch(html, /\/\s+style=/);
  assert.match(html, /<img[^>]*style="[^"]*max-width:\s*100%/);
});
