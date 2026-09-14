// What the publisher puts in the course, and who each document is for.
//
// Membership is by explicit entry: nothing is discovered by walking a
// directory, so a document added to the repository later is not published by
// accident. Who a document is *for* is the one thing not written in the table
// — the `--instructor` suffix on its filename says it, and nothing else does.
import {
  DELIVERABLE_SOURCES,
  PROBE_SOURCES,
  INSTRUCTOR_TITLE_PREFIX,
  PUBLISHED,
  isInstructorMaterial,
} from "./lib/table.ts";
import { validate } from "./lib/guard.ts";
import { readCatalogFile } from "./lib/override.ts";

export type { PublishedEntry } from "./lib/table.ts";
export { isInstructorMaterial } from "./lib/table.ts";
export {
  InvalidRevealDate,
  ReservedSection,
  UnknownSection,
} from "./lib/guard.ts";
export { isRevealed } from "./lib/reveal.ts";

import type { SectionName } from "../course/index.ts";

import type { PublishedEntry } from "./lib/table.ts";

export interface Catalog {
  readonly published: readonly PublishedEntry[];
  /**
   * The documents whose front matter defines Deliverables — the assessment
   * grid, and nothing else. Read by `loadDeliverables` in this package's other
   * entry point.
   */
  readonly deliverableSources: readonly string[];
  /**
   * The documents whose front matter defines the Oral's probes — the assessment
   * grid, whose band criteria they are drawn from. Read by `loadProbes` in this
   * package's third entry point.
   */
  readonly probeSources: readonly string[];
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
 * The catalog, checked. Throws — naming the document — when an entry publishes
 * to a section the course page does not have, to the section the Devoirs live
 * in, or on a date the audit could not read, so that a mistaken edit fails
 * loudly before anything runs.
 *
 * `overridePath` replaces the in-code table with a JSON file of the same shape.
 * It exists for the tests, which drive the command line against a temporary
 * repository of fixture documents; production runs pass nothing.
 */
export function loadCatalog(overridePath?: string | undefined): Catalog {
  const catalog: Catalog =
    overridePath === undefined
      ? {
          published: PUBLISHED,
          deliverableSources: DELIVERABLE_SOURCES,
          probeSources: PROBE_SOURCES,
        }
      : readCatalogFile(overridePath);
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
 * into the table, so a document cannot be titled as instructor material without
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
      title: `${INSTRUCTOR_TITLE_PREFIX}${document.title}`,
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
 * the table writes, and the one a copy somebody made by hand would carry,
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
 * document the table no longer names.
 */
export function titleFor(catalog: Catalog, source: string): string {
  return (
    documentsToPublish(catalog).find((document) => document.source === source)
      ?.title ?? source
  );
}
