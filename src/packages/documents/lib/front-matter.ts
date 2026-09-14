// Implementation: private to the documents package.
//
// Front matter is how a document carries something the *publisher* reads
// rather than something a student reads: today, the Deliverables the
// assessment grid defines. It sits at the top of the file, above the prose it
// has to agree with, so that the two are checked against each other by eye, in
// one diff.
//
// The parser is deliberately small. It reads the subset of YAML this
// repository writes — mappings, sequences of mappings, inline `[a, b]`
// sequences, strings and booleans — and refuses everything else rather than
// guessing. Front matter this program half-understood would be a Freeze nobody
// could see was wrong.

/** The delimiter line, at the very top of a file and again below the block. */
const DELIMITER = "---";

/** What front matter parses to: the shapes this subset can express. */
export type FrontMatterValue =
  | string
  | boolean
  | readonly FrontMatterValue[]
  | { readonly [key: string]: FrontMatterValue };

export type FrontMatter = { readonly [key: string]: FrontMatterValue };

/**
 * Front matter this program cannot read.
 *
 * Never a fallback to "no front matter": a block that is there and
 * unintelligible is an authoring mistake, and reading it as absence would
 * silently drop every Deliverable the document defines.
 */
export class MalformedFrontMatter extends Error {
  constructor(source: string, line: number, reason: string) {
    super(
      `Refusing to start: the front matter of "${source}" cannot be read — ${reason} (line ${line}). ` +
        `Front matter is written as YAML: keys and values, sequences introduced by "- ", ` +
        `indented with spaces. Fix the block at the top of the file, then run again.`
    );
    this.name = "MalformedFrontMatter";
  }
}

export interface SplitDocument {
  /** The block between the delimiters, or `undefined` when there is none. */
  readonly frontMatter: string | undefined;
  /** Everything below it: the document as a reader reads it. */
  readonly body: string;
}

/**
 * Splits a file into its front matter and its prose.
 *
 * A file that does not begin with the delimiter has no front matter — which is
 * every document but the grid — and its body is the whole file, byte for byte,
 * so that bringing front matter into this program does not change what any
 * other document publishes as.
 */
export function splitFrontMatter(text: string): SplitDocument {
  const lines = text.split("\n");
  if (lines[0]?.trimEnd() !== DELIMITER) {
    return { frontMatter: undefined, body: text };
  }
  const end = lines.findIndex(
    (line, at) => at > 0 && line.trimEnd() === DELIMITER
  );
  // An opening delimiter with no closing one is not front matter: it is a
  // document that happens to start with a horizontal rule.
  if (end === -1) return { frontMatter: undefined, body: text };
  return {
    frontMatter: lines.slice(1, end).join("\n"),
    body: lines
      .slice(end + 1)
      .join("\n")
      .replace(/^\n/, ""),
  };
}

interface Line {
  /** Line number in the file, for messages: the block starts at line 2. */
  readonly at: number;
  readonly indent: number;
  readonly text: string;
}

function significantLines(block: string): readonly Line[] {
  return block
    .split("\n")
    .map((raw, index): Line => ({
      at: index + 2,
      indent: raw.length - raw.trimStart().length,
      text: raw.trim(),
    }))
    .filter((line) => line.text !== "" && !line.text.startsWith("#"));
}

/** `key: value`, with the value possibly empty — a nested block follows. */
const KEY = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/;

/**
 * The parsed front matter of `block`, or `undefined` when there is none.
 *
 * `source` is carried only so that a refusal names the document: this parser
 * reads nothing off disk.
 */
export function parseFrontMatter(
  source: string,
  block: string | undefined
): FrontMatter | undefined {
  if (block === undefined) return undefined;
  const lines = significantLines(block);
  if (lines.length === 0) return {};
  const [value, next] = parseMapping(source, lines, 0, lines[0]?.indent ?? 0);
  if (next !== lines.length) {
    throw new MalformedFrontMatter(
      source,
      lines[next]?.at ?? 0,
      "this line is indented less than the block it belongs to"
    );
  }
  return value;
}

function parseMapping(
  source: string,
  lines: readonly Line[],
  from: number,
  indent: number
): [FrontMatter, number] {
  const mapping: Record<string, FrontMatterValue> = {};
  let at = from;
  while (at < lines.length) {
    const line = lines[at] as Line;
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new MalformedFrontMatter(
        source,
        line.at,
        "this line is indented further than the key above it"
      );
    }
    const match = KEY.exec(line.text);
    if (match === null) {
      throw new MalformedFrontMatter(
        source,
        line.at,
        `"${line.text}" is neither a "key: value" nor a "- " sequence item`
      );
    }
    const [, key = "", written = ""] = match;
    if (written !== "") {
      mapping[key] = scalar(written);
      at += 1;
      continue;
    }
    const [nested, next] = parseNested(source, lines, at + 1, indent, line);
    mapping[key] = nested;
    at = next;
  }
  return [mapping, at];
}

/** The block underneath a `key:` with nothing after the colon. */
function parseNested(
  source: string,
  lines: readonly Line[],
  from: number,
  indent: number,
  key: Line
): [FrontMatterValue, number] {
  const first = lines[from];
  if (first === undefined || first.indent <= indent) {
    throw new MalformedFrontMatter(
      source,
      key.at,
      `"${key.text}" has no value and nothing indented under it`
    );
  }
  return first.text.startsWith("- ")
    ? parseSequence(source, lines, from, first.indent)
    : parseMapping(source, lines, from, first.indent);
}

function parseSequence(
  source: string,
  lines: readonly Line[],
  from: number,
  indent: number
): [readonly FrontMatterValue[], number] {
  const items: FrontMatterValue[] = [];
  let at = from;
  while (at < lines.length) {
    const line = lines[at] as Line;
    if (line.indent < indent) break;
    if (!line.text.startsWith("- ")) break;
    const head = line.text.slice(2).trim();
    const match = KEY.exec(head);
    if (match === null) {
      items.push(scalar(head));
      at += 1;
      continue;
    }
    // `- id: c1-1` opens a mapping whose remaining keys are indented to where
    // `id` starts, two columns past the dash.
    const [item, next] = parseItemMapping(source, lines, at, indent + 2, match);
    items.push(item);
    at = next;
  }
  return [items, at];
}

function parseItemMapping(
  source: string,
  lines: readonly Line[],
  from: number,
  indent: number,
  head: RegExpExecArray
): [FrontMatter, number] {
  const line = lines[from] as Line;
  const [, key = "", written = ""] = head;
  const mapping: Record<string, FrontMatterValue> = {};
  let at = from + 1;
  if (written === "") {
    const [nested, next] = parseNested(source, lines, at, indent, line);
    mapping[key] = nested;
    at = next;
  } else {
    mapping[key] = scalar(written);
  }
  const [rest, next] = parseMapping(source, lines, at, indent);
  return [{ ...mapping, ...rest }, next];
}

/** `[a, b]` written on one line: the only flow form this subset reads. */
const FLOW_SEQUENCE = /^\[(.*)\]$/;

function scalar(written: string): FrontMatterValue {
  const flow = FLOW_SEQUENCE.exec(written);
  if (flow !== null) {
    const inner = (flow[1] ?? "").trim();
    if (inner === "") return [];
    return inner.split(",").map((entry) => unquote(entry.trim()));
  }
  if (written === "true") return true;
  if (written === "false") return false;
  return unquote(written);
}

function unquote(written: string): string {
  const quote = written[0];
  if (
    (quote === '"' || quote === "'") &&
    written.endsWith(quote) &&
    written.length > 1
  ) {
    return written.slice(1, -1);
  }
  return written;
}
