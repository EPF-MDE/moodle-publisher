import { SELECTORS } from "../selectors.ts";
import type { CourseDriver } from "../../index.ts";
import type { Mutations } from "./mutations.ts";
import {
  assertInConfiguredCourse,
  assertNotOnLoginHost,
  gotoCourse,
} from "./navigation.ts";
import type { DriverSession } from "./navigation.ts";
import { readItems, readSections, sessionKey } from "./read-course.ts";

/** The driver's hide and deletes: each a core Moodle URL, then read back. */
export function createRemovalMethods(
  session: DriverSession,
  steps: Mutations
): Pick<CourseDriver, "hideItem" | "deleteItem" | "deleteSection"> {
  const { page, options, watch } = session;
  const { prepareToMutate, noteAbort } = steps;

  /**
   * Confirms a Moodle "are you sure?" page when one is shown. Deleting is the
   * one place this driver relies on a form it cannot see in advance, so a page
   * with no confirmation on it is left alone rather than clicked at.
   */
  async function confirmIfAsked(): Promise<void> {
    const confirm = page.locator(SELECTORS.confirmDelete);
    if ((await confirm.count()) === 0) return;
    await confirm.first().click();
    await page.waitForLoadState("domcontentloaded");
    assertNotOnLoginHost(page, watch);
  }

  return {
    async hideItem(moduleId: string): Promise<void> {
      const mutation = await prepareToMutate();
      await gotoCourse(page, options, watch);
      const after = await mutation.capture(`hide activity ${moduleId}`);
      try {
        const sesskey = await sessionKey(page);
        // Core Moodle's own hide. There is no show anywhere in this driver,
        // which is what makes "the publisher can only conceal" a property of
        // the program rather than a promise in a comment.
        await page.goto(
          new URL(
            `/course/mod.php?hide=${moduleId}&sesskey=${sesskey}&sr=0`,
            options.baseUrl
          ).toString(),
          { waitUntil: "domcontentloaded" }
        );
        assertNotOnLoginHost(page, watch);
        await gotoCourse(page, options, watch);
        await assertInConfiguredCourse(page, options);

        // Read it back, and require the answer rather than accepting silence.
        // An activity the course page no longer lists is not a hide this
        // program has seen happen: it is a question it could not get an answer
        // to, and the safe reading of "I cannot find the answer key" is not
        // "the answer key is hidden".
        const confirmed = (await readItems(page)).find(
          (item) => item.moduleId === moduleId
        );
        if (confirmed === undefined) {
          throw new Error(
            `Aborting: asked course ${options.courseId} to hide activity ` +
              `${moduleId}, and the course page does not list it afterwards, so ` +
              `its visibility cannot be confirmed. Check it by hand in Moodle.`
          );
        }
        if (confirmed.visible) {
          throw new Error(
            `Aborting: asked course ${options.courseId} to hide activity ` +
              `${moduleId} and the course page still reports it visible. Hide it ` +
              `by hand in Moodle before anyone reads it.`
          );
        }
      } catch (error) {
        noteAbort(mutation, error);
        throw error;
      } finally {
        await after();
      }
    },

    async deleteItem(moduleId: string): Promise<void> {
      const mutation = await prepareToMutate();
      await gotoCourse(page, options, watch);
      await assertInConfiguredCourse(page, options);
      const after = await mutation.capture(`delete activity ${moduleId}`);
      try {
        const sesskey = await sessionKey(page);
        await page.goto(
          new URL(
            `/course/mod.php?sesskey=${sesskey}&delete=${moduleId}&confirm=1`,
            options.baseUrl
          ).toString(),
          { waitUntil: "domcontentloaded" }
        );
        assertNotOnLoginHost(page, watch);
        await confirmIfAsked();

        // Read the course back. A delete URL that a future Moodle stops
        // honouring would otherwise leave every activity in place while wipe
        // reported a clean course — the failure that would send the instructor
        // to build on a course they believe is empty.
        await gotoCourse(page, options, watch);
        const remaining = await readItems(page);
        if (remaining.some((item) => item.moduleId === moduleId)) {
          throw new Error(
            `Aborting: activity ${moduleId} is still in course ${options.courseId} after deleting it.`
          );
        }
      } catch (error) {
        noteAbort(mutation, error);
        throw error;
      } finally {
        await after();
      }
    },

    async deleteSection(number: number): Promise<void> {
      if (number === 0) {
        throw new Error(
          "Aborting: section 0 is the course's own top section and cannot be deleted."
        );
      }
      const mutation = await prepareToMutate();
      await gotoCourse(page, options, watch);
      await assertInConfiguredCourse(page, options);
      const target = (await readSections(page)).find(
        (section) => section.number === number
      );
      if (target === undefined) {
        throw new Error(
          `Aborting: course ${options.courseId} has no section numbered ${number}.`
        );
      }
      if (target.id === undefined) {
        throw new Error(
          `Aborting: section ${number} ("${target.name}") carries no section id, ` +
            `so the delete cannot be addressed to it.`
        );
      }
      const after = await mutation.capture(
        `delete section ${number} ${target.name}`
      );
      try {
        const sesskey = await sessionKey(page);
        await page.goto(
          new URL(
            `/course/editsection.php?id=${target.id}&sr=0&delete=1&sesskey=${sesskey}`,
            options.baseUrl
          ).toString(),
          { waitUntil: "domcontentloaded" }
        );
        assertNotOnLoginHost(page, watch);
        await confirmIfAsked();

        // Read back by section id, not by number: the numbers after this one
        // have just shifted down, so a number-based check would find a
        // different section sitting where this one was and call it a failure.
        await gotoCourse(page, options, watch);
        const still = (await readSections(page)).some(
          (section) => section.id === target.id
        );
        if (still) {
          throw new Error(
            `Aborting: section ${number} ("${target.name}") is still in course ` +
              `${options.courseId} after deleting it.`
          );
        }
      } catch (error) {
        noteAbort(mutation, error);
        throw error;
      } finally {
        await after();
      }
    },
  };
}
