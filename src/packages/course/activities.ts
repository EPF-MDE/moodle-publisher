// Reading an activity's visibility off a course page — the part of it that is
// a decision rather than a scrape. The browser hands over the classes the page
// carries; what they mean is decided here, in the open, where it can be tested
// without a browser. The same split as `sections.ts`, for the same reason.

/**
 * One activity as the course page carries it. Nothing is interpreted on the
 * way out of the browser.
 *
 * Two class lists, because Moodle 4 puts them on two elements: the `<li>` is
 * the activity, and the `<div class="activity-item">` inside it is the card
 * that carries the visibility state.
 */
export interface ActivityMarkup {
  /** The activity `<li>`'s classes, verbatim. */
  readonly className: string;
  /** The inner `.activity-item`'s classes, verbatim; empty when there is none. */
  readonly itemClassName: string;
}

/** What the course page says about who can see an activity. */
export interface ActivityVisibility {
  /** False when the course page marks the activity hidden from students. */
  readonly visible: boolean;
  /**
   * "Available but not shown on the course page": off the page with a URL that
   * still works. The publisher never creates an activity in this state.
   */
  readonly stealth: boolean;
}

/**
 * Whether the course page marks this activity hidden.
 *
 * Moodle 4 marks it `hiddenactivity`, on the `.activity-item` card *inside*
 * the activity `<li>` — not `hidden` on the `<li>` itself, which is where
 * Moodle marks a hidden *section* and where this program used to look. The
 * cost of looking in the wrong place was not a missed hide: the page was
 * hidden, was read back as visible, and a correct run aborted telling the
 * instructor to go and hide by hand something Moodle had already hidden. Both
 * are read, because `hidden` on the `<li>` is what older Moodles and other
 * themes use, and neither reading can make a visible activity look safe.
 *
 * Matched on whole class tokens, never as a substring: a theme class such as
 * `activity-hiddenactivity-badge` would otherwise report every activity
 * hidden, and instructor material that really is on the course page would be
 * reported as safe.
 */
function isHidden(activity: ActivityMarkup): boolean {
  return (
    tokens(activity.className).includes("hidden") ||
    tokens(activity.itemClassName).includes("hiddenactivity")
  );
}

/**
 * Whether the course page marks this activity stealthed.
 *
 * Read from both elements for the same reason as {@link isHidden}. A stealthed
 * activity is *not* hidden in Moodle's sense — it is available, merely off the
 * page — so an unrecognised stealth marker leaves the activity reading
 * visible, and instructor material that reads visible aborts the run. The
 * failure is loud either way.
 */
function isStealth(activity: ActivityMarkup): boolean {
  return (
    tokens(activity.className).includes("stealth") ||
    tokens(activity.itemClassName).includes("stealth")
  );
}

function tokens(className: string): readonly string[] {
  return className.split(/\s+/).filter((token) => token !== "");
}

/**
 * Whether the course page marks this activity a Devoir — Moodle's `assign`,
 * the one activity type in this course that can hold a Student's work.
 *
 * Read from the class Moodle stamps every activity with, `modtype_assign`, and
 * from the link the activity carries, which contains `/mod/assign/` — the
 * trailing slash is what does the work, because it is what keeps pre-4.0
 * `/mod/assignment/view.php` out. Both markers, because
 * either one alone is a single point of failure over a question whose wrong
 * answer is a deleted Devoir: a theme that rewrote the classes, or an activity
 * the page lists without its link, must not read as "not a Devoir".
 *
 * Matched on whole class tokens for the reason the visibility readings are —
 * `modtype_assignment`, the pre-4.0 module, is a different token and stays a
 * different answer — and it errs towards *yes*: an activity wrongly read as a
 * Devoir costs one page load and a count of zero, while one wrongly read as an
 * ordinary page is student work deleted with nothing said.
 */
export function readsAsDevoir(
  activity: ActivityMarkup,
  /** The href of the activity's own link, verbatim; empty for a label. */
  url: string
): boolean {
  return (
    tokens(activity.className).includes("modtype_assign") ||
    tokens(activity.itemClassName).includes("modtype_assign") ||
    url.includes("/mod/assign/")
  );
}

/**
 * The prefix Moodle classes every submission status with.
 *
 * Named once and shared with the selector that sweeps the rows up, so that a
 * Moodle which renamed it could not leave one half of the reading matching and
 * the other half silently answering zero.
 */
export const SUBMISSION_STATUS_PREFIX = "submissionstatus";

/**
 * The tokens carrying that prefix which are *not* a Submission: Moodle's own
 * mark for a Student who has handed in nothing at all, and the name of the
 * table the rows sit in.
 *
 * Deliberately short — everything else with the prefix is treated as work,
 * which costs a refusal at worst. Each token named here says plainly that
 * there is nothing to lose:
 *
 * - The bare prefix is the status of a Student who has never touched the
 *   Devoir. It is not the container class it reads like. Moodle's grading
 *   table builds the class as `'submissionstatus' . $displaystatus` and sets
 *   `$displaystatus = ''` when the status is `new`, so the bare token is what
 *   an untouched row actually carries and `submissionstatusnew` is a class
 *   core never renders. Read live off this course's Devoirs, where every row
 *   is `<div class="submissionstatus">Pas de travail remis</div>`: counting
 *   those as work would have called a course nobody has handed into
 *   unrebuildable.
 * - `submissionstatustable` names the table around every row, submitted or not.
 *
 * Both are whole tokens, and matched as whole tokens below: a status this
 * program has never seen still counts as work, because `submissionstatusdraft`,
 * `...submitted` and `...reopened` — the three the same code path renders when
 * there *is* something to lose — all keep their suffix.
 */
const NOT_A_SUBMISSION = new Set([
  SUBMISSION_STATUS_PREFIX,
  `${SUBMISSION_STATUS_PREFIX}new`,
  `${SUBMISSION_STATUS_PREFIX}table`,
]);

/**
 * Whether one row of the grading table says a Student has a Submission in the
 * Devoir.
 *
 * The browser hands over the class attributes it found on and inside the row
 * and interprets none of them; what they mean is decided here, in the open,
 * where it can be tested without a Moodle holding thirty students' work. The
 * same split as the visibility readings above, for the same reason.
 *
 * Matched on whole class tokens. The reading this replaced asked a CSS
 * selector for a *substring* of `submissionstatus`, which the table's own
 * `submissionstatustable` wrapper satisfies on every row — so a Devoir with
 * Students enrolled and nothing handed in read as holding Submissions, and a
 * course nobody had used could not be rebuilt.
 *
 * Everything carrying the prefix and not named in {@link NOT_A_SUBMISSION}
 * counts, rather than a closed list of the three statuses Moodle ships. A draft
 * counts: it is work a Student has typed into the Devoir and not sent, and it
 * goes down with the activity exactly as a submitted one does. A status this
 * program has never seen counts too, because the two ways of being wrong do not
 * cost the same — an over-count is a refusal and a look in Moodle, an
 * under-count is a Student's work deleted with nothing said.
 */
export function readsAsHoldingSubmissions(
  /** Class attributes found on the row and its descendants, verbatim. */
  classNames: readonly string[]
): boolean {
  return classNames.some((className) =>
    tokens(className).some(
      (token) =>
        token.startsWith(SUBMISSION_STATUS_PREFIX) &&
        !NOT_A_SUBMISSION.has(token)
    )
  );
}

/**
 * What creating an activity did to the course page.
 *
 * The mirror of `sectionAddedBy` in `sections.ts`, and it exists for the same
 * reason: the thing that appeared has to be identified by what appeared, not
 * by what it is called. Two activities may carry the same name — a copy left
 * in the section a document has just been moved out of is exactly that case —
 * and the course page lists the older one first.
 */
export type ActivityAddition<Activity> =
  | { readonly kind: "added"; readonly activity: Activity }
  | { readonly kind: "nothing" }
  | { readonly kind: "unrecognisable"; readonly appeared: number };

/**
 * The activity that appeared between two readings of the course page.
 *
 * Identified by module id, which is the only thing about an activity that is
 * unique and that Moodle chose: a match on the name returns whichever copy the
 * page happens to list first, and recording that one means the manifest points
 * at an activity this run did not create — so every later update rewrites the
 * wrong page, and the read-back that is supposed to prove the new activity is
 * hidden proves it of the old one instead.
 */
export function activityAddedBy<Activity extends { readonly moduleId: string }>(
  before: readonly Activity[],
  after: readonly Activity[]
): ActivityAddition<Activity> {
  const known = new Set(before.map((activity) => activity.moduleId));
  const appeared = after.filter((activity) => !known.has(activity.moduleId));
  if (appeared.length === 0) return { kind: "nothing" };
  if (appeared.length > 1) {
    return { kind: "unrecognisable", appeared: appeared.length };
  }
  return { kind: "added", activity: appeared[0]! };
}

/** What the course page says about who can see this activity. */
export function readActivityVisibility(
  activity: ActivityMarkup
): ActivityVisibility {
  return { visible: !isHidden(activity), stealth: isStealth(activity) };
}
