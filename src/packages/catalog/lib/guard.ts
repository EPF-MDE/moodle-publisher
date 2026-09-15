// The startup guard: every published document goes to a section the course
// page has and is allowed to name, and any reveal date it carries is one the
// audit can read.
import { DELIVERABLE_SECTION, SECTION_ORDER } from "../../course/index.ts";
import { isCalendarDate } from "./reveal.ts";

import type { PublishedEntry } from "./table.ts";

/**
 * A document is published to a section the course page does not have.
 *
 * The in-code table cannot say this — its sections are typed — but a catalog
 * read from a file is untyped by the time it gets here, and a section nobody
 * named would be created outside the order students read the page in.
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
 * A reveal date the audit cannot read.
 *
 * The in-code table cannot say this — a human wrote the string and a reviewer
 * read it — but a catalog read from a file is untyped by the time it gets
 * here. There is no safe reading: a date this program cannot compare against
 * would leave the gate permanently open or permanently shut, and either one is
 * a silent answer to the question the entry was added to ask.
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

export function validate(published: readonly PublishedEntry[]): void {
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
  }
}
