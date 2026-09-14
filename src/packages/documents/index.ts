// Markdown in the repository, HTML for Moodle, and the hash that says whether a
// document has changed since it was last published — the last of which is
// handed out on its own too, because a Deliverable is hashed the same way and
// there is one spelling of a hash in this program.
import {
  render,
  hashDocument,
  readFrontMatter,
  readSource,
  rewriteImages,
  fingerprintsForEntry,
  proseForEntry,
} from "./lib/markdown.ts";
import { crossReferencesIn, linkKey, rewriteLinks } from "./lib/links.ts";

import type { CrossReference, ResolvedLink } from "./lib/links.ts";
import type { FrontMatter } from "./lib/front-matter.ts";

export type { CrossReference, ResolvedLink } from "./lib/links.ts";

import type { PageImage } from "../course/index.ts";

export { contentHash } from "./lib/content-hash.ts";
export type { HashedPart } from "./lib/content-hash.ts";
export { MissingImage } from "./lib/markdown.ts";
export { MalformedFrontMatter } from "./lib/front-matter.ts";
export type { FrontMatter, FrontMatterValue } from "./lib/front-matter.ts";

export interface RenderedDocument {
  /**
   * The HTML that goes into the page activity's body, with every reference to
   * a picture in this repository already pointing at the copy that goes up
   * with the page.
   *
   * Cross-references are the other way round: they are still spelled as the
   * document spells them, repository paths until {@link withResolvedLinks} is
   * given the course's answer for each one. A picture's destination is known
   * as soon as the document is read; a link's is a module id, which may not
   * exist until later in the same run.
   */
  readonly html: string;
  /**
   * Hash of the document — its markdown, the pictures it shows and the
   * documents it links to — and so the manifest's answer to "has this
   * changed?". A diagram redrawn without a word of prose touched changes it,
   * because it changes what students see.
   */
  readonly contentHash: string;
  /**
   * The documents this one links to, each href once. What may be linked to is
   * not decided here: this is the reading, and who each document is for is the
   * catalog's business.
   */
  readonly links: readonly CrossReference[];
  /**
   * The pictures the HTML above now names, to be uploaded with the page. Empty
   * for a document that shows none, which is most of them.
   */
  readonly images: readonly PageImage[];
}

/** HTML with every cross-reference the caller could answer pointing at Moodle. */
export interface LinkedHtml {
  readonly html: string;
  /**
   * The cross-references still spelled as repository paths in `html`.
   *
   * Every link the caller had no URL for — and every link it *did* answer whose
   * href the rewrite never found. The second kind is the one worth naming: a
   * URL being available says nothing about whether the substitution landed, and
   * a link counted resolved on the strength of the first claim alone is exactly
   * how a dead relative path reaches a student in silence.
   *
   * Never a silent outcome either way: a run that publishes a document and the
   * document it links to in the same pass cannot know the second one's course
   * module id until it has made it, so the links that could not be answered the
   * first time are what the caller comes back for.
   */
  readonly unresolved: readonly CrossReference[];
}

/**
 * Reads `source` under `repoRoot` and renders it. Tables, headings, fenced code
 * and lists are all converted, because the assessment grid is table-heavy and a
 * grid that does not render is not a grid.
 *
 * The document's own first heading supplies nothing: Moodle activity names come
 * from the catalog, so body and title are independently controlled.
 *
 * `titleOf` says what each document this one links to is published under. It
 * changes nothing in the HTML — the link texts are substituted later, with the
 * URLs — and everything in the hash: a title is what a self-naming link will
 * read as, so a title edited in the catalog has to make this document read as
 * changed. Asked for rather than defaulted, so there is one hashing rule
 * rather than one per caller: a content hash that turns on which of two
 * spellings the caller used is the bug this parameter exists to close. A
 * caller with nothing to say answers `undefined` per link, and the hash is
 * then exactly what it was before titles were counted.
 */
export function renderDocument(
  repoRoot: string,
  source: string,
  titleOf: (link: CrossReference) => string | undefined
): RenderedDocument {
  const markdown = readSource(repoRoot, source);
  const links = crossReferencesIn(source, markdown);
  // Rewriting is what refuses a document showing a picture this repository
  // does not hold, and it happens here — in the reading half of a run, before
  // the plan is even reported — so that the refusal comes before anything is
  // written to the course.
  const { html, images } = rewriteImages(repoRoot, source, render(markdown));
  return {
    html,
    images,
    contentHash: hashDocument(repoRoot, source, markdown, links, titleOf),
    links,
  };
}

/**
 * `rendered` with each cross-reference `resolve` answers pointing at the
 * activity its target was published as, and reading as that activity's name
 * wherever the document only spelled the path again.
 *
 * Only hrefs this package read as cross-references are offered: an in-page
 * anchor and an absolute URL are never asked about, and so are never touched.
 */
export function withResolvedLinks(
  rendered: RenderedDocument,
  resolve: (link: CrossReference) => ResolvedLink | undefined
): LinkedHtml {
  // Keyed by `linkKey` on both sides, which is the spelling the document and
  // the rendered attribute can both be reduced to.
  const resolved = new Map<string, ResolvedLink>();
  for (const link of rendered.links) {
    const answer = resolve(link);
    if (answer !== undefined) resolved.set(linkKey(link.href), answer);
  }
  const { html, rewritten } = rewriteLinks(rendered.html, (key) =>
    resolved.get(key)
  );
  return {
    html,
    // Asked of the rewrite rather than of `urls`: a link is resolved when the
    // HTML points at Moodle, not when a URL for it existed.
    unresolved: rendered.links.filter(
      (link) => !rewritten.has(linkKey(link.href))
    ),
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

/**
 * Distinctive sentences from a document, used by the audit to recognise the
 * document's text in a live course even if someone retitled the activity.
 * `source` may name a file or, ending in `/`, a directory of them.
 */
export function fingerprints(
  repoRoot: string,
  source: string
): readonly string[] {
  return fingerprintsForEntry(repoRoot, source);
}

/**
 * Every line of a document, as a reader of the published page sees it rather
 * than as the file spells it. `source` may name a file or, ending in `/`, a
 * directory of them.
 *
 * This is what the audit asks a student-facing document for when it has to
 * decide whether a phrase it recognised is really evidence of a leak.
 */
export function prose(repoRoot: string, source: string): readonly string[] {
  return proseForEntry(repoRoot, source);
}
