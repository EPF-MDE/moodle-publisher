// Implementation: private to the documents package.
//
// The cross-references a document makes: links from one document of this
// repository to another. A relative link ending in `.md` means "the document
// at that path", and a published page cannot carry that — `../assessment-grid.md`
// is a dead link at best. So a cross-reference is not published as a link at
// all: it becomes text naming the target and where on the course page to find
// it, and no document needs another document's module id to be published.
//
// What this file does *not* decide is whether a cross-reference is allowed, or
// what its target is called. That turns on the table, which is the catalog's
// business; here there is only the reading and the rewriting.
import {
  fragmentOf,
  onDisk,
  referencedPath,
  referencesIn,
} from "./references.ts";

// The two halves of this file — reading links out and writing them back — have
// to recognise exactly the same thing. A shape one half validates and the other
// does not is a link that can never be rewritten, and it would ship as a dead
// relative path with nothing said. So the pattern is written once, in pieces,
// and both halves are built from the same pieces.

/** An `<a>` up to its `href=`, which is the only element a link lives on. */
const ANCHOR = String.raw`<a\b[^>]*?\bhref\s*=\s*`;

/** The rest of the opening tag after the href value: a class, a title, `>`. */
const REST_OF_TAG = String.raw`[^>]*>`;

/**
 * Everything between the opening tag and the closing one, which is what a
 * reader of the published page sees.
 *
 * Markup is allowed through — emphasis inside a link's text is kept when the
 * text is — so it is not `[^<]*`. What is not allowed through is another `<a`,
 * and that is the whole of the difference between this and "anything up to the
 * first `</a>`": an author's unclosed anchor would otherwise match on to the
 * *next* link's closing tag, swallowing that link whole. Excluding `<a` makes
 * the malformed anchor simply not match, which the rewrite already has a name
 * for: unrewritten, and reported as itself.
 */
const ANCHOR_TEXT = String.raw`(?:(?!</a>|<a\b)[\s\S])*`;

/**
 * The attribute value, in either quote style.
 *
 * Neither quote may appear inside, which is what makes the two quote styles one
 * pattern rather than two. An href needing a literal quote would have it as an
 * entity by the time it is here.
 */
const QUOTED = String.raw`["']([^"']*)["']`;

/** `<a href="path">`, for the links authors write as raw HTML. Path in group 1. */
const HTML_LINK = new RegExp(`${ANCHOR}${QUOTED}`, "gi");

/**
 * The same anchors, for the rewrite, and this time the whole element: the href
 * value in group 1 and the text a reader sees in group 2.
 *
 * Scoped to `<a>` exactly as the reading half is. An `href` on any other element
 * is not a cross-reference this package ever read, and rewriting one would be
 * the same disagreement between the halves in the other direction. The one
 * shape the reading half accepts and this does not is an `<a>` that is never
 * closed, which marked does not produce and which does not pass silently
 * either: the link is reported unrewritten, and the run aborts naming it.
 */
const REWRITABLE_LINK = new RegExp(
  `${ANCHOR}${QUOTED}${REST_OF_TAG}(${ANCHOR_TEXT})</a>`,
  "gi"
);

/** One link from this document to another document of the repository. */
export interface CrossReference {
  /** The href exactly as the document writes it, which is what the HTML holds. */
  readonly href: string;
  /** Repository-relative path of the document it points at. */
  readonly target: string;
  /** The `#fragment` it asks for within that document; `""` when it asks none. */
  readonly fragment: string;
}

/**
 * The cross-references `markdown` makes, each href named once.
 *
 * Only `.md` paths are here. An in-page anchor, an absolute URL and a link to
 * anything that is not a markdown document are all left exactly as written:
 * the first two work in a published page unchanged, and the third names
 * something this publisher never publishes.
 *
 * A path that climbs out of the repository *is* here, spelled as it resolved.
 * It is a link to a document no table can name, and is published as such.
 */
export function crossReferencesIn(
  source: string,
  markdown: string
): readonly CrossReference[] {
  const found = new Map<string, CrossReference>();
  for (const href of referencesIn(markdown, "link", HTML_LINK)) {
    if (found.has(href)) continue;
    const target = referencedPath(source, href);
    if (target === undefined || !onDisk(href).endsWith(".md")) continue;
    found.set(href, { href, target, fragment: fragmentOf(href) });
  }
  return [...found.values()];
}

/**
 * An href out of the rendered HTML, back as the document spelled it: the five
 * entities marked writes into an attribute, undone.
 *
 * All five, though only two can appear in a path, because what is being
 * recovered is a key — it has to match the href the reading half recorded, and
 * an entity left in place would simply fail to match with nothing said.
 */
function hrefAsWritten(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/**
 * The one spelling of an href that both halves of this file can agree on:
 * entities undone, and percent-escapes with them.
 *
 * Needed because the two halves genuinely see different strings. The reading
 * half is given the href as the *document* spells it — `../ré.md` — while the
 * renderer percent-encodes on the way into the attribute, so the writing half
 * meets `../r%C3%A9.md`. Comparing those two directly says "different link",
 * and the rewrite silently declines to happen: an accent or a space in a
 * filename was enough, and a French curriculum is not a hypothetical place to
 * find one.
 *
 * Two hrefs that differ only in how much of the path they escaped name the same
 * file, so collapsing them onto one key loses nothing.
 */
export function linkKey(href: string): string {
  const written = hrefAsWritten(href);
  try {
    return decodeURIComponent(written);
  } catch {
    // A stray `%` is not an escape; the author meant the character. Same
    // reading `onDisk` takes of the same problem.
    return written;
  }
}

/**
 * A title as it goes into the page: the three characters that would otherwise
 * be read as markup, as entities.
 *
 * A catalog title is prose written by hand — `Lecture 1 — Framing & scoping` —
 * and prose with an ampersand in it must not arrive in the page as the start of
 * an entity.
 */
function asText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Where a cross-reference's target is on the course page: the title it is
 * published under, `Instructor — ` prefix included, and its Section.
 */
export interface LinkTarget {
  readonly title: string;
  readonly section: string;
}

/**
 * What a link to `target` reads as in a published page:
 * `"Killing bloat" (document available in the Resources section)`.
 *
 * The link's own text is not part of it, whatever it said. A link labelled with
 * its repository path and a link labelled with prose read the same, because
 * either way the reader needs the title they will see on the course page and
 * where to look for it.
 */
function namingText(target: LinkTarget): string {
  return `"${asText(target.title)}" (document available in the ${asText(target.section)} section)`;
}

/** A rewrite that has happened, and what it actually touched. */
export interface TextLinks {
  readonly html: string;
  /**
   * The links a substitution landed on, as {@link linkKey} spells them.
   *
   * Reported rather than assumed, because "the table had an answer" and "the
   * page no longer carries the path" are different claims, and only the second
   * is the one a reader depends on.
   */
  readonly rewritten: ReadonlySet<string>;
}

/**
 * `html` with every cross-reference in `targets` taken out of its `<a>`.
 *
 * A key mapped to a {@link LinkTarget} becomes the text naming that target. A
 * key mapped to `undefined` is a link to a document the table does not list:
 * nothing publishes it, so there is nothing to name, and the link becomes its
 * own text alone — markup kept, element gone. Any other `<a>` is left exactly
 * as written.
 *
 * Done to the rendered HTML rather than to the markdown, because in HTML a link
 * is unambiguously an `<a>` with an `href`: a document that *quotes* a relative
 * path in a code span — which the lectures do constantly — has the path in its
 * text, not in an attribute, and a rewrite over the markdown could not tell the
 * two apart.
 */
export function linksAsText(
  html: string,
  targets: ReadonlyMap<string, LinkTarget | undefined>
): TextLinks {
  const rewritten = new Set<string>();
  const text = html.replaceAll(
    REWRITABLE_LINK,
    (whole: string, raw: string, inner: string): string => {
      const key = linkKey(raw);
      if (!targets.has(key)) return whole;
      rewritten.add(key);
      const target = targets.get(key);
      return target === undefined ? inner : namingText(target);
    }
  );
  return { html: text, rewritten };
}
