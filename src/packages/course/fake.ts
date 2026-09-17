// An entry point: the fake driver, an in-memory course kept in a JSON file so
// that consecutive command-line runs see each other's writes. This is what the
// tests drive, and the only driver that never touches Moodle.
import { openFakeCourse } from "./lib/fake-course.ts";

import type { CourseDriver } from "./index.ts";

/**
 * Opens the in-memory course stored at `path`, creating an empty one if the
 * file does not exist. The file may also carry `failCreateAfter`, which makes
 * the driver raise once that many activities have been created — the simulated
 * interrupted run.
 */
export function createFakeDriver(path: string, courseId: string): CourseDriver {
  return openFakeCourse(path, courseId);
}
