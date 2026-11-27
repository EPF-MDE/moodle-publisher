import { SELECTORS } from "../selectors.ts";
import { sectionAddedBy } from "../../sections.ts";
import type { SectionName, SectionOutcome } from "../../index.ts";
import type { Mutations } from "./mutations.ts";
import {
  assertInConfiguredCourse,
  assertNotOnLoginHost,
  gotoCourse,
} from "./navigation.ts";
import type { DriverSession } from "./navigation.ts";
import { findSection, readSections, sessionKey } from "./read-course.ts";

/** Finding a section by name, and adding and naming it when it is missing. */
export function createSectionSteps(
  session: DriverSession,
  mutations: Mutations
) {
  const { page, options, watch } = session;
  const { prepareToMutate, noteAbort } = mutations;

  /** The section settings form, checked to be this course's. */
  async function openSectionSettings(sectionId: string): Promise<void> {
    await page.goto(
      new URL(
        `/course/editsection.php?id=${sectionId}`,
        options.baseUrl
      ).toString(),
      { waitUntil: "domcontentloaded" }
    );
    assertNotOnLoginHost(page, watch);
    await assertInConfiguredCourse(page, options);
  }

  async function ensureSectionOn(name: SectionName): Promise<SectionOutcome> {
    await gotoCourse(page, options, watch);
    const before = await readSections(page);
    const existing = findSection(before, name);
    if (existing !== undefined) {
      return { number: existing.number, created: false };
    }

    // Adding a section is a mutation, so it is captured like any other.
    const mutation = await prepareToMutate();
    await gotoCourse(page, options, watch);
    const after = await mutation.capture(`create section ${name}`);
    try {
      const sesskey = await sessionKey(page);
      // Core Moodle appends one section to the course. The activity chooser
      // and the section menus are theme surfaces; this URL is not.
      await page.goto(
        new URL(
          `/course/changenumsections.php?courseid=${options.courseId}` +
            `&insertsection=0&numsections=1&sesskey=${sesskey}&sectionreturn=0`,
          options.baseUrl
        ).toString(),
        { waitUntil: "domcontentloaded" }
      );
      assertNotOnLoginHost(page, watch);
      await gotoCourse(page, options, watch);
      await assertInConfiguredCourse(page, options);

      // Moodle adds the section before it can be named, so there is a window —
      // one form submission long — in which an extra section exists under a
      // name nobody chose. What is in it during that window is nothing: it is
      // unnamed ("Section 12") and empty, and no activity is created until the
      // whole of this call has returned and been checked.
      //
      // Which section was added is worked out by comparing the course page
      // with how it stood a moment ago, because "the last one" is a section
      // that already exists whenever the add did nothing — and renaming that
      // one takes the instructor's own material and relabels it. Moodle has
      // given the new section a default name ("Section 12", or whatever the
      // format calls it); renaming it is what makes it findable next time, so
      // a failure here fails the whole call rather than warning: an unnamed
      // section would be created again on the next run, and again after that.
      const addition = sectionAddedBy(before, await readSections(page));
      if (addition.kind === "nothing") {
        throw new Error(
          `Aborting: asked course ${options.courseId} to add a section for ` +
            `"${name}" and it still has ${before.length}. This course format ` +
            `does not add sections through changenumsections.php (see issue ` +
            `#20). Add "${name}" by hand in Moodle and run this again — an ` +
            `existing section is used as it stands.`
        );
      }
      if (addition.kind === "unrecognisable") {
        throw new Error(
          `Aborting: course ${options.courseId} gained ${addition.grew} ` +
            `section(s) while adding "${name}", and none of them can be told ` +
            `apart by section id. Name it by hand, or re-check the selectors ` +
            `against this theme.`
        );
      }
      const added = addition.section;
      if (added.id === undefined) {
        throw new Error(
          `Aborting: the section added to course ${options.courseId} for "${name}" ` +
            `carries no id, so it cannot be named.`
        );
      }
      await openSectionSettings(added.id);

      // Moodle guards the name field behind a "Custom" checkbox in some
      // formats and not in others.
      const customise = page.locator(SELECTORS.sectionNameCustomise);
      if ((await customise.count()) > 0 && !(await customise.isChecked())) {
        await customise.check();
      }
      await page.locator(SELECTORS.sectionName).fill(name);
      await page.locator(SELECTORS.sectionSubmit).click();
      await page.waitForURL(/\/course\/view\.php/, {
        waitUntil: "domcontentloaded",
      });
      assertNotOnLoginHost(page, watch);
      await assertInConfiguredCourse(page, options);

      // Read it back. The selectors here are the least verified in this
      // file, and a rename that quietly did nothing must not be reported as
      // a section the publisher can now use.
      const confirmed = findSection(await readSections(page), name);
      if (confirmed === undefined) {
        throw new Error(
          `Aborting: added a section to course ${options.courseId}, but no ` +
            `section named "${name}" is in the course afterwards.`
        );
      }
      return { number: confirmed.number, created: true };
    } catch (error) {
      noteAbort(mutation, error);
      throw error;
    } finally {
      await after();
    }
  }

  return { ensureSectionOn };
}

export type SectionSteps = ReturnType<typeof createSectionSteps>;
