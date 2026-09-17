// Implementation: private to the manifest package.
//
// The file is JSON, indented, with its keys sorted — it is read by humans in a
// diff at least as often as by this program.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { ManifestEntry, PageEntry } from "../index.ts";

export type Entries = Record<string, ManifestEntry>;

/**
 * An entry as the file may hold it.
 *
 * Either an entry that says what it is, or the one shape that does not: a page
 * written before entries had a kind. That is the whole of the backward
 * compatibility, and stating it as a second member rather than as an optional
 * field across the union is what makes it true — a Devoir with no kind is not
 * a file any run could have written, and a type admitting one would leave
 * {@link load} holding an entry it had no honest way to read.
 */
type StoredEntry =
  | ManifestEntry
  | (Omit<PageEntry, "kind"> & { readonly kind?: undefined })
  | RetiredEntry;

/**
 * An entry of a kind this program no longer writes.
 *
 * Grade Items were recorded here while the publisher prepared the Oral in
 * Moodle's gradebook (ADR-0002, superseded by ADR-0011). A manifest committed
 * then still holds them, and it is read all the same: each is dropped as it is
 * loaded, so the next write leaves it out. What it recorded stays in the
 * course, where deleting it is the Instructor's decision.
 */
interface RetiredEntry {
  readonly kind: (typeof RETIRED_KINDS)[number];
}

const RETIRED_KINDS = ["grade-item"] as const;

function isRetired(entry: StoredEntry): entry is RetiredEntry {
  return (RETIRED_KINDS as readonly (string | undefined)[]).includes(
    entry.kind
  );
}

interface ManifestFile {
  readonly version: 1;
  readonly documents: Record<string, StoredEntry>;
}

export function load(path: string): Entries {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(
    readFileSync(path, "utf8")
  ) as Partial<ManifestFile>;
  const entries: Entries = {};
  for (const [source, entry] of Object.entries(parsed.documents ?? {})) {
    if (isRetired(entry)) continue;
    entries[source] = withKind(source, entry);
  }
  return entries;
}

/**
 * An entry as this program works with it: whatever the file said, plus the
 * kind it is.
 *
 * The default is what keeps a manifest committed before this program knew
 * about kinds readable: it is read as the pages it records, which publishing
 * refuses by name and the Wipe clears. Only a kind the file
 * states can be anything else — there were no Devoirs in a manifest written
 * before there were kinds, so an entry that names its kind is
 * taken at its word and nothing else is inferred about it.
 *
 * An entry that says neither what it is nor which activity it records is not
 * defaulted into anything: this file decides what a later run leaves alone, and
 * an entry read as a page the course cannot be asked about is a document that
 * would be silently published a second time.
 */
function withKind(
  source: string,
  stored: Exclude<StoredEntry, RetiredEntry>
): ManifestEntry {
  if (stored.kind !== undefined) return stored;
  if ("moduleId" in stored) return { ...stored, kind: "page" };
  throw new Error(
    `Aborting: the manifest entry for "${source}" has no kind and no module id, ` +
      `so what it records cannot be worked out. Correct or remove the entry.`
  );
}

export function save(path: string, entries: Entries): void {
  const sorted: Entries = {};
  for (const key of Object.keys(entries).sort()) {
    const entry = entries[key];
    if (entry !== undefined) sorted[key] = entry;
  }
  const file: ManifestFile = { version: 1, documents: sorted };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
}
