// The record of what has been published: repository-relative source path to
// Moodle course module id, section, content hash and timestamps.
//
// It is committed to the repository, so publishing from a second machine
// updates the existing activities instead of duplicating them, and a code
// review shows what publishing did. It is written as each item succeeds, never
// at the end of a run, so an interrupted run still leaves an accurate record.
//
// One file holds every kind of thing the publisher creates. Keeping any of it
// in a second file would recreate the failure `clearManifest` warns about
// below, one file behind the other: a course wiped with a full manifest beside
// it is a course the next publish declines to fill.
import { load, save } from "./lib/store.ts";

import type { PublishedAsset, SectionName } from "../course/index.ts";

/**
 * What the publisher has put in the course, one entry per key.
 *
 * The key is a repository-relative source path for everything that comes from
 * a file, and a `deliverable:` id for a Devoir. `kind` is what keeps them
 * apart: a Devoir carries a module id with different settings behind it, and
 * an entry that had to be asked "are you a page?" by looking for absent fields
 * would be an entry every reader guesses about. Each arrives as a new member here rather than as optional
 * fields on `PageEntry`, so that reading an entry never means guessing which
 * fields its neighbours left empty.
 */
export type ManifestEntry = PageEntry | DevoirEntry;

/**
 * A Deliverable published as a Moodle Devoir.
 *
 * It records the module id and what was published under it. The settings are
 * not recorded, because they are not a decision anyone made: online text, no
 * file upload, and both dates from the one Freeze in the front matter. What is
 * worth recording is the identity Moodle gave the activity — because that is
 * what makes a later run edit the Devoir students have already handed work
 * into rather than make a second one beside it — and what it was last written
 * with, because that is what makes the run after an edit do nothing.
 */
export interface DevoirEntry {
  readonly kind: "devoir";
  readonly moduleId: string;
  /**
   * Always the Deliverables section. Recorded all the same, because it is what
   * a reviewer compares the live course against, and an activity somebody moved
   * is exactly the thing that comparison is for.
   */
  readonly section: SectionName;
  /**
   * What the Devoir was last published as: its title, its description and its
   * Freeze, hashed together. This is what makes a second consecutive run
   * report nothing to do, and an edited Deliverable report an update.
   *
   * Optional, because the entries in this repository's own manifest were
   * written before a Devoir could be edited at all and carry no hash. An entry
   * without one cannot be called unchanged, so it is rewritten once and the
   * record is complete from then on — the same reading a picture recorded
   * without a hash gets.
   */
  readonly contentHash?: string;
  readonly publishedAt: string;
  readonly updatedAt: string;
}

/**
 * The key a Devoir is recorded under.
 *
 * A Deliverable has no source file of its own — it is one entry in the front
 * matter of a document that has many — so its key is its id, marked as what it
 * is. The prefix is written here and nowhere else, and it is what keeps the
 * one manifest file readable in a diff: a line beginning `deliverable:` is
 * plainly not a path, and nothing a repository could be made to contain can
 * collide with it.
 */
const DEVOIR_KEY_PREFIX = "deliverable:";

export function devoirKey(deliverableId: string): string {
  return `${DEVOIR_KEY_PREFIX}${deliverableId}`;
}

/**
 * What was recorded for the Deliverable with this id, or `undefined`.
 *
 * An entry under that key which is not a Devoir is reported as no entry at
 * all, so the caller's answer is "nothing has been published for this
 * Deliverable" — which is true, and is the reading that makes the run create
 * one rather than address a page as though it were a Devoir.
 */
export function devoirEntryFor(
  manifest: Manifest,
  deliverableId: string
): DevoirEntry | undefined {
  const entry = manifest.entries[devoirKey(deliverableId)];
  return entry?.kind === "devoir" ? entry : undefined;
}

/** A markdown document published as a Moodle page. */
export interface PageEntry {
  readonly kind: "page";
  readonly moduleId: string;
  readonly section: SectionName;
  readonly contentHash: string;
  readonly publishedAt: string;
  readonly updatedAt: string;
  /**
   * The pictures published with this document, and the URL the course served
   * each one at.
   *
   * Absent, rather than an empty list, for a document that shows none — which
   * is most of them, and all of them until this was added. The manifest is
   * read in a diff at least as often as by this program, and a field appearing
   * on every entry the first time a run touched it would bury the one entry
   * that actually changed.
   */
  readonly assets?: readonly RecordedAsset[];
}

/**
 * A picture as an entry on disk records it.
 *
 * The same thing a driver reports, except that its hash may be missing: this
 * file is committed, and the entries in it were written by earlier versions of
 * this program, one of which recorded a URL per picture and nothing else. The
 * type says so rather than asserting a field that is not in the file, because
 * what reads it — the plan, deciding what to upload — has an answer for the
 * absence: bytes whose hash nobody recorded cannot be called unchanged, so
 * they go up once and the record is complete from then on.
 */
export type RecordedAsset = Omit<PublishedAsset, "contentHash"> & {
  readonly contentHash?: string;
};

export interface Manifest {
  /** Keyed by repository-relative source path. */
  readonly entries: Readonly<Record<string, ManifestEntry>>;
}

/** The manifest at `path`, or an empty one if nothing has been published yet. */
export function readManifest(path: string): Manifest {
  return { entries: load(path) };
}

/**
 * Records one published document and writes the file immediately. Callers call
 * this per item, as it succeeds — that is the whole point of the manifest.
 */
export function recordPublished(
  path: string,
  source: string,
  entry: ManifestEntry
): Manifest {
  const entries = { ...load(path), [source]: entry };
  save(path, entries);
  return { entries };
}

/**
 * Empties the manifest.
 *
 * Only `wipe` does this, and it must: the manifest is what makes publishing
 * skip a document it has already published. Emptying a course while leaving
 * the manifest behind would make the very next `apply` skip everything and
 * report a course fully published that in fact holds nothing at all.
 */
export function clearManifest(path: string): Manifest {
  save(path, {});
  return { entries: {} };
}

/**
 * The page `source` was published as, if it was published at all.
 *
 * What `publish` asks, and it asks it this way because it is about
 * documents: an entry recording a Devoir is not one.
 * Narrowing here, once, is what saves every caller from remembering that the
 * record holds more than pages. The counterpart of {@link devoirEntryFor},
 * and it reads a non-page entry the same way: as nothing recorded. A document
 * and a Devoir cannot collide — their keys are shaped differently — so this is
 * not a case anyone has to plan for, it is the type saying that the plan for a
 * *document* only ever works in pages.
 *
 * There is deliberately no accessor that returns "whatever is under this key".
 * Every caller knows which kind it is asking about — it has a document in its
 * hand, or a Deliverable — and one that did not would have to re-discover the
 * union at every use. What reads the manifest as a whole reads
 * {@link Manifest.entries}, and reads it as the mixed thing it is.
 */
export function pageFor(
  manifest: Manifest,
  source: string
): PageEntry | undefined {
  const entry = manifest.entries[source];
  return entry?.kind === "page" ? entry : undefined;
}

/** Every page in the manifest, with the source path it was published from. */
export function pages(
  manifest: Manifest
): readonly (readonly [string, PageEntry])[] {
  return Object.entries(manifest.entries).flatMap(([source, entry]) =>
    entry.kind === "page" ? [[source, entry] as const] : []
  );
}
