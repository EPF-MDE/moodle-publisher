// An entry point: the fake driver, an in-memory course kept in a JSON file so
// that consecutive command-line runs see each other's writes. This is what the
// tests drive, and the only driver that never touches Moodle.
import { openFakeCourse } from "./lib/fake-course.ts";

import type { CourseDriver } from "./index.ts";

/**
 * One Student's pair of cells in one Grade Item, as the fake's course file
 * stores them: the Band, and the Probe Sheet in the feedback beside it.
 *
 * Exported for the tests that read a row back — the shape is the fake's, and
 * spelling it out again in a fixture and again in a helper is three places to
 * keep in step. Nothing on the driver hands one out: no command in this program
 * reads a Band out of a course (ADR-0002), and this is a file on disk rather
 * than a course.
 */
export type { GradebookRow } from "./lib/fake-course.ts";

/**
 * Opens the in-memory course stored at `path`, creating an empty one if the
 * file does not exist. The file may also carry `failCreateAfter`, which makes
 * the driver raise once that many pages have been created — the simulated
 * interrupted run.
 */
export function createFakeDriver(path: string, courseId: string): CourseDriver {
  return openFakeCourse(path, courseId);
}
