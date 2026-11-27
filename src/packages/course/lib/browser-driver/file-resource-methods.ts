import type {
  CourseDriver,
  CreatedFileResource,
  FileReplacement,
  NewFileResource,
} from "../../index.ts";
import type { ActivityChecks } from "./activity-checks.ts";
import type { FileResourceFormSteps } from "./file-resource-form.ts";
import type { Mutations } from "./mutations.ts";
import { gotoCourse } from "./navigation.ts";
import type { DriverSession } from "./navigation.ts";
import { readItems } from "./read-course.ts";
import type { SectionSteps } from "./section-steps.ts";

/** The driver's file resource writes: creating one and replacing its file. */
export function createFileResourceMethods(
  session: DriverSession,
  steps: Mutations & SectionSteps & ActivityChecks & FileResourceFormSteps
): Pick<CourseDriver, "createFileResource" | "replaceFile"> {
  const { page, options, watch } = session;
  const {
    prepareToMutate,
    noteAbort,
    ensureSectionOn,
    submitFileResourceForm,
    createdActivity,
    updatedActivity,
  } = steps;

  return {
    async createFileResource(
      resource: NewFileResource
    ): Promise<CreatedFileResource> {
      const what = `creating the file resource "${resource.name}"`;
      // Acquiring the plain text editor navigates away, so it happens before
      // the course page is opened and before anything is captured: the "before"
      // screenshot is then the course as it stood, not a preferences form.
      const mutation = await prepareToMutate();
      // The publishing layer has already put this section in the course, so
      // this is the lookup finding it. It stays a find-or-add so that the
      // driver has no state to be wrong about if it is ever driven directly.
      const { number: section } = await ensureSectionOn(resource.section);
      await gotoCourse(page, options, watch);
      const after = await mutation.capture(`create file ${resource.name}`);

      // The `after` capture is owed whatever happens: a mutation that failed
      // halfway is exactly the one the instructor will want to look at.
      try {
        // Read before writing, so the activity this call made can be told from
        // the ones that were already there. What identifies it is the module
        // id that was not on the page a moment ago; the name cannot, because
        // two activities are allowed to share one.
        const before = await readItems(page);
        const form = new URL(
          `/course/modedit.php?add=resource&course=${options.courseId}&section=${section}`,
          options.baseUrl
        ).toString();
        const items = await submitFileResourceForm(
          form,
          { kind: "create", ...resource },
          what
        );

        const created = createdActivity(before, items, {
          named: `the file resource "${resource.name}"`,
          section: resource.section,
          visible: resource.visible,
          ifRevealed: "it holds material students must not see.",
        });
        return { moduleId: created.moduleId };
      } catch (error) {
        noteAbort(mutation, error);
        throw error;
      } finally {
        await after();
      }
    },

    async replaceFile(replacement: FileReplacement): Promise<void> {
      const what = `replacing the file of resource ${replacement.moduleId} with "${replacement.fileName}"`;
      // The existing activity's form, reached by URL rather than through the
      // course page's action menu, whose ids change from one render to the
      // next. Moodle keeps the module id, the section and the visibility;
      // this call has none of them to type.
      const mutation = await prepareToMutate();
      await gotoCourse(page, options, watch);
      const after = await mutation.capture(
        `replace file ${replacement.moduleId}`
      );

      try {
        const form = new URL(
          `/course/modedit.php?update=${replacement.moduleId}`,
          options.baseUrl
        ).toString();
        const items = await submitFileResourceForm(
          form,
          { kind: "replace", ...replacement },
          what
        );
        updatedActivity(items, replacement, "file resource");
      } catch (error) {
        noteAbort(mutation, error);
        throw error;
      } finally {
        await after();
      }
    },
  };
}
