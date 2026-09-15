// An entry point: what a row of Moodle's participants table and a row of its
// grading table mean, decided out here rather than in the browser.
//
// The same split `activities.ts` makes, for the same reason: the driver reads
// text and hrefs off a page and judges nothing, and what those readings mean is
// a pure function a test can reach without a browser. Both readings below are
// deliberately markup-independent — they look for the shape of an email and the
// shape of a link — because the two tables they read are the ones Moodle's
// themes, its identity settings and its versions rearrange most, and a column
// position is exactly the thing that would silently move.

/**
 * An email address, as a whole cell.
 *
 * Anchored, so a cell of prose that happens to contain an address is not read
 * as one: what is wanted is the cell that *is* the email, and a looser match
 * would take the first plausible thing on the row.
 *
 * The local part and the domain are both taken as opaque. Two domains are in
 * use on this course — `@epf.fr` and `@epfedu.fr` — and neither means
 * anything: nothing here, and nothing downstream of here, reads a domain.
 */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * The email address among `cells`, if exactly one of them is one.
 *
 * Undefined when none is, which is a real state and not a failure of this
 * function: Moodle shows the email column only when the course's identity
 * settings say to. What follows from it — an abort naming the Student, because
 * a sheet must never be silently dropped — is the caller's to decide.
 *
 * Undefined too when several are, which is the case worth being careful about:
 * a table showing both an email and an alternate email gives no way to tell
 * which one the Student is enrolled under, and picking the first would address
 * a Probe Sheet to an identity nothing else in the course uses.
 */
export function emailIn(cells: readonly string[]): string | undefined {
  const found = cells
    .map((cell) => cell.trim())
    .filter((cell) => EMAIL.test(cell));
  const [email, second] = found;
  return second === undefined ? email : undefined;
}

/** Moodle shortens an online-text summary and marks where it cut it. */
const SHORTENED = /(\.\.\.|…)\s*$/;

/**
 * The URL a Student handed in, read off one row of the grading table.
 *
 * Links first, and only links to somewhere other than this Moodle. Moodle
 * renders a submitted URL as an anchor whose `href` is the whole address, while
 * the text beside it is a *summary* that Moodle may have shortened — and a
 * repository URL cut at 140 characters is a link that leads nowhere, which is
 * worse than no link at all, because it looks like one. Every link the row's
 * own furniture carries — the grader, the profile, the download — is on this
 * Moodle, so leaving those out is what makes the remaining one the Student's.
 *
 * Falling back to the text is for the Moodle that does not auto-link, and it
 * refuses a summary that was shortened rather than returning the part it can
 * see. The caller has an abort for undefined; it does not have one for a URL
 * that is subtly wrong.
 */
export function submittedUrl(
  hrefs: readonly string[],
  text: string,
  baseUrl: string
): string | undefined {
  let site: string;
  try {
    site = new URL(baseUrl).host;
  } catch {
    site = "";
  }
  for (const href of hrefs) {
    let url: URL;
    try {
      url = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (
      url.host !== site &&
      (url.protocol === "https:" || url.protocol === "http:")
    ) {
      return url.toString();
    }
  }
  if (SHORTENED.test(text)) return undefined;
  const written = /https?:\/\/[^\s<>"']+/.exec(text)?.[0];
  if (written === undefined) return undefined;
  try {
    return new URL(written).host === site ? undefined : written;
  } catch {
    return undefined;
  }
}

/**
 * The role names that mean "a Student sitting this course".
 *
 * Two spellings, because the participants table is rendered in whatever
 * language the reader's Moodle is set to and this course is taught in a French
 * installation read by an English-speaking Instructor. Nothing else is
 * translated here: every other role — Teacher, Non-editing teacher, Manager —
 * is simply not one of these, and the check below is a membership test rather
 * than a list of everybody who is not a Student.
 */
const STUDENT_ROLES = new Set(["student", "étudiant", "etudiant"]);

/**
 * Whether the roles a participants row carries make this person a Student.
 *
 * A Probe Sheet is prepared for a Student who sits an Oral. The participants
 * table lists everybody enrolled — the Instructor, a co-teacher, an observer —
 * and giving each of them a sheet per Competency pads the file the Instructor reads with
 * rows for people who will never be examined, and pads the gradebook import
 * that file feeds with users who have no business having a Band.
 *
 * Several roles at once is a Student who also helps teach, and they still sit
 * the Oral: any Student role among them is enough. The cell is split on the
 * commas Moodle joins roles with, and each part is compared whole, so that a
 * role called "Student mentor" is not read as a Student.
 */
export function enrolsAsStudent(roles: string): boolean {
  return roles
    .split(",")
    .map((role) => role.trim().toLowerCase())
    .some((role) => STUDENT_ROLES.has(role));
}
