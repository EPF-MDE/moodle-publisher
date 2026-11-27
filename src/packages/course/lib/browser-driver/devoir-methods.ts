import { SELECTORS } from "../selectors.ts";
import { readsAsHoldingSubmissions } from "../../activities.ts";
import { DELIVERABLE_SECTION } from "../../index.ts";
import type {
  CourseDriver,
  CreatedDevoir,
  DevoirUpdate,
  NewDevoir,
} from "../../index.ts";
import type { ActivityChecks } from "./activity-checks.ts";
import type { DevoirFormSteps } from "./devoir-form-steps.ts";
import type { Mutations } from "./mutations.ts";
import { eachPageOf, gotoCourse } from "./navigation.ts";
import type { DriverSession } from "./navigation.ts";
import { readItems } from "./read-course.ts";
import type { SectionSteps } from "./section-steps.ts";

/** The driver's Devoir calls: creating, updating, and counting Submissions. */
export function createDevoirMethods(
  session: DriverSession,
  steps: Mutations & SectionSteps & ActivityChecks & DevoirFormSteps
): Pick<CourseDriver, "createDevoir" | "updateDevoir" | "countSubmissions"> {
  const { page, options, watch } = session;
  const {
    prepareToMutate,
    noteAbort,
    assertFreezeZone,
    ensureSectionOn,
    submitDevoirForm,
    createdActivity,
    updatedActivity,
  } = steps;

  return {
    async createDevoir(devoir: NewDevoir): Promise<CreatedDevoir> {
      const what = `creating the Devoir "${devoir.name}"`;
      // Both of these navigate away, so they happen before the course page is
      // opened and before anything is captured — and the zone check happens
      // before this driver touches a section, so a run that cannot state its
      // Freeze writes nothing here at all.
      //
      // It does not follow that the course is untouched. By the time the first
      // Devoir is made, `applyPlan` has published the run's PDFs and has
      // already created the "Deliverables" section, which is where these were
      // going to go. A refusal therefore leaves that section on the course
      // page with nothing in it, and the fix for both is the same: set the
      // account's timezone and run again.
      const mutation = await prepareToMutate();
      await assertFreezeZone(what);
      // Not a parameter, and not read from anywhere: there is one section a
      // Devoir can be in. The publishing layer has already created it; this is
      // the lookup finding it.
      const { number: section } = await ensureSectionOn(DELIVERABLE_SECTION);
      await gotoCourse(page, options, watch);
      const after = await mutation.capture(`create devoir ${devoir.name}`);

      try {
        // As for a file resource: what identifies the activity this call made
        // is the module id that was not on the course page a moment ago.
        const before = await readItems(page);
        const form = new URL(
          `/course/modedit.php?add=assign&course=${options.courseId}&section=${section}`,
          options.baseUrl
        ).toString();
        await submitDevoirForm(form, { kind: "create", ...devoir }, what);

        const created = createdActivity(before, await readItems(page), {
          named: `the Devoir "${devoir.name}"`,
          section: DELIVERABLE_SECTION,
          visible: devoir.visible,
          ifRevealed:
            "it names an exercise students are not meant to have yet.",
        });
        return { moduleId: created.moduleId };
      } catch (error) {
        noteAbort(mutation, error);
        throw error;
      } finally {
        await after();
      }
    },

    async updateDevoir(devoir: DevoirUpdate): Promise<void> {
      const what = `updating the Devoir "${devoir.name}"`;
      // The same form as creating, opened on the existing activity rather than
      // on `add=assign`: Moodle keeps the module id, the section and the
      // visibility, and this driver never types into any of them here. The
      // module id is what every Submission handed in hangs off, which is why
      // an edit is this and never a delete followed by a create.
      const mutation = await prepareToMutate();
      // Before the course page is opened, as it is for a create: a run that
      // cannot establish the zone its dates are typed in writes nothing.
      await assertFreezeZone(what);
      await gotoCourse(page, options, watch);
      const after = await mutation.capture(`update devoir ${devoir.name}`);

      try {
        const form = new URL(
          `/course/modedit.php?update=${devoir.moduleId}`,
          options.baseUrl
        ).toString();
        // The update arm of the form carries no visibility, because there is
        // none to carry: the hidden/shown select on this form is left exactly
        // as the instructor set it.
        await submitDevoirForm(form, { kind: "update", ...devoir }, what);

        // Read the course back, exactly as a file replace does. What the
        // course page cannot say is what the two dates were saved as — that is
        // for a human review to check against the front matter.
        updatedActivity(await readItems(page), devoir, "the Devoir");
      } catch (error) {
        noteAbort(mutation, error);
        throw error;
      } finally {
        await after();
      }
    },

    async countSubmissions(moduleId: string): Promise<number> {
      // The page a teacher already reads this off, opened with the session
      // this driver is holding. No web service token: for one count it would
      // add a credential to keep, a renewal to remember and a second transport
      // to a program that has none.
      const start = new URL(
        `/mod/assign/view.php?id=${moduleId}&action=grading`,
        options.baseUrl
      ).toString();
      let counted = 0;

      await eachPageOf(
        page,
        watch,
        start,
        SELECTORS.assignGradingTable,
        // The browser reads class attributes and nothing else: whether they
        // mean a Student has work in there is decided by `readsAsHoldingSubmissions`,
        // out here where a test can reach it. Grouped by row and not by
        // element, because a theme that puts the status class on the cell as
        // well as on the div inside it would otherwise count one Student's
        // work twice.
        () =>
          page.evaluate((selectors) => {
            const empty = {
              understood: false,
              rows: [] as string[][],
              links: [] as string[],
            };
            if (document.querySelector(selectors.assignPage) === null) {
              return empty;
            }
            const table = document.querySelector(selectors.assignGradingTable);
            if (table === null) return empty;

            const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
              Array.from(
                row.querySelectorAll(selectors.assignSubmissionStatus)
              ).map((carrier) => carrier.getAttribute("class") ?? "")
            );
            const links = Array.from(
              document.querySelectorAll<HTMLAnchorElement>(
                selectors.assignGradingPaging
              )
            ).map((link) => link.href);
            return { understood: true, rows, links };
          }, SELECTORS),
        (url) =>
          `Aborting: read ${url} and could not find the grading table on it, so how ` +
          `many Submissions activity ${moduleId} holds cannot be established. ` +
          `A Devoir with no Students enrolled renders no table either, and this ` +
          `cannot tell that apart from a page it failed to read — so it refuses ` +
          `rather than call either one empty. Confirm it in Moodle by hand.`,
        (read) => {
          counted += read.rows.filter((classNames) =>
            readsAsHoldingSubmissions(classNames)
          ).length;
        }
      );
      return counted;
    },
  };
}
