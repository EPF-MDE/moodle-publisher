// One entry of a course repository's `publisher.json`, and the rules its
// filename carries. A document being published at all is one entry; who it is
// for is the filename's to say, and nothing in the entry can say otherwise.
import type { SectionName } from "../../course/index.ts";

export interface PublishedEntry {
  /** Repository-relative path of the markdown source. */
  readonly source: string;
  /**
   * What a reader sees on the course page — never the filename.
   *
   * Plain, for instructor material as for anything else: the `Instructor — `
   * prefix an examiner reads is derived from the suffix at publish time, so
   * there is no entry that can carry the prefix without the hiding, or the
   * hiding without the prefix.
   */
  readonly title: string;
  readonly section: SectionName;
  /**
   * `YYYY-MM-DD`: the day the instructor reveals this document by hand.
   *
   * Its presence is what makes a student-facing document ship hidden. Absent —
   * which is every other entry — the document is created visible and is nobody's
   * decision but the course repository's.
   *
   * It is not a schedule. Nothing in this program reveals anything, on this
   * date or any other: the date is what the *audit* measures the course
   * against, so that a document found visible the week before is a failure and
   * the same document found visible on the day is not. Publishing on the
   * morning of the reveal, or an hour after it, does not change what students
   * can see either way — the publisher sets visibility on create and has no
   * way to write it again for a document with this policy.
   */
  readonly revealedOn?: string;
}

/**
 * The `--instructor` suffix, and the only thing that decides who a document is
 * for.
 *
 * A rule over the filename rather than a field, so that renaming a document is
 * the whole of the change: the file sits beside the student document it pairs
 * with, in that document's section, and what keeps it away from students is
 * what its name says it is.
 */
const INSTRUCTOR_SUFFIX = "--instructor.md";

/**
 * Whether `source` is material for examiners and no one else.
 *
 * Asked of the path, never of an entry: there is one place this is decided, so
 * a document cannot be named one thing and published as another. A document
 * listed without its suffix publishes visible, and nothing guards against it —
 * the filename *is* the statement.
 */
export function isInstructorMaterial(source: string): boolean {
  return source.endsWith(INSTRUCTOR_SUFFIX);
}

/** How an examiner reads the title of instructor material on the course page. */
export const INSTRUCTOR_TITLE_PREFIX = "Instructor — ";

/**
 * The title `entry` is published under: its own, with the prefix its filename
 * implies. Derived once, here, so the guard that refuses two documents sharing
 * a title asks about the same titles the course page will show.
 */
export function publishedTitle(entry: PublishedEntry): string {
  return isInstructorMaterial(entry.source)
    ? `${INSTRUCTOR_TITLE_PREFIX}${entry.title}`
    : entry.title;
}
