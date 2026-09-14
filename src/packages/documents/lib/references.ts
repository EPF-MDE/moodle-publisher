// Implementation: private to the documents package.
//
// Reading the paths a document points at, and deciding where each one points.
// Pictures and cross-references ask the same two questions of the same strings
// — which ones did the author actually write, and what do they resolve to — so
// they ask them here, once, and differ only in which token they are after.
import { dirname, normalize, posix, sep } from "node:path";

import { marked } from "./gfm.ts";

import type { Token } from "marked";

/**
 * Every path a document points at with a token of `kind`, plus the ones written
 * as raw HTML and caught by `inHtml`'s first group.
 *
 * Read with the same markdown reader that renders the document, not with a
 * regular expression over the raw text: a lecture that quotes `![…](…)` or a
 * relative link inside a fenced block is showing students the syntax, not
 * pointing at anything, and the two are indistinguishable in the source. The
 * reader also resolves `![alt][label]` against its definition and unwraps `<…>`
 * around a path with spaces in it.
 */
export function referencesIn(
  markdown: string,
  kind: "image" | "link",
  inHtml: RegExp
): readonly string[] {
  const found: string[] = [];
  marked.walkTokens(marked.lexer(markdown), (token: Token) => {
    if (token.type === kind) found.push(token.href);
    // HTML is passed through as raw text, so it is the one place the reader
    // hands back something still to be read.
    if (token.type === "html") {
      for (const [, path = ""] of token.raw.matchAll(inHtml)) found.push(path);
    }
  });
  return found;
}

/**
 * A reference the publisher can resolve against the repository: not a URL, not
 * a data blob, not an in-page anchor, not an absolute path. Anything else names
 * something this repository does not hold, and is left exactly as written.
 */
export function isLocal(reference: string): boolean {
  // Empty means a reference whose definition is missing: it names no file, and
  // resolving it would silently point at the document's own directory instead.
  if (reference === "") return false;
  if (reference.startsWith("#") || reference.startsWith("/")) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(reference);
}

/** The `#fragment` of a reference, `""` when it has none. */
export function fragmentOf(reference: string): string {
  const at = reference.indexOf("#");
  return at === -1 ? "" : reference.slice(at);
}

/**
 * The path as it sits on disk. A link spells a space `%20`, and a file whose
 * name is spelled the way the link spells it would never be found.
 */
export function onDisk(reference: string): string {
  // Query strings and fragments name a rendering, not a different file.
  const path = reference.replace(/[?#].*$/, "");
  try {
    return decodeURIComponent(path);
  } catch {
    // A stray `%` is not an escape; the author meant the character.
    return path;
  }
}

/**
 * The repository-relative path `reference`, written in the document at
 * `source`, points at — or `undefined` when it points somewhere the repository
 * cannot resolve at all.
 *
 * `source` supplies the directory to resolve against: the lectures write
 * `../assets/…`, relative to the document, as markdown references always are.
 * A path that climbs out of the repository comes back as written, still
 * relative, because the two callers answer it differently: a picture outside
 * the repository is simply not tracked, while a *link* outside it is a link to
 * a document no table can name, and the refusal has to be able to quote it.
 */
export function referencedPath(
  source: string,
  reference: string
): string | undefined {
  if (!isLocal(reference)) return undefined;
  return normalize(posix.join(dirname(source), onDisk(reference))).replaceAll(
    sep,
    "/"
  );
}

/** Whether a resolved path climbed out of the repository. */
export function isOutside(path: string): boolean {
  return path === ".." || path.startsWith("../");
}
