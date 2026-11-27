// How long the browser driver waits for Moodle, one reason per wait.

/** How long the instructor gets to complete the Microsoft login by hand. */
export const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * How long one page of a table may take to arrive.
 *
 * Playwright's default is thirty seconds, and the grading table of a Devoir the
 * whole cohort has handed into is the slowest page this program opens: Moodle
 * renders every Student, their status and their online text in one go, and on a
 * teaching afternoon it takes longer than that. A timeout there reads like a
 * broken run when what happened is that a slow page was given a desktop's
 * patience instead of a test's. Generous rather than absent: a page that never arrives still stops.
 */
export const TABLE_PAGE_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * How long a table that the page renders *after* it loads is waited for.
 *
 * Moodle 4 renders some of its tables that way: the page arrives with its
 * filters and its heading and no table at all, and fetches the rows over AJAX
 * a moment later. Read at `domcontentloaded` it is a page with no table on it —
 * which is indistinguishable, from out here, from a page this program failed
 * to understand, so a run would abort over a table that was merely still on
 * its way.
 *
 * Shorter than {@link TABLE_PAGE_TIMEOUT_MS} because nothing is being
 * downloaded by then: the page is in the browser and this is waiting on one
 * fetch. A table that never appears still ends in the caller's own refusal,
 * which is the one that says which page and why.
 */
export const TABLE_APPEARS_TIMEOUT_MS = 60 * 1000;

/**
 * How long a click that is allowed to fail may take before it is given up on.
 *
 * Opening a form's folded sections is best-effort: a section that is already
 * open, or a control this theme does not render, is not a failure. But a
 * best-effort click on something unclickable still waits Playwright's default
 * thirty seconds, and a handful of those is a run that looks hung on a page it
 * is merely being patient with. Two seconds is far longer than a control on a
 * loaded page needs, and short enough that a wrong guess costs nothing.
 */
export const OPTIONAL_CLICK_TIMEOUT_MS = 2000;

/**
 * How long a file manager gets to list what it holds, or to list it again
 * after a file is deleted or uploaded. Its listing is fetched from the site
 * after the form has rendered, so it is a wait on the network.
 */
export const FILE_MANAGER_TIMEOUT_MS = 30 * 1000;
