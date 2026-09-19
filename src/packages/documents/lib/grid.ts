// Implementation: private to the documents package.
//
// The Assessment Grid a Student reads is assembled (ADR-0014): the Grid Frame,
// which this package ships, with the course's Competency blocks from its Grid
// Source written into it. The Frame is everything that is the same in every EPF
// course; the course writes one block per Competency, headed by its id alone,
// and the heading a Student reads is the id with its title from
// `competencies:`.
import { readFileSync } from "node:fs";

import { marked } from "./gfm.ts";

/** One Competency as the grid declares it: its id, and its title. */
export interface GridCompetency {
  readonly id: string;
  readonly title: string;
}

/** Where the Frame writes the course's Competency blocks. */
const COMPETENCY_BLOCKS = "{{competency blocks}}";

/**
 * The note the Frame opens with, for whoever reads it in the package. A
 * Student reads the Frame's prose, not its maintainers' notes.
 */
const LEADING_COMMENT = /^\s*<!--[\s\S]*?-->\s*/;

/**
 * The Grid Frame's text, as the package ships it: a markdown file people can
 * read, next to the Grid Source starter.
 */
function gridFrame(): string {
  const frame = new URL("../../../../docs/grid-frame.md", import.meta.url);
  return readFileSync(frame, "utf8").replace(LEADING_COMMENT, "");
}

/**
 * The Grid Source's body as its Competency blocks, by the id each is headed
 * with, each block without its heading.
 *
 * Split on the `##` headings a markdown reader finds, so a heading written in
 * a fenced block is the code it is and does not open a block.
 */
function blocksOf(body: string): ReadonlyMap<string, string> {
  const blocks = new Map<string, string>();
  let current: string | undefined;
  for (const token of marked.lexer(body)) {
    if (token.type === "heading" && token.depth === 2) {
      const id: string = token.text.trim();
      blocks.set(id, blocks.get(id) ?? "");
      current = id;
      continue;
    }
    if (current !== undefined) {
      blocks.set(current, `${blocks.get(current) ?? ""}${token.raw}`);
    }
  }
  return blocks;
}

/**
 * The Assessment Grid as a Student reads it, as markdown: the Grid Frame with
 * the course's block for each Competency written into it, in `C1…Cn` order,
 * each headed `## Cn — <title>`.
 *
 * Only the blocks are the course's: what `body` holds outside a block headed
 * by a declared Competency is not printed. A Grid Source holds nothing else.
 */
export function assembleGrid(
  body: string,
  competencies: readonly GridCompetency[]
): string {
  const blocks = blocksOf(body);
  const written = competencies
    .map(
      ({ id, title }) =>
        `## ${id} — ${title}\n\n${(blocks.get(id) ?? "").trim()}\n`
    )
    .join("\n---\n\n");
  return gridFrame().replace(COMPETENCY_BLOCKS, () => written.trimEnd());
}
