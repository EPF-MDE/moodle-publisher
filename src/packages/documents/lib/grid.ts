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

import type { Token, Tokens } from "marked";

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
 * One `##` part of a Grid Source's body, as written: its heading, and the
 * first column of each table under it.
 */
export interface GridBlock {
  /** The heading's text, without its `## `. */
  readonly heading: string;
  /**
   * For each table in the block, in order, the first cell of each of its rows,
   * as plain text. Which table is the Band table, and what its cells have to
   * say, is the catalog's business.
   */
  readonly tables: readonly (readonly string[])[];
}

/** A `##` part of a body: its heading, and the tokens under it. */
interface HeadedPart {
  readonly heading: string;
  readonly tokens: readonly Token[];
}

/**
 * The `##` parts of `body`, in the order it writes them, a repeated heading as
 * many times as it is written. What comes before the first is in none.
 *
 * Split on the `##` headings a markdown reader finds, so a heading written in
 * a fenced block is the code it is and does not open a block.
 */
function partsOf(body: string): readonly HeadedPart[] {
  const parts: { heading: string; tokens: Token[] }[] = [];
  for (const token of marked.lexer(body)) {
    if (token.type === "heading" && token.depth === 2) {
      parts.push({ heading: token.text.trim(), tokens: [] });
      continue;
    }
    parts.at(-1)?.tokens.push(token);
  }
  return parts;
}

/** A table cell as a reader reads it: without its emphasis. */
function plainText(cell: Tokens.TableCell): string {
  return cell.text.replace(/[*_`]/g, "").trim();
}

/** The `##` parts of a Grid Source's `body`, as written, in order. */
export function gridBlocks(body: string): readonly GridBlock[] {
  return partsOf(body).map(({ heading, tokens }) => ({
    heading,
    tables: tokens
      .filter((token): token is Tokens.Table => token.type === "table")
      .map((table) =>
        table.rows.map(([first]) =>
          first === undefined ? "" : plainText(first)
        )
      ),
  }));
}

/**
 * The Grid Source's body as its Competency blocks, by the id each is headed
 * with, each block without its heading.
 */
function blocksOf(body: string): ReadonlyMap<string, string> {
  const blocks = new Map<string, string>();
  for (const { heading, tokens } of partsOf(body)) {
    const written = tokens.map((token) => token.raw).join("");
    blocks.set(heading, `${blocks.get(heading) ?? ""}${written}`);
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
