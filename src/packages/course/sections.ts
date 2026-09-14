// Reading a course page's sections — the part of it that is a decision rather
// than a scrape. The browser hands over the attributes each section carries;
// everything that follows from them is decided here, in the open, where it can
// be tested without a browser.

/**
 * One section `<li>`, exactly as the page carries it. Nothing is interpreted
 * on the way out of the browser: the driver reads these attributes and hands
 * them over verbatim, so that the reasoning below is the only place an
 * attribute is given a meaning.
 */
export interface SectionMarkup {
  readonly name: string;
  readonly dataNumber: string | null;
  /**
   * Moodle's `data-sectionid`. Despite the name this is the section's *number*
   * on the course page (0, 1, 2 …), not its database id — see
   * {@link readSections}.
   */
  readonly dataSectionId: string | null;
  /** Moodle's `data-id`: the row id in `course_sections`. */
  readonly dataId: string | null;
  /** The `id=` of an `editsection.php` link inside the section, if any. */
  readonly editSectionId: string | null;
  /**
   * The section `<li>`'s classes, verbatim. Moodle marks a hidden section with
   * a `hidden` class, and reading a class list is a scrape; deciding what it
   * means is not, so the decision is made below rather than in the browser.
   */
  readonly className: string;
}

/** One section as the publisher understands it. */
export interface ReadSection {
  /** The section's place on the course page. Section 0 is the top section. */
  readonly number: number;
  readonly name: string;
  /**
   * The database id, which is what `editsection.php?id=` takes. Undefined when
   * the page does not say, in which case the section can be read but not
   * written to.
   */
  readonly id: string | undefined;
  /** False when the course page marks the section hidden. */
  readonly visible: boolean;
}

/**
 * The sections of a course page, in the order the page lists them.
 *
 * The id and the number come from different attributes, and the trap is that
 * `data-sectionid` looks like it holds the id and holds the number. Addressing
 * `editsection.php?id=` with it is not a failed write: id 2 is a real section
 * of some other course, so the request lands somewhere else entirely and the
 * error that comes back is about a course the instructor has never seen. So
 * the id is taken only from attributes that really are ids — an
 * `editsection.php` link (present in edit mode, and unambiguous) or `data-id`
 * — and `data-sectionid` is read for what it holds: the number.
 */
export function readSections(
  markup: readonly SectionMarkup[]
): readonly ReadSection[] {
  return markup.map((section, index) => ({
    name: section.name.trim(),
    number: numberOf(section, index),
    id: section.editSectionId ?? section.dataId ?? undefined,
    visible: !isHidden(section),
  }));
}

/**
 * Whether the course page marks this section hidden.
 *
 * Matched on the whole class token rather than as a substring: a theme class
 * such as `section-hiddenfromstudents-badge` would otherwise make every
 * section read as hidden, and a section somebody hid by hand would be
 * indistinguishable from one they did not.
 */
function isHidden(section: SectionMarkup): boolean {
  return section.className.split(/\s+/).includes("hidden");
}

function numberOf(section: SectionMarkup, index: number): number {
  const stated = section.dataNumber ?? section.dataSectionId;
  if (stated === null) return index;
  const parsed = Number(stated);
  return Number.isInteger(parsed) ? parsed : index;
}

/**
 * What adding a section did to the course page.
 *
 * `nothing` is a real outcome rather than a defensive branch: under the
 * `format-flexsections` course format, the URL the driver uses to add a
 * section comes back having added none (issue #20). The count is what catches
 * it. Without
 * this check the driver takes "the last section" — which is then a section
 * that was already there, holding the instructor's own material — and renames
 * it, reporting a section it created.
 */
export type SectionAddition =
  | { readonly kind: "added"; readonly section: ReadSection }
  | { readonly kind: "nothing" }
  | { readonly kind: "unrecognisable"; readonly grew: number };

/**
 * The section that appeared between two readings of the course page.
 *
 * Identified by id rather than by position: a format is free to put a new
 * section anywhere, and "the last one" is a guess that is wrong silently.
 */
export function sectionAddedBy(
  before: readonly ReadSection[],
  after: readonly ReadSection[]
): SectionAddition {
  const grew = after.length - before.length;
  if (grew <= 0) return { kind: "nothing" };
  const known = new Set(before.map((section) => section.id));
  const appeared = after.filter(
    (section) => section.id !== undefined && !known.has(section.id)
  );
  if (grew !== 1 || appeared.length !== 1) {
    return { kind: "unrecognisable", grew };
  }
  return { kind: "added", section: appeared[0]! };
}
