// Implementation: private to the documents package.
//
// The cross-references a document makes: links from one document of this
// repository to another. A relative link ending in `.md` means "the document
// at that path", and in Moodle it has to mean the activity that document was
// published as — a course page carrying `../assessment-grid.md` is a dead
// link at best.
//
// What this file does *not* decide is whether a cross-reference is allowed.
// That turns on who each document is for, which is the catalog's business;
// here there is only the reading and the rewriting.
import {
  fragmentOf,
  isLocal,
  onDisk,
  referencedPath,
  referencesIn,
} from "./references.ts";

// The two halves of this file — reading links out and writing them back — have
// to recognise exactly the same thing. A shape one half validates and the other
// does not is a link that can stop the run and can never be rewritten, and it
// ships to Moodle as a dead relative path with nothing said. So the pattern is
// written once, in pieces, and both halves are built from the same pieces.

/** An `<a>` up to its `href=`, which is the only element a link lives on. */
const ANCHOR = String.raw`<a\b[^>]*?\bhref\s*=\s*`;

/** The rest of the opening tag after the href value: a class, a title, `>`. */
const REST_OF_TAG = String.raw`[^>]*>`;

/**
 * Everything between the opening tag and the closing one, which is what a
 * reader of the published page sees.
 *
 * Markup is allowed through — a code span around a path is the case this
 * exists for — so it is not `[^<]*`. What is not allowed through is another
 * `<a`, and that is the whole of the difference between this and "anything up
 * to the first `</a>`": an author's unclosed anchor would otherwise match on
 * to the *next* link's closing tag, swallowing that link whole. The run would
 * then abort over the link it ate rather than the one that was malformed,
 * having already written a mangled page. Excluding `<a` makes the malformed
 * anchor simply not match, which is the outcome the rewrite already has a
 * name for: unrewritten, and reported as itself.
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
 * The same anchors, for the rewrite, and this time the whole element: the
 * opening tag up to the href value in group 1, the value in group 2, the rest
 * of the opening tag in group 3, the text a reader sees in group 4.
 *
 * The element rather than the tag, because the text is rewritten too — a link
 * whose text is its own repository path is published under the target's title,
 * and substituting that means knowing where the text starts and ends.
 *
 * Scoped to `<a>` exactly as the reading half is. An `href` on any other element
 * is not a cross-reference this package ever read, and rewriting one would be
 * the same disagreement between the halves in the other direction. The one
 * shape the reading half accepts and this does not is an `<a>` that is never
 * closed, which marked does not produce and which does not pass silently
 * either: the link is reported unrewritten, and the run aborts naming it.
 */
const REWRITABLE_LINK = new RegExp(
  `(${ANCHOR})${QUOTED}(${REST_OF_TAG})(${ANCHOR_TEXT})</a>`,
  "gi"
);

/**
 * A code span wrapping the whole of a link's text, with its content in group 1.
 *
 * One span, not two run together: the content stops at the first `</code>`, so
 * `<code>a.md</code><code>b.md</code>` is not read as a single path with tags
 * in the middle of it.
 */
const WRAPPING_CODE = /^\s*<code\b[^>]*>((?:(?!<\/code>)[\s\S])*)<\/code>\s*$/i;

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
 * the first two work in Moodle unchanged, and the third names something this
 * publisher never turns into an activity, so there is no activity for it to be
 * rewritten to.
 *
 * A path that climbs out of the repository *is* here, spelled as it resolved.
 * It is a link to a document no table can name, and the refusal that follows
 * has to be able to quote it.
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
 * file, so collapsing them onto one key loses nothing — they resolve to the
 * same activity and the same URL.
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
 * A URL as it goes back into a double-quoted attribute. Two entities, not five:
 * this escapes a URL this program built, and the other three cannot occur in
 * one.
 */
function asAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

/**
 * A title as it goes back into a link's text: the three characters that would
 * otherwise be read as markup, as entities.
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
 * A link's text with a code span wrapping the whole of it taken off.
 *
 * Because the two spellings this repository uses for a self-naming link —
 * ``[`../a.md`](../a.md)`` and `[../a.md](../a.md)` — say the same thing, and
 * a title is prose rather than code, so the formatting goes with the path it
 * was formatting.
 */
function withoutWrappingCode(text: string): string {
  return WRAPPING_CODE.exec(text)?.[1] ?? text;
}

/**
 * Whether a link's text is the link naming itself rather than saying anything:
 * `[../resources/model-effort-and-cost.md](../resources/model-effort-and-cost.md)`,
 * which publishes as a path no reader can act on.
 *
 * Two ways to be self-naming, because both occur. The text may be the href
 * itself, compared under {@link linkKey} so the two spellings of an escaped
 * path still count as one; or it may be some other relative `.md` path, which
 * is a link written to one spelling of its target and labelled with another.
 *
 * Whitespace anywhere disqualifies it: a sentence that ends in a path — "see
 * ../a.md" — is prose about a document, and prose is left exactly as the author
 * wrote it.
 */
function isSelfNaming(text: string, href: string): boolean {
  const written = hrefAsWritten(withoutWrappingCode(text)).trim();
  if (written === "" || /\s/.test(written)) return false;
  if (linkKey(written) === linkKey(href)) return true;
  return isLocal(written) && onDisk(written).endsWith(".md");
}

/** A rewrite that has happened, and what it actually touched. */
export interface RewrittenLinks {
  readonly html: string;
  /**
   * The links a substitution landed on, as {@link linkKey} spells them.
   *
   * Reported rather than assumed, because "a URL was available" and "the link
   * now points at it" are different claims, and only the second one is the one
   * a student depends on. Anything the caller offered a URL for that is not in
   * here was left as written and is still a repository path.
   */
  readonly rewritten: ReadonlySet<string>;
}

/** Where a cross-reference goes, and what the document it points at is called. */
export interface ResolvedLink {
  readonly url: string;
  /**
   * The target's title in the catalog — what students see it published under.
   *
   * Handed in beside the URL rather than looked up here, and beside it rather
   * than through a second lookup keyed on the same link, so a page cannot be
   * relinked to one document under the name of another.
   */
  readonly title: string;
}

/**
 * `html` with every href `resolve` has an answer for replaced by that answer,
 * and every link that only named its own path relabelled with the title of the
 * document it points at.
 *
 * Done to the rendered HTML rather than to the markdown, because in HTML a link
 * is unambiguously an `href` attribute: a document that *quotes* a relative
 * path in a code span — which the lectures do constantly, often right beside
 * the link itself — has the path in its text, not in an attribute, and a
 * rewrite over the markdown could not tell the two apart.
 *
 * `resolve` is asked about a {@link linkKey}, not about the attribute as it
 * stands, so a path the renderer percent-encoded still finds its answer.
 *
 * Every href goes back in double quotes whatever quotes it arrived in, which is
 * what {@link asAttribute} escapes for. The rest of the opening tag — a class,
 * a title, whatever the author put there — is kept exactly as it was.
 */
export function rewriteLinks(
  html: string,
  resolve: (key: string) => ResolvedLink | undefined
): RewrittenLinks {
  const rewritten = new Set<string>();
  const withUrls = html.replaceAll(
    REWRITABLE_LINK,
    (
      whole: string,
      opening: string,
      raw: string,
      rest: string,
      text: string
    ): string => {
      const key = linkKey(raw);
      const resolved = resolve(key);
      if (resolved === undefined) return whole;
      const label = isSelfNaming(text, raw) ? asText(resolved.title) : text;
      // What a reader would meet if this went in. A path is what this whole
      // rewrite exists to take off the page, so a label that is still one is
      // the same defect as an href that was never replaced, and is left the
      // same way: the element untouched, the link counted unrewritten, and the
      // caller made loud about it rather than a reader shown a path. The href
      // goes back untouched with it, so what is published is the link exactly
      // as the document wrote it rather than half a rewrite.
      const stillAPath = isSelfNaming(label, raw);
      if (stillAPath) return whole;
      rewritten.add(key);
      return `${opening}"${asAttribute(resolved.url)}"${rest}${label}</a>`;
    }
  );
  return { html: withUrls, rewritten };
}
