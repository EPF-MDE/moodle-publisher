// Implementation: private to the documents package.
//
// The pictures a document shows. A document is its markdown and its pictures,
// so a redrawn diagram has to count as a change to the document — which means
// something has to say which files a document shows.
import { isOutside, referencedPath, referencesIn } from "./references.ts";

/**
 * `<img src="path">`. Markdown lets authors drop HTML in, and the lectures
 * reach for it whenever a diagram needs a width — a picture shown that way is
 * shown just as much as one written `![…](…)`.
 */
const HTML_IMAGE = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;

/**
 * What a reference in a document points at.
 *
 * `outside` is kept apart from `inside` rather than folded into it because the
 * two are answered differently: a file in the repository is uploaded with the
 * document that shows it, and one that is not cannot be, however the reference
 * is spelled.
 */
export type Reference =
  | { readonly kind: "inside"; readonly path: string }
  | { readonly kind: "outside"; readonly path: string }
  | { readonly kind: "elsewhere" };

/**
 * Where `reference`, written in the document at `source`, points.
 *
 * `source` supplies the directory to resolve against: the lectures write
 * `../assets/…`, relative to the document, as markdown links always are.
 *
 * The resolving itself is `references.ts`'s, shared with cross-references,
 * because a picture and a link spell a path exactly alike — a `%20`, a `..`,
 * a query string mean the same thing in both. What is *not* shared is what the
 * three answers are worth, which is this file's business and the reason the
 * shared resolver's `undefined` becomes `elsewhere` here.
 */
export function resolveReference(source: string, reference: string): Reference {
  const path = referencedPath(source, reference);
  if (path === undefined) return { kind: "elsewhere" };
  return isOutside(path) ? { kind: "outside", path } : { kind: "inside", path };
}

/**
 * Repository-relative paths of the pictures `markdown` shows, each named once.
 *
 * References that climb out of the repository are left out: this is the set of
 * files whose bytes are part of the document's own change verdict, and a file
 * the repository does not hold cannot be. Publishing refuses such a reference
 * separately, where the refusal can name the document.
 */
export function imagesShownBy(
  source: string,
  markdown: string
): readonly string[] {
  const shown = new Set<string>();
  for (const reference of referencesIn(markdown, "image", HTML_IMAGE)) {
    const resolved = resolveReference(source, reference);
    if (resolved.kind === "inside") shown.add(resolved.path);
  }
  // Sorted, so the hash does not turn on the order the pictures happen to be
  // written in: reordering two paragraphs already changes the markdown itself.
  return [...shown].sort();
}
