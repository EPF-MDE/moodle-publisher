// Reading what a course publishes from the `publisher.json` at the root of its
// repository. Every run reads it, against a real course or the fake one: the
// file may name what the course publishes, to students or to examiners; what
// it cannot do is publish instructor material visibly, because that is decided
// by the filename and not by anything written here. What it must do is name
// its grid.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PublishedEntry } from "./entry.ts";

/** Where a course repository says what it publishes. */
export const PUBLISHER_FILE = "publisher.json";

/**
 * The course repository has no `publisher.json`.
 *
 * No fallback: a run that found nothing to read must neither publish nothing
 * and call it done nor publish something the course never listed.
 */
export class MissingPublisherFile extends Error {
  constructor(path: string) {
    super(
      `Refusing to start: there is no ${path}. A course repository says what it ` +
        `publishes in it: { "grid": "assessment-grid.md", "published": [ … ] }.`
    );
    this.name = "MissingPublisherFile";
  }
}

/** `publisher.json` is there but is not the shape a run can read. */
export class UnreadablePublisherFile extends Error {
  constructor(path: string, reason: string) {
    super(`Refusing to start: cannot read ${path}. ${reason}`);
    this.name = "UnreadablePublisherFile";
  }
}

/**
 * A `publisher.json` that does not say which document is the grid.
 *
 * No default: the grid is where the Deliverables and the probes are read from,
 * and a file that forgot to name it must not publish Devoirs out of whichever
 * file a default happened to point at.
 */
export class NoGrid extends Error {
  constructor(path: string, grid: unknown) {
    const what =
      typeof grid === "string" || grid === undefined || grid === null
        ? `names no grid`
        : `has a "grid" that is ${typeof grid}, not a path`;
    super(
      `Refusing to start: ${path} ${what}. Set "grid" to the ` +
        `repository-relative path of the assessment grid, e.g. "assessment-grid.md".`
    );
    this.name = "NoGrid";
  }
}

interface PublisherFile {
  readonly grid?: unknown;
  readonly published?: unknown;
}

/**
 * The catalog `repoRoot` publishes, as written. Unchecked beyond its shape:
 * what each entry says is the guard's to refuse.
 */
export function readPublisherFile(repoRoot: string): {
  grid: string;
  published: readonly PublishedEntry[];
} {
  const path = join(repoRoot, PUBLISHER_FILE);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new MissingPublisherFile(path);
    throw new UnreadablePublisherFile(path, String(code ?? error));
  }

  let parsed: PublisherFile;
  try {
    parsed = JSON.parse(text) as PublisherFile;
  } catch (error) {
    throw new UnreadablePublisherFile(
      path,
      `It is not JSON: ${(error as Error).message}`
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new UnreadablePublisherFile(path, `It is not a JSON object.`);
  }
  if (typeof parsed.grid !== "string" || parsed.grid.trim() === "") {
    throw new NoGrid(path, parsed.grid);
  }
  if (!Array.isArray(parsed.published)) {
    const what =
      parsed.published === undefined
        ? `It has no "published"`
        : `"published" is not a list`;
    throw new UnreadablePublisherFile(
      path,
      `${what}: it must list the documents the course publishes, even when it lists none.`
    );
  }
  parsed.published.forEach((entry: unknown, index) =>
    assertEntryShape(path, entry, index + 1)
  );
  return {
    grid: parsed.grid,
    published: parsed.published as readonly PublishedEntry[],
  };
}

/**
 * Refuses an entry missing what every entry must carry, naming it by its
 * position — and by its source, once it has one — so the fix is findable.
 *
 * Only the shape: a section is a string here, and which strings are sections
 * is the guard's to say, with the list of them in the message.
 */
function assertEntryShape(path: string, entry: unknown, position: number): void {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new UnreadablePublisherFile(
      path,
      `"published" entry ${position} is not an object with a "source", a "title" and a "section".`
    );
  }
  const fields = entry as Record<string, unknown>;
  const named =
    typeof fields["source"] === "string" && fields["source"].trim() !== ""
      ? `"${fields["source"]}"`
      : `"published" entry ${position}`;
  for (const field of ["source", "title", "section"]) {
    const value = fields[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new UnreadablePublisherFile(path, `${named} has no "${field}".`);
    }
  }
  if (
    fields["revealedOn"] !== undefined &&
    typeof fields["revealedOn"] !== "string"
  ) {
    throw new UnreadablePublisherFile(
      path,
      `${named} has a "revealedOn" that is not a YYYY-MM-DD string.`
    );
  }
}
