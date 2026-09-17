// Implementation: private to the documents package.
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

import { contentHash } from "./content-hash.ts";
import { parseFrontMatter, splitFrontMatter } from "./front-matter.ts";
import { marked } from "./gfm.ts";
import { imagesShownBy, resolveReference } from "./images.ts";

import type { HashedPart } from "./content-hash.ts";
import type { FrontMatter } from "./front-matter.ts";
import type { CrossReference, LinkTarget } from "./links.ts";

/**
 * How a cross-reference is published, as the hash records it: as text naming
 * its target. Changing that changes every page that links, so it is hashed.
 */
const LINK_RENDERING_VERSION = "named-text";

/**
 * The absolute path of `source`, or a refusal. Every read in this file goes
 * through here: a catalog entry names something in the repository, and one that
 * climbs out of it is a mistake worth stopping rather than following.
 */
function pathInside(repoRoot: string, source: string): string {
  const path = resolve(repoRoot, source);
  if (!path.startsWith(resolve(repoRoot) + sep)) {
    throw new Error(
      `Refusing to read "${source}": it resolves outside the repository.`
    );
  }
  return path;
}

/**
 * A document as a reader reads it: its front matter, if it has any, is not
 * part of it.
 *
 * Everything downstream — the rendering and the hash — goes through here, so
 * a document that starts carrying front matter does not start publishing it as
 * a paragraph of YAML above its first heading.
 */
export function readSource(repoRoot: string, source: string): string {
  return splitFrontMatter(readFileSync(pathInside(repoRoot, source), "utf8"))
    .body;
}

/**
 * What `source` says to the publisher rather than to a reader, parsed;
 * `undefined` when the document carries no front matter, which is every
 * document but the assessment grid.
 */
export function readFrontMatter(
  repoRoot: string,
  source: string
): FrontMatter | undefined {
  const text = readFileSync(pathInside(repoRoot, source), "utf8");
  return parseFrontMatter(source, splitFrontMatter(text).frontMatter);
}

export function render(markdown: string): string {
  return fitToColumn(marked.parse(markdown, { async: false }));
}

/** Any `<img>`, however the picture came to be written in the document. */
const IMAGE_TAG = /<img\b([^>]*?)(\/?)>/gi;

/**
 * What a picture is told so that it fits the column it is published into.
 *
 * A lecture slide is exported two or three times wider than the body of a
 * Moodle page, and nothing in the theme caps a picture that is too wide: it
 * runs past the column and the right of it is simply cut off — which on an
 * annotated slide is where the point of the picture usually is. `max-width`
 * shrinks the pictures that are too wide and leaves the rest at their own
 * size, and `height: auto` keeps a picture that shrank in proportion instead
 * of squashing it to whatever height its markup asked for.
 *
 * Written as a style rather than a class because a class only means something
 * if the theme defines it, and the course's theme is not this program's to
 * know.
 */
const FIT_TO_COLUMN = "max-width: 100%; height: auto;";

/**
 * Tells every picture in `html` to fit, including the ones hosted elsewhere:
 * a picture the course does not hold overflows the column exactly as one it
 * does.
 *
 * An author who has already said something about a picture's size keeps their
 * say — their declarations are left in place and go *after* the fit, so the
 * later one is the one CSS applies. The fit is a default for the documents
 * that ask for nothing, not an override of the few that do.
 */
function fitToColumn(html: string): string {
  return html.replaceAll(
    IMAGE_TAG,
    (whole: string, attributes: string, selfClosing: string) => {
      const style = /\bstyle\s*=\s*(["'])(.*?)\1/i.exec(attributes);
      if (style === null) {
        return `<img${attributes} style="${FIT_TO_COLUMN}"${selfClosing}>`;
      }
      const [written, quote, declarations = ""] = style;
      return whole.replace(
        written,
        `style=${quote}${FIT_TO_COLUMN} ${declarations}${quote}`
      );
    }
  );
}

/**
 * A document points a picture at a file this repository does not hold.
 *
 * Fatal, and fatal before anything is written. The picture is embedded in the
 * PDF of the document that shows it, so there is nothing to embed: the
 * document would publish with a picture missing, and what a student would meet
 * is a broken image. Finding that out in front of a class is the outcome this
 * program exists to prevent, so the run stops and names both halves of the fix
 * — the document to open, and the path to put there.
 */
export class MissingImage extends Error {
  constructor(source: string, path: string) {
    super(
      `Aborting: "${source}" shows the picture "${path}", and there is no such file in ` +
        `this repository. It is embedded in the PDF of the document that shows it, so ` +
        `publishing would leave students a broken image. Add the file at "${path}", or take ` +
        `the reference out of the document, then run again. Nothing has been published.`
    );
    this.name = "MissingImage";
  }
}

/** `src="…"` on an `<img>`, wherever the reference came from in the markdown. */
const IMAGE_SRC = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']*)\2/gi;

/**
 * The media type a picture is embedded under, by its extension. A browser
 * sniffs raster formats whatever they are labelled, but draws an SVG only when
 * it is labelled as one.
 */
const MEDIA_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

function mediaTypeOf(path: string): string {
  return MEDIA_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Embeds every picture in this repository that `html` shows, as a `data:` URL
 * carrying the file's bytes, so that the document is self-contained: a PDF is
 * printed from it, and nothing is uploaded beside the PDF.
 *
 * References to pictures hosted elsewhere are left exactly as they are: they
 * already point at something a browser can fetch, and this program does not
 * mirror the internet. Everything else is embedded or refused — a reference
 * that is neither is a broken image nobody was told about.
 *
 * The embedding is done on the rendered HTML rather than on the markdown so
 * that `![…](…)` and the `<img>` tags the lectures write when a diagram needs a
 * width go through one rule, at the point where they have already become the
 * same thing.
 */
export function embedImages(
  repoRoot: string,
  source: string,
  html: string
): string {
  return html.replaceAll(
    IMAGE_SRC,
    (whole, before: string, quote: string, reference: string) => {
      const resolved = resolveReference(source, reference);
      if (resolved.kind === "elsewhere") return whole;
      if (
        resolved.kind === "outside" ||
        !existsSync(resolve(repoRoot, resolved.path))
      ) {
        throw new MissingImage(source, resolved.path);
      }
      const bytes = readFileSync(pathInside(repoRoot, resolved.path));
      const url = `data:${mediaTypeOf(resolved.path)};base64,${bytes.toString("base64")}`;
      return `${before}${quote}${url}${quote}`;
    }
  );
}

/**
 * The hash that answers "has this document changed?": its markdown, the bytes
 * of every picture it shows, and the documents it links to.
 *
 * A document with no pictures and no cross-references hashes to exactly what
 * its markdown alone hashed to before either was counted, so bringing them in
 * does not mark every already-published document as changed — only the ones
 * whose published form actually differs from what the course holds.
 *
 * The links go in as repository paths rather than as course URLs. A URL is a
 * module id, and a module id only changes when the manifest that recorded it
 * was emptied — at which point every document is being created again anyway.
 * Hashing the URL instead would make the hash turn on the state of the course,
 * which is the one thing this hash is not about.
 *
 * A link's *title and Section* are in here all the same, when `targetOf` names
 * them. That is not course state: it is what the catalog — code, in this
 * repository — says the target is called and where it sits, and it is the text
 * the link is published as. A title changed in the table with the hash blind
 * to it leaves every page linking to that document reading the old name for
 * good, while the plan reports nothing to do.
 */
export function hashDocument(
  repoRoot: string,
  source: string,
  markdown: string,
  links: readonly CrossReference[],
  targetOf: (link: CrossReference) => LinkTarget | undefined
): string {
  const parts: HashedPart[] = [markdown];
  const shown = imagesShownBy(source, markdown);
  // How a picture is published is part of what students see, so it belongs in
  // the answer to "has this changed?" — otherwise changing the rule above
  // fixes the pictures in documents published from tomorrow on and leaves
  // every already-published one showing the old, cut-off rendering, with the
  // plan reporting nothing to do. Folded in only when there are pictures, so a
  // document that shows none still hashes to its markdown alone.
  if (shown.length > 0) parts.push(`\0fit:${FIT_TO_COLUMN}\0`);
  for (const image of shown) {
    // The path goes in beside the bytes: showing the same picture from a
    // different file is a different document, even byte-for-byte identical.
    // A picture not drawn yet is recorded as absent rather than skipped, so
    // the day it arrives the document reads as changed.
    parts.push(`\0${image}\0`, bytesOf(repoRoot, image) ?? "absent");
  }
  // A cross-reference is published as text rather than as a link, which is a
  // different page from the one an earlier version of this program published
  // for the same markdown. Folded in only when there are links, so a document
  // making none is not republished for a change that does not touch it.
  if (links.length > 0) parts.push(`\0links:${LINK_RENDERING_VERSION}\0`);
  // Sorted, so the hash does not turn on the order the links happen to be
  // written in: reordering two paragraphs already changes the markdown itself.
  for (const link of [...links]
    .map((link) => ({
      path: `${link.target}${link.fragment}`,
      target: targetOf(link),
    }))
    // By code unit, as the default sort was before titles rode along, and not
    // by locale: a hash that came out differently on a machine set to another
    // language would report work to do that nobody asked for.
    .sort((one, other) =>
      one.path === other.path ? 0 : one.path < other.path ? -1 : 1
    )) {
    parts.push(`\0link\0${link.path}`);
    // A link is published as its target's title and Section: edit either in
    // the catalog and every page linking to it reads differently, which the
    // plan cannot see from the markdown alone. The same reason the bytes of a
    // picture are in here.
    if (link.target !== undefined) {
      parts.push(`\0title\0${link.target.title}`);
      parts.push(`\0section\0${link.target.section}`);
    }
  }
  return contentHash(parts);
}

/**
 * The contents of a picture, or `undefined` if it is not there.
 *
 * Publishing no longer reaches this with a missing file — a document showing a
 * picture that is not in the repository is refused by {@link embedImages}
 * before its hash is ever compared. The marker stays because the hash is
 * defined for any document, published or not, and a missing picture that reads
 * the same as an empty one would be a hash collision waiting for the day the
 * file arrives empty.
 */
function bytesOf(repoRoot: string, image: string): Buffer | undefined {
  try {
    return readFileSync(pathInside(repoRoot, image));
  } catch {
    return undefined;
  }
}
