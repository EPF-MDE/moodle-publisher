// What the publisher puts in the course, and who each document is for.
//
// Membership is by explicit entry: nothing is discovered by walking a
// directory, so a document added to the repository later is not published by
// accident. The entries are the course repository's own, in the
// `publisher.json` at its root; what stays here is what every course shares.
// Who a document is *for* is the one thing not written in an entry — the
// `--instructor` suffix on its filename says it, and nothing else does.
import {
  INSTRUCTOR_TITLE_PREFIX,
  isInstructorMaterial,
  publishedTitle,
} from "./lib/entry.ts";
import { validate } from "./lib/guard.ts";
import { readPublisherFile } from "./lib/publisher-file.ts";

export type { PublishedEntry } from "./lib/entry.ts";
export {
  DuplicateTitle,
  InvalidRevealDate,
  ReservedSection,
  UnknownSection,
} from "./lib/guard.ts";
export {
  MissingPublisherFile,
  NoGrid,
  UnreadablePublisherFile,
} from "./lib/publisher-file.ts";
export { isRevealed } from "./lib/reveal.ts";

import type { SectionName } from "../course/index.ts";

import type { PublishedEntry } from "./lib/entry.ts";

export interface Catalog {
  /**
   * The repository-relative path of the assessment grid, whose front matter
   * declares the Competencies and defines the Deliverables and the Oral's
   * probes. Read by `loadCompetencies`, `loadDeliverables` and `loadProbes` in
   * this package's other entry points.
   */
  readonly grid: string;
  readonly published: readonly PublishedEntry[];
  /**
   * The `feedbackLetter` block, as written, or `undefined`. Read and checked by
   * `loadFeedbackLetter` in this package's `feedback-letter.ts`, and by nothing
   * that writes to a course.
   */
  readonly feedbackLetter?: unknown;
}

/**
 * What the publisher does about a document's visibility after it has created
 * it.
 *
 * - `manual` — visibility is set on create and never touched again. Revealing
 *   is the instructor's decision, and a publisher that reasserted visibility
 *   would undo it silently the next time a typo was fixed.
 * - `enforced-hidden` — created hidden, and re-hidden on every later run that
 *   finds it visible. This is the only case in which the publisher writes
 *   visibility outside a create, and it can only ever conceal.
 */
export type VisibilityPolicy = "manual" | "enforced-hidden";

/**
 * One document as everything downstream of the catalog sees it: a source, the
 * title it is published under, a section and what is done about its
 * visibility.
 *
 * The planner, the apply step and the manifest work in these rather than in
 * table entries, because the two differ: the title here carries the
 * `Instructor — ` prefix the entry does not, and the visibility policy the
 * filename implies is written down once, here.
 */
export interface PublishedDocument {
  readonly source: string;
  readonly title: string;
  readonly section: SectionName;
  /**
   * Material for examiners and no one else.
   *
   * Carried down rather than inferred from {@link visibility}, which happens to
   * agree with it today. The two answer different questions: visibility is what
   * the publisher does about an activity after it exists, and this is who may
   * be sent to it. Reading one off the other would make the link rules say
   * "a hidden document" where they mean "examiner-only material", and the C3
   * brief is the counterexample already in the table — hidden on the day it
   * ships, and student-facing all the same.
   */
  readonly instructorMaterial: boolean;
  readonly visibility: VisibilityPolicy;
  /**
   * Whether the activity is visible at the moment it is made. The only
   * visibility a `manual` document ever gets from this program, and the reason
   * there is no moment between a document being created and being hidden.
   */
  readonly visibleOnCreate: boolean;
  /**
   * `YYYY-MM-DD`, when a human reveals this document by hand on a known day.
   *
   * Carried down from the table for the audit alone, which is the only thing
   * that reads it: a document found visible before this date is a finding, and
   * on or after it the audit reports what it saw and leaves it alone. Nothing
   * that writes to the course looks at this.
   */
  readonly revealedOn: string | undefined;
}

/**
 * The catalog of the course repository at `repoRoot`, read from its
 * `publisher.json` and checked. Every run reads it, real or fake.
 *
 * Throws when the file is missing or cannot be read, and — naming the document
 * — when an entry publishes to a section the course page does not have, to the
 * section the Devoirs live in, on a date the audit could not read, or under a
 * title another document already has, so that a mistaken edit fails loudly
 * before anything runs.
 */
export function loadCatalog(repoRoot: string): Catalog {
  const catalog: Catalog = readPublisherFile(repoRoot);
  validate(catalog.published);
  return catalog;
}

/**
 * Every document the publisher will put in the course, each carrying the
 * visibility policy and the title its filename implies.
 *
 * This is where the `--instructor` suffix becomes everything that follows from
 * it: the prefix an examiner reads, the hiding on create, and the re-hiding of
 * anything a later run finds revealed. Derived here, once, rather than typed
 * into an entry, so a document cannot be titled as instructor material without
 * being hidden as instructor material.
 */
export function documentsToPublish(
  catalog: Catalog
): readonly PublishedDocument[] {
  return catalog.published.map((document): PublishedDocument => {
    if (!isInstructorMaterial(document.source)) {
      return {
        ...document,
        instructorMaterial: false,
        visibility: "manual",
        // A reveal date is what makes a document ship hidden: the instructor
        // opens it on the day, and no later run can take that back, because
        // `manual` has no way to write visibility again.
        visibleOnCreate: document.revealedOn === undefined,
        revealedOn: document.revealedOn,
      };
    }
    return {
      ...document,
      title: publishedTitle(document),
      instructorMaterial: true,
      visibility: "enforced-hidden",
      visibleOnCreate: false,
      // Never revealed, so there is no day to measure the course against. What
      // guards this material is the re-hiding, not a date.
      revealedOn: undefined,
    };
  });
}

/**
 * A document's title with the `Instructor — ` prefix taken back off: the title
 * the entry writes, and the one a copy somebody made by hand would carry,
 * because nothing they did put the prefix there.
 *
 * Here rather than in the audit so that the prefix stays one string known to
 * one package — whoever changes what the publisher writes changes what
 * recognises it, in the same file.
 */
export function plainTitle(document: PublishedDocument): string {
  return document.title.startsWith(INSTRUCTOR_TITLE_PREFIX)
    ? document.title.slice(INSTRUCTOR_TITLE_PREFIX.length)
    : document.title;
}

/**
 * The human title a document is published under, for messages about it. Falls
 * back to the source path, which is the only honest thing to say about a
 * document the catalog no longer names.
 */
export function titleFor(catalog: Catalog, source: string): string {
  return (
    documentsToPublish(catalog).find((document) => document.source === source)
      ?.title ?? source
  );
}
