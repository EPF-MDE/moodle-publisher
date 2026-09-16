// The startup guard: every published document goes to a section the course
// page has and is allowed to name, any reveal date it carries is a real date,
// and no two of them are published under one title.
//
// It guards every run. What a course publishes is read from its repository's
// `publisher.json`, untyped by the time it gets here, so nothing a compiler
// checked stands between a mistaken edit and a live course but this.
import { DELIVERABLE_SECTION, SECTION_ORDER } from "../../course/index.ts";
import { publishedTitle } from "./entry.ts";
import { isCalendarDate } from "./reveal.ts";

import type { PublishedEntry } from "./entry.ts";

/**
 * A document is published to a section the course page does not have.
 *
 * A section nobody named would be created outside the order students read the
 * page in.
 */
export class UnknownSection extends Error {
  constructor(source: string, section: string) {
    super(
      `Refusing to start: "${source}" is published to section "${section}", which is not a ` +
        `section of the course page. The sections are ${SECTION_ORDER.join(", ")}.`
    );
    this.name = "UnknownSection";
  }
}

/**
 * A document is published to the section the Devoirs live in.
 *
 * {@link UnknownSection} cannot catch this one: `Deliverables` *is* a section
 * of the course page, so the name passes every check that asks whether a
 * section exists. What it fails is who may name it — membership there is
 * derived from the grid's Deliverables, and a document arriving by a `section`
 * entry is the second way in that the design does not have.
 */
export class ReservedSection extends Error {
  constructor(source: string) {
    super(
      `Refusing to start: "${source}" is published to section "${DELIVERABLE_SECTION}", which ` +
        `holds the Devoirs and nothing else. What is in it is decided by the Deliverables the grid defines, ` +
        `not by an entry naming it. Publish the document to another section.`
    );
    this.name = "ReservedSection";
  }
}

/**
 * A reveal date that is not a date.
 *
 * There is no safe reading: a reviewer checking the course against a date
 * nobody can read has no way to say whether the document should still be
 * hidden, and a silent guess is an answer to the question the entry was added
 * to ask.
 */
export class InvalidRevealDate extends Error {
  constructor(source: string, revealedOn: string) {
    super(
      `Refusing to start: "${source}" is revealed on "${revealedOn}", which is not a date ` +
        `this program can read. Write it as YYYY-MM-DD, e.g. 2026-09-11.`
    );
    this.name = "InvalidRevealDate";
  }
}

/**
 * Two documents are published under one title, once the `Instructor — ` prefix
 * is derived.
 *
 * A title is how the planner recognises a document the manifest has lost, so
 * two documents sharing one would have a later run refuse to publish the second
 * over an activity that is not it — or, worse, take one for the other.
 */
export class DuplicateTitle extends Error {
  constructor(title: string, first: string, second: string) {
    super(
      `Refusing to start: "${first}" and "${second}" are both published as "${title}". ` +
        `A title is how the course page tells documents apart; give one of them another.`
    );
    this.name = "DuplicateTitle";
  }
}

export function validate(published: readonly PublishedEntry[]): void {
  const sourceByTitle = new Map<string, string>();
  for (const document of published) {
    if (!SECTION_ORDER.includes(document.section)) {
      throw new UnknownSection(document.source, document.section);
    }
    if (document.section === DELIVERABLE_SECTION) {
      throw new ReservedSection(document.source);
    }
    if (
      document.revealedOn !== undefined &&
      !isCalendarDate(document.revealedOn)
    ) {
      throw new InvalidRevealDate(document.source, document.revealedOn);
    }
    const title = publishedTitle(document);
    const earlier = sourceByTitle.get(title);
    if (earlier !== undefined) {
      throw new DuplicateTitle(title, earlier, document.source);
    }
    sourceByTitle.set(title, document.source);
  }
}
