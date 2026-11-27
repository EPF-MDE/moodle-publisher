import { activityAddedBy } from "../../activities.ts";
import type { CourseItem } from "../../index.ts";
import type { DriverSession } from "./navigation.ts";

/** Reading back what a create or an update left on the course page. */
export function createActivityChecks(session: DriverSession) {
  const { options } = session;

  /**
   * The activity an update just rewrote, and the check that the form was
   * honoured at all.
   *
   * The counterpart of {@link createdActivity}, and it exists for the same
   * reason: an update form a future Moodle stops honouring would otherwise
   * report a document republished — or a Devoir's Freeze moved — while
   * students carried on meeting last week's version. The two things the course
   * page can settle are that the activity is still there and that it is called
   * what this run renamed it to; the rest is for a human review to check.
   */
  function updatedActivity(
    items: readonly CourseItem[],
    update: { readonly moduleId: string; readonly name: string },
    named: string
  ): CourseItem {
    const saved = items.find((item) => item.moduleId === update.moduleId);
    if (saved === undefined) {
      throw new Error(
        `Aborting: ${named} ${update.moduleId} is not in course ${options.courseId} after updating it.`
      );
    }
    if (saved.name !== update.name) {
      throw new Error(
        `Aborting: ${named} ${update.moduleId} is still called "${saved.name}" after updating it to "${update.name}".`
      );
    }
    return saved;
  }

  /**
   * The activity a create just put in the course, and the check that it came
   * out the way it was asked for.
   *
   * Shared by both creates, because both face the same three ways a create can
   * succeed on the form and be wrong on the page — nothing appeared, several
   * things appeared, or the thing that appeared is showing when it was asked
   * for hidden. What identifies the new activity is the module id that was not
   * there a moment ago, and never the name: two activities are allowed to
   * share one.
   *
   * The hidden read-back is the reason this is checked rather than assumed.
   * Every other visibility write in this driver confirms itself; a create meant
   * to be hidden and coming out visible is the worst of them to take on trust,
   * because the manifest would record it as published and hidden while it sat
   * on the course page. `ifRevealed` is what is actually at stake, in the
   * caller's words, because that is the sentence the reader acts on.
   */
  function createdActivity(
    before: readonly CourseItem[],
    after: readonly CourseItem[],
    asked: {
      readonly named: string;
      readonly section: string;
      readonly visible: boolean;
      readonly ifRevealed: string;
    }
  ): CourseItem {
    const addition = activityAddedBy(before, after);
    if (addition.kind === "nothing") {
      throw new Error(
        `Aborting: asked course ${options.courseId} to create ${asked.named} in ` +
          `section ${asked.section}, and the course page lists no activity ` +
          `afterwards that was not there before. Nothing has been recorded for it. ` +
          `Check the section by hand in Moodle.`
      );
    }
    if (addition.kind === "unrecognisable") {
      throw new Error(
        `Aborting: creating ${asked.named} in course ${options.courseId} left ` +
          `${addition.appeared} new activities on the course page, so which one this ` +
          `run made cannot be said. Nothing has been recorded for it. Settle it by ` +
          `hand in Moodle, where all of them can be seen.`
      );
    }
    const created = addition.activity;
    if (!asked.visible && created.visible) {
      throw new Error(
        `Aborting: created ${asked.named} in course ${options.courseId} hidden, ` +
          `and the course page reports it visible. Hide it by hand in Moodle now — ` +
          `${asked.ifRevealed}`
      );
    }
    if (created.stealth) {
      throw new Error(
        `Aborting: ${asked.named} was created stealthed rather than hidden in ` +
          `course ${options.courseId}. "Available but not shown on the course page" ` +
          `leaves a working URL; hide it by hand in Moodle now.`
      );
    }
    return created;
  }

  return { updatedActivity, createdActivity };
}

export type ActivityChecks = ReturnType<typeof createActivityChecks>;
