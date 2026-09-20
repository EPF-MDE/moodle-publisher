// Implementation: private to the documents package.
//
// The Assessment Grid a Student reads is assembled (ADR-0014): the Grid Frame,
// which this package ships, with the course's Competency blocks from its Grid
// Source written into it. The Frame is everything that is the same in every EPF
// course; the course writes one block per Competency, headed by its id alone,
// and the heading a Student reads is the id with its title from
// `competencies:`. Where the Frame states the course's facts — the course, the
// programme, the term, the Oral and each Freeze — it writes them from what it is
// handed, never from the course's prose. Three of them are the course's to have
// at all: the Rehearsal, the Reading Day and the Oral's timetable are printed
// where the course declares them, and nothing is printed where it does not.
import { readFileSync } from "node:fs";

import { marked } from "./gfm.ts";

import type { Token, Tokens } from "marked";

/** One Competency as the grid declares it: its id, and its title. */
export interface GridCompetency {
  readonly id: string;
  readonly title: string;
}

/** The Rehearsal, as the Frame states it, for a course that holds one. */
export interface GridRehearsal {
  /** When it is held, as a Student reads it, e.g. `11 December`. */
  readonly when: string;
  /** How long it lasts, e.g. `3 hours`. */
  readonly length: string;
}

/** The Reading Day, as the Frame states it, for a course that has one. */
export interface GridReadingDay {
  /** When the work is read, as a Student reads it, e.g. `4 January at 09:00`. */
  readonly when: string;
}

/** One row of the Oral's timetable: when in the Oral, and what happens then. */
export interface GridTimetableRow {
  /** Where in the Oral it falls, e.g. `0:00–2:00`. */
  readonly at: string;
  /** What happens then, e.g. `C1 question`. */
  readonly what: string;
}

/** One Freeze as the Frame states it. */
export interface GridFreeze {
  /** The Deliverable's title: what is handed in. */
  readonly title: string;
  /** When, as a Student reads it: a time and a date in Paris. */
  readonly at: string;
}

/**
 * The course's facts the Grid Frame writes into itself, each printed as
 * written.
 *
 * The programme, the term and the Oral repeat the catalog's reading of the
 * Grid Source rather than import it: the catalog reads front matter through
 * this package, so this package cannot depend on the catalog.
 */
export interface GridFrameFacts {
  /** What the Course is called, from `publisher.json`. */
  readonly course: string;
  readonly programme: string;
  readonly term: string;
  readonly oral: {
    readonly length: string;
    readonly when: string;
    /**
     * The Oral minute by minute, in the order the course writes it, or
     * `undefined` for a course that states no timetable — in which case the
     * Frame says nothing about one.
     */
    readonly timetable?: readonly GridTimetableRow[];
  };
  /** The Rehearsal, or `undefined` for a course that holds none. */
  readonly rehearsal?: GridRehearsal;
  /** The Reading Day, or `undefined` for a course that has none. */
  readonly readingDay?: GridReadingDay;
  /** One per Deliverable, in the order they fall. */
  readonly freezes: readonly GridFreeze[];
  readonly competencies: readonly GridCompetency[];
}

/**
 * A slot in the Frame, `{{name}}`: where it writes one of the course's facts,
 * or its Competency blocks.
 */
const SLOT = /\{\{([a-z ]+)\}\}/g;

/**
 * A region of the Frame the course may or may not have: what it writes about
 * the Rehearsal, the Reading Day or the Oral's timetable, between
 * `<!-- if name -->` and `<!-- end if -->`, and the blank line below it.
 *
 * The prose stays in the Frame, where it can be read and improved, rather than
 * being built here; what the course decides is only whether it is printed.
 */
const REGION = /<!-- if ([a-z ]+) -->\n([\s\S]*?)\n<!-- end if -->\n\n/g;

/** An `<!-- if … -->` the region rule did not recognise, in the Frame. */
const UNRESOLVED = /<!-- (?:if|end if)/;

/**
 * The note the Frame opens with, for whoever reads it in the package. A
 * Student reads the Frame's prose, not its maintainers' notes.
 *
 * It ends at the first `-->` written on a line of its own, so that the note
 * can quote the markers of an optional region without closing itself.
 */
const LEADING_COMMENT = /^\s*<!--[\s\S]*?\n-->\s*/;

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
 * the course's facts written into its slots, and the course's block for each
 * Competency written into it, in `C1…Cn` order, each headed `## Cn — <title>`.
 *
 * Only the blocks are the course's: what `body` holds outside a block headed
 * by a declared Competency is not printed. A Grid Source holds nothing else.
 *
 * A region of the Frame about something this course does not have — no
 * Rehearsal, no Reading Day, no timetable — is left out whole, so the grid
 * reads as if the Frame never named it.
 */
export function assembleGrid(body: string, facts: GridFrameFacts): string {
  const blocks = blocksOf(body);
  const written = facts.competencies
    .map(
      ({ id, title }) =>
        `## ${id} — ${title}\n\n${(blocks.get(id) ?? "").trim()}\n`
    )
    .join("\n---\n\n");
  const slots = new Map<string, string>([
    ["course", facts.course],
    ["programme", facts.programme],
    ["term", facts.term],
    ["oral length", facts.oral.length],
    ["oral when", facts.oral.when],
    [
      "freezes",
      facts.freezes
        .map(({ title, at }) => `- **Freeze** for ${title}: ${at}.`)
        .join("\n"),
    ],
    ["competency blocks", written.trimEnd()],
  ]);
  // What this course has of the three the Frame states only where they exist.
  const declared = new Set<string>();
  const { rehearsal, readingDay, oral } = facts;
  if (rehearsal !== undefined) {
    declared.add("rehearsal");
    slots.set("rehearsal when", rehearsal.when);
    slots.set("rehearsal length", rehearsal.length);
  }
  if (readingDay !== undefined) {
    declared.add("reading day");
    slots.set("reading day when", readingDay.when);
  }
  if (oral.timetable !== undefined) {
    declared.add("oral timetable");
    slots.set(
      "oral timetable",
      oral.timetable
        .map(({ at, what }) => `| ${cell(at)} | ${cell(what)} |`)
        .join("\n")
    );
  }
  // The regions first: a slot inside a region the course left out is one
  // nothing fills, and removing the region is what makes that right rather
  // than a refusal.
  const frame = gridFrame().replace(
    REGION,
    (_region, name: string, prose: string) =>
      declared.has(name) ? `${prose}\n\n` : ""
  );
  // As for a slot: an `<!-- if … -->` left standing is the Frame's own
  // mistake — a region written without the blank line below it, say — and it
  // would print as nothing at all, silently dropping what it holds. Asked of
  // the Frame alone, before the course's own text is written in, so that the
  // blame the message lays stays where it belongs.
  if (UNRESOLVED.test(frame)) {
    throw new Error(
      `The Grid Frame has an "<!-- if … -->" region this program could not read.`
    );
  }
  return frame.replace(SLOT, (slot, name: string) => {
    const value = slots.get(name);
    // A slot the Frame names and nothing fills is the package's own mistake,
    // and printing it would show a Student `{{…}}` in their grid.
    if (value === undefined) {
      throw new Error(`The Grid Frame has a slot "${slot}" nothing fills.`);
    }
    return value;
  });
}

/**
 * One cell of the timetable, as a row of a markdown table can carry it: a `|`
 * the course wrote in its prose is escaped rather than splitting the row into
 * columns nobody asked for, and a line break becomes a space, because a row is
 * one line. What a Student reads is what the course wrote.
 */
function cell(written: string): string {
  return written.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}
