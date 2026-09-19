// Markdown in the repository, HTML for Moodle, and the hash that says whether a
// document has changed since it was last published — the last of which is
// handed out on its own too, because a Deliverable is hashed the same way and
// there is one spelling of a hash in this program.
import {
  render,
  hashDocument,
  readFrontMatter,
  readSource,
  embedImages,
} from "./lib/markdown.ts";
import { crossReferencesIn, linkKey, linksAsText } from "./lib/links.ts";
import { assembleGrid } from "./lib/grid.ts";

import type { CrossReference, LinkTarget } from "./lib/links.ts";
import type { FrontMatter } from "./lib/front-matter.ts";
import type { GridCompetency } from "./lib/grid.ts";

export type { GridCompetency } from "./lib/grid.ts";
export type { CrossReference, LinkTarget } from "./lib/links.ts";

export { contentHash } from "./lib/content-hash.ts";
export type { HashedPart } from "./lib/content-hash.ts";
export { MissingImage } from "./lib/markdown.ts";
export { MalformedFrontMatter } from "./lib/front-matter.ts";
export type { FrontMatter, FrontMatterValue } from "./lib/front-matter.ts";

export interface RenderedDocument {
  /**
   * The document's body as HTML, with every picture in this repository it
   * shows already embedded in it, and every cross-reference already turned
   * into text.
   */
  readonly html: string;
  /**
   * Hash of the document — its markdown, the pictures it shows and what the
   * documents it links to are called and where they sit — and so the
   * manifest's answer to "has this changed?". A diagram redrawn without a word
   * of prose touched changes it, because it changes what students see.
   */
  readonly contentHash: string;
  /**
   * The documents this one links to, each href once. What may be linked to is
   * not decided here: this is the reading, and who each document is for is the
   * catalog's business.
   */
  readonly links: readonly CrossReference[];
}

/**
 * A cross-reference the rendered document still carries as a link.
 *
 * Not a mistake the table can make: every cross-reference has an answer, even
 * if the answer is "nothing publishes that". It means the rewrite did not
 * recognise the link in the rendered HTML — an `<a>` its author never closed is
 * the one known shape — and publishing anyway would put a repository path in
 * front of a reader. Thrown while the document is read, so nothing has been
 * written to the course.
 */
export class UnrewrittenCrossReference extends Error {
  constructor(source: string, link: CrossReference) {
    super(
      `Aborting: "${source}" links to "${link.href}", and that link could not be turned into ` +
        `text, so the published PDF would carry the path. An <a> that is never closed is the ` +
        `usual cause: close it, or write the link in markdown, and run again.`
    );
    this.name = "UnrewrittenCrossReference";
  }
}

/**
 * Reads `source` under `repoRoot` and renders it. Tables, headings, fenced code
 * and lists are all converted, because the assessment grid is table-heavy and a
 * grid that does not render is not a grid.
 *
 * The document's own first heading supplies nothing: Moodle activity names come
 * from the catalog, so body and title are independently controlled.
 *
 * `targetOf` says where each document this one links to is published: its
 * title and Section, or `undefined` for a document the table does not list. A
 * link to a listed document is published as text naming it —
 * `"Killing bloat" (document available in the Resources section)` — and a link
 * to anything else as its own text alone. Web links and in-page anchors stay
 * links. What `targetOf` answers is hashed too, so a title edited in the
 * catalog makes every document linking to it read as changed.
 *
 * Throws {@link UnrewrittenCrossReference} when a cross-reference could not be
 * found in the rendered page to rewrite.
 */
export function renderDocument(
  repoRoot: string,
  source: string,
  targetOf: (link: CrossReference) => LinkTarget | undefined
): RenderedDocument {
  const markdown = readSource(repoRoot, source);
  return renderMarkdown(repoRoot, source, markdown, targetOf);
}

/**
 * Reads the Grid Source at `source` under `repoRoot` and renders the
 * Assessment Grid assembled from it (ADR-0014): the Grid Frame this package
 * ships, with the source's block for each of `competencies` written into it,
 * in `C1…Cn` order, each headed by its id and its title. The source's front
 * matter is never printed, and nothing else of the Frame is the course's to
 * write.
 *
 * The assembled markdown is then published exactly as {@link renderDocument}
 * publishes a document: a cross-reference or a picture in a Competency block
 * is rewritten, embedded or refused as it would be anywhere else, relative to
 * `source`. So is the hash: it is taken over the assembled grid, so a new Grid
 * Frame, or a value written into it such as a Competency's title, makes the
 * grid read as changed, and a new publisher with the same Frame does not.
 */
export function renderAssessmentGrid(
  repoRoot: string,
  source: string,
  competencies: readonly GridCompetency[],
  targetOf: (link: CrossReference) => LinkTarget | undefined
): RenderedDocument {
  const assembled = assembleGrid(readSource(repoRoot, source), competencies);
  return renderMarkdown(repoRoot, source, assembled, targetOf);
}

/** Renders `markdown`, what a reader reads as `source`, and hashes it. */
function renderMarkdown(
  repoRoot: string,
  source: string,
  markdown: string,
  targetOf: (link: CrossReference) => LinkTarget | undefined
): RenderedDocument {
  const links = crossReferencesIn(source, markdown);
  // Rewriting is what refuses a document showing a picture this repository
  // does not hold, and it happens here — in the reading half of a run, before
  // the plan is even reported — so that the refusal comes before anything is
  // written to the course.
  const withImages = embedImages(repoRoot, source, render(markdown));
  // Keyed by `linkKey` on both sides, which is the spelling the document and
  // the rendered attribute can both be reduced to.
  const targets = new Map(
    links.map((link) => [linkKey(link.href), targetOf(link)])
  );
  const { html, rewritten } = linksAsText(withImages, targets);
  // Asked of the rewrite rather than of the table: a link is text when the
  // document no longer carries it, not when the table had something to say.
  const missed = links.find((link) => !rewritten.has(linkKey(link.href)));
  if (missed !== undefined) throw new UnrewrittenCrossReference(source, missed);
  return {
    html,
    contentHash: hashDocument(repoRoot, source, markdown, links, targetOf),
    links,
  };
}

/**
 * What `source` says to the publisher rather than to a reader: the block of
 * YAML above its first heading, parsed, or `undefined` when it has none.
 *
 * The reading only. What a key means, and which documents are allowed to carry
 * one, is the catalog's business — this package knows how a document is
 * written, not what the course does with it.
 */
export function frontMatter(
  repoRoot: string,
  source: string
): FrontMatter | undefined {
  return readFrontMatter(repoRoot, source);
}
