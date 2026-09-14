// An entry point: emptying a course so it can be built again from nothing.
//
// This is the only destructive thing the publisher does, and it exists because
// a course that is being designed gets built more than once. Everything else
// here is one-way and additive; this is the exception, and it is shaped so the
// exception is hard to trigger by accident:
//
//   - the course id is typed on the command line and must match the configured
//     one, so a stale .env cannot decide which course is emptied;
//   - reporting is the default and `--apply` is opt-in, as with publishing;
//   - what will be deleted is listed first, by name, including the activities
//     that will go down with their sections;
//   - a Devoir holding Submissions stops the run outright, because the one
//     thing in this course that exists nowhere else is a student's work;
//   - the manifest is emptied last, because a wiped course with a full
//     manifest is a course the next publish would decline to fill.
//
// "Zero" means Moodle's own top section (number 0) and nothing else. That
// section cannot be deleted; every other section, and every activity, goes.
import { clearManifest } from "../manifest/index.ts";

import type {
  CourseDriver,
  CourseItem,
  CourseSection,
  CourseSnapshot,
} from "../course/index.ts";
import type { Manifest } from "../manifest/index.ts";

export interface WipePlan {
  readonly courseId: string;
  /** Every section except number 0, highest first: the order they are removed in. */
  readonly sections: readonly CourseSection[];
  /** Every activity in the course, whatever section it sits in. */
  readonly items: readonly CourseItem[];
  /** How many published documents the manifest currently claims. */
  readonly manifestEntries: number;
}

/**
 * Refuses a plan holding an activity the course page could not properly
 * identify.
 *
 * A course module id and a course id are different numbers in different
 * namespaces, and `/course/mod.php?delete=` reads whatever it is given as the
 * first. An id that is in fact the course's would therefore delete some
 * unrelated activity elsewhere on the site — a real reading of the real course
 * produced exactly that before the course page was parsed properly, so this
 * stays as the check that a borrowed id never reaches a delete.
 *
 * It aborts rather than skipping the item: an unidentifiable activity means
 * the page was not understood, and "emptied the course, except the parts I
 * could not read" is a worse answer than stopping.
 */
function assertDeletable(items: readonly CourseItem[], courseId: string): void {
  const borrowed = items.filter((item) => item.moduleId === courseId);
  if (borrowed.length > 0) {
    throw new Error(
      `Aborting: ${borrowed.length} activit${borrowed.length === 1 ? "y" : "ies"} ` +
        `in course ${courseId} report the course's own id as their module id, ` +
        `so the course page was not read correctly. Deleting by those ids would ` +
        `address activities in other courses. Nothing has been deleted.`
    );
  }
  const nameless = items.filter((item) => item.name === "");
  if (nameless.length > 0) {
    throw new Error(
      `Aborting: ${nameless.length} activit${nameless.length === 1 ? "y" : "ies"} ` +
        `in course ${courseId} have no name (module ids ` +
        `${nameless.map((item) => item.moduleId).join(", ")}), so what would be ` +
        `deleted cannot be shown before it goes. Nothing has been deleted.`
    );
  }
}

export function buildWipePlan(
  snapshot: CourseSnapshot,
  manifest: Manifest
): WipePlan {
  assertDeletable(snapshot.items, snapshot.courseId);
  return {
    courseId: snapshot.courseId,
    // Deleting a section renumbers the ones after it, so they go from the
    // bottom of the course upwards and no number shifts under our feet.
    sections: [...snapshot.sections]
      .filter((section) => section.number !== 0)
      .sort((left, right) => right.number - left.number),
    items: [...snapshot.items],
    manifestEntries: Object.keys(manifest.entries).length,
  };
}

declare const checked: unique symbol;

/**
 * A {@link WipePlan} that {@link assertNoSubmissions} has counted and let
 * through.
 *
 * {@link applyWipe} takes one of these in place of a plain plan, and this is
 * the only file that can make one — the symbol it is branded with is never
 * exported — so no caller can delete a Devoir without having counted what it
 * holds first. The guard was a call the CLI remembered to make; it is now a
 * thing the module will not proceed without, which is the shape the course-id
 * guard already has inside `buildWipePlan`. A refusal that stands between a
 * Student's work and a delete should not rest on every future caller having
 * read the documentation.
 *
 * The mark is on the plan and not on a token beside it, so that what was
 * counted and what is deleted cannot come apart: a proof earned over one
 * course's plan will not let a different plan through.
 */
export type CheckedWipePlan = WipePlan & { readonly [checked]: true };

/**
 * Refuses a wipe over a course where a Devoir holds a Student's work.
 *
 * After the Freeze a Devoir holds thirty students' submissions, which exist
 * nowhere else in a form this course can read, and there is no undo: Moodle
 * takes the Submissions down with the activity. So this is a refusal and not a
 * confirmation — nothing to type past, no flag to add, nothing that can be
 * waved through at 23:00 while debugging something else. Making it overridable
 * would make it a prompt, and a prompt is a thing a tired person answers yes
 * to.
 *
 * It reports every Devoir it is refusing over rather than the first, and how
 * many Submissions each holds, so that what the instructor nearly did is on
 * the screen in full.
 *
 * A count that could not be read is the same refusal. "I could not tell, so I
 * deleted it" is never the outcome, and a driver reporting a number it is
 * unsure of is the failure this catches: the counts are gathered before
 * anything is deleted, so an unreadable one stops the run with the course
 * whole.
 *
 * A Devoir holding nothing wipes normally. The guard is over student work, not
 * over Devoirs, and a course nobody has handed anything into must stay as
 * rebuildable as it was.
 *
 * Hands the plan back as the {@link CheckedWipePlan} that {@link applyWipe}
 * requires, so that having run this is a precondition the compiler holds rather
 * than a convention.
 */
export async function assertNoSubmissions(
  plan: WipePlan,
  driver: CourseDriver
): Promise<CheckedWipePlan> {
  const held: { readonly item: CourseItem; readonly submissions: number }[] =
    [];
  for (const item of plan.items) {
    if (!item.devoir) continue;
    let submissions: number;
    try {
      submissions = await driver.countSubmissions(item.moduleId);
    } catch (error) {
      throw new Error(
        `Aborting: could not establish how many Submissions "${item.name}" ` +
          `(module ${item.moduleId}) holds, and a Devoir whose Submissions cannot ` +
          `be counted is never deleted. Nothing has been deleted. Check the Devoir ` +
          `in Moodle, and wipe again once the count can be read ` +
          `(${error instanceof Error ? error.message : String(error)}).`
      );
    }
    if (submissions > 0) held.push({ item, submissions });
  }
  if (held.length === 0) return plan as CheckedWipePlan;

  throw new Error(
    [
      `Aborting: ${held.length === 1 ? "a Devoir holds" : `${held.length} Devoirs hold`} ` +
        `work students have handed in, and emptying course ${plan.courseId} would delete it ` +
        `along with the activity:`,
      "",
      ...held.map(
        ({ item, submissions }) =>
          `  ${item.name} (module ${item.moduleId}): ` +
          `${submissions} Submission${submissions === 1 ? "" : "s"}`
      ),
      "",
      `Nothing has been deleted — not the Devoirs, not the other activities, not the ` +
        `sections, not the manifest. There is no flag that gets past this. If the work ` +
        `really is finished with, delete the ${held.length === 1 ? "Devoir" : "Devoirs"} ` +
        `by hand in Moodle first, and the wipe will run.`,
    ].join("\n")
  );
}

export function formatWipePlan(plan: WipePlan): string {
  if (plan.sections.length === 0 && plan.items.length === 0) {
    return `Course ${plan.courseId} is already empty: one top section, no activities.`;
  }

  const lines = [`Course ${plan.courseId} would be emptied:`, ""];
  for (const item of plan.items) {
    lines.push(
      `  delete activity  ${item.name} (module ${item.moduleId}, in "${item.section}")`
    );
  }
  for (const section of plan.sections) {
    lines.push(`  delete section   ${section.number}. ${section.name}`);
  }
  lines.push(
    "",
    `${plan.items.length} activit${plan.items.length === 1 ? "y" : "ies"} and ` +
      `${plan.sections.length} section${plan.sections.length === 1 ? "" : "s"}. ` +
      `Section 0 stays; it cannot be deleted.`
  );
  if (plan.manifestEntries > 0) {
    lines.push(
      `The manifest's ${plan.manifestEntries} entr${plan.manifestEntries === 1 ? "y" : "ies"} ` +
        `will be cleared, so the next publish rebuilds the course rather than skipping it.`
    );
  }
  return lines.join("\n");
}

export interface WipeOptions {
  readonly manifestPath: string;
  readonly driver: CourseDriver;
  /** Where progress goes: one line per deletion, as it happens. */
  readonly report: (line: string) => void;
}

/**
 * Carries out the plan. Activities first, then sections from the bottom up,
 * then the manifest.
 *
 * Activities are deleted individually even though deleting their section would
 * take them too: the report then names every activity that went, which is the
 * record the instructor has if something was in there that should not have
 * been.
 *
 * Takes only a {@link CheckedWipePlan} — the plan {@link assertNoSubmissions}
 * hands back — so nothing here can delete a Devoir whose Submissions were never
 * counted, and what is deleted is the plan that was counted.
 */
export async function applyWipe(
  plan: CheckedWipePlan,
  options: WipeOptions
): Promise<void> {
  for (const item of plan.items) {
    await options.driver.deleteItem(item.moduleId);
    options.report(`deleted activity  ${item.name} (module ${item.moduleId})`);
  }
  for (const section of plan.sections) {
    await options.driver.deleteSection(section.number);
    options.report(`deleted section   ${section.number}. ${section.name}`);
  }

  // Last, and only after the course really is empty: an interrupted wipe
  // leaves a manifest that still describes what is left standing.
  if (plan.manifestEntries > 0) {
    clearManifest(options.manifestPath);
    options.report(`cleared manifest  ${plan.manifestEntries} entries`);
  }
}
