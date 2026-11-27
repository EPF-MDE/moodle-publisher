import { SELECTORS } from "../selectors.ts";
import { DELIVERABLE_SECTION } from "../../index.ts";
import type { DevoirUpdate, NewDevoir } from "../../index.ts";
import {
  DEVOIR_DATES_OFF,
  DEVOIR_SUBMISSION_FIELDS,
  FREEZE_ZONE,
  devoirDateFields,
} from "../../devoir-form.ts";
import type {
  DevoirDateField,
  DevoirSubmissionField,
} from "../../devoir-form.ts";
import { assertNotMoodleError } from "./errors.ts";
import type { FormFields } from "./form-fields.ts";
import { assertInConfiguredCourse, assertNotOnLoginHost } from "./navigation.ts";
import type { DriverSession } from "./navigation.ts";

/**
 * What is typed into a Devoir's settings form. Creating and updating are the
 * same form, opened at a different URL, and — as for a file resource — they
 * differ in exactly one field: only a creation sets visibility.
 *
 * Written from the two seam types rather than as a shape of its own, so that a
 * field added to what a Devoir carries reaches this form on both arms at once.
 * Visibility is on the create arm and on no other, which is what makes the
 * guarantee {@link DevoirUpdate} states unwritable rather than merely unwritten:
 * no edit to `updateDevoir` can pass one, because there is no field to pass it
 * in.
 */
type DevoirForm =
  | ({ readonly kind: "create" } & NewDevoir)
  | ({ readonly kind: "update" } & Omit<DevoirUpdate, "moduleId">);

/** Typing a Devoir into its settings form, in a zone confirmed to be Paris. */
export function createDevoirForm(session: DriverSession, fields: FormFields) {
  const { page, options, watch } = session;
  const { writableField, saveAndReturnToCourse, selectPossiblyCollapsed } =
    fields;

  /**
   * Whether this run has confirmed that Moodle renders dates in Paris. Asked
   * once: it is a property of the account, and it cannot change under a run.
   */
  let freezeZoneChecked = false;

  /**
   * Establishes that this Moodle renders dates in `Europe/Paris` before a
   * Freeze is typed into a form.
   *
   * Moodle's date selector is five numbers in the signed-in user's own
   * timezone, so "20:00 on 10 September" means one instant to a user in Paris
   * and another to a user in London — and nothing on the form says which. The
   * check is the only thing that makes the acceptance criterion true rather
   * than hoped for, and it costs one page load per run.
   *
   * The server default — Moodle's `99` — is accepted when the option says what
   * the server's zone is, which core Moodle spells out in the label. A zone
   * this cannot confirm aborts, because the alternative is publishing a Freeze
   * that is wrong by an hour and finding out from a student.
   */
  async function assertFreezeZone(what: string): Promise<void> {
    if (freezeZoneChecked) return;
    await page.goto(new URL("/user/edit.php", options.baseUrl).toString(), {
      waitUntil: "domcontentloaded",
    });
    assertNotOnLoginHost(page, watch);
    const select = page.locator(SELECTORS.userTimezone).first();
    if ((await select.count()) === 0) {
      throw new Error(
        `Aborting: ${what} — this Moodle's profile form has no ` +
          `"${SELECTORS.userTimezone}" field, so the timezone its date forms are rendered ` +
          `in cannot be read. A Freeze typed into a form in another zone is wrong by ` +
          `whole hours. Set the dates by hand in Moodle, or check the selectors.`
      );
    }
    const chosen = await select.evaluate((element) => {
      const timezone = element as HTMLSelectElement;
      const option = timezone.options[timezone.selectedIndex];
      return { value: timezone.value, label: option?.textContent ?? "" };
    });
    if (chosen.value !== FREEZE_ZONE && !chosen.label.includes(FREEZE_ZONE)) {
      throw new Error(
        `Aborting: ${what} — the Moodle account this run is signed in as has timezone ` +
          `"${chosen.value}" (${chosen.label.trim()}), not ${FREEZE_ZONE}. Moodle's date ` +
          `fields are in the signed-in user's zone, so a Freeze typed in now would be ` +
          `wrong by whole hours for every student. Set the account's timezone to ` +
          `${FREEZE_ZONE} in Moodle and run again. No Devoir has been created, and no ` +
          `date has been written anywhere. What this run did put in the course is its ` +
          `PDFs and an empty "${DELIVERABLE_SECTION}" section; running again fills that ` +
          `section and leaves the PDFs alone.`
      );
    }
    freezeZoneChecked = true;
  }

  /**
   * Turns one of Moodle's optional dates on and types the five numbers into
   * it.
   *
   * The enabling checkbox first: the five selects behind it are disabled until
   * it is ticked, and a disabled select is not something a browser can be
   * asked to choose an option from. Which numbers they are was settled by
   * `devoir-form.ts`; all that happens here is the typing.
   */
  async function setOptionalDate(
    date: DevoirDateField,
    what: string
  ): Promise<void> {
    const enabled = await writableField(
      date.enabledSelector,
      what,
      "the Freeze cannot be set here"
    );
    await enabled.check();
    for (const part of date.parts) {
      await page.locator(part.selector).first().selectOption(part.value);
    }
  }

  /**
   * Ticks or unticks one of the submission plugins.
   *
   * Which ones there are, and what each is set to, is
   * {@link DEVOIR_SUBMISSION_FIELDS}. This ticks the box it is handed and has
   * no opinion about the answer.
   */
  async function setSubmissionPlugin(
    field: DevoirSubmissionField,
    what: string
  ): Promise<void> {
    const box = await writableField(
      field.selector,
      what,
      "what a Student may hand in cannot be set here"
    );
    await box.setChecked(field.on);
  }

  /**
   * Opens a Devoir's settings form, fills in everything a Devoir *is*, and
   * saves it.
   *
   * One function for both the create and the update, because a Devoir is one
   * thing either way: its title, the stub students read, online text with file
   * upload off, and the Freeze in both dates. A second copy of this would be
   * the place where an edited Devoir quietly stopped being what a created one
   * is — file upload back on after a typo fix, say, which nothing would report
   * and a student would find.
   *
   * Visibility is the exception, and {@link DevoirForm} is the guarantee: it
   * is a field of the create arm and of nothing else, so an update has none to
   * be written from and the hidden/shown select is never reached. A Devoir
   * revealed by hand stays revealed and one held back stays held back — not
   * because this function declines to write visibility, but because on an
   * update there is no visibility here to write.
   */
  async function submitDevoirForm(
    form: string,
    devoir: DevoirForm,
    what: string
  ): Promise<void> {
    await page.goto(form, { waitUntil: "domcontentloaded" });
    assertNotOnLoginHost(page, watch);
    await assertNotMoodleError(
      page,
      `opening the Devoir form for "${devoir.name}"`
    );
    await assertInConfiguredCourse(page, options);

    await page.locator(SELECTORS.activityName).fill(devoir.name);
    const intro = await writableField(
      SELECTORS.assignIntroTextarea,
      what,
      "the description saying what to paste and when the Freeze is cannot be written"
    );
    await intro.fill(devoir.html);

    for (const field of DEVOIR_SUBMISSION_FIELDS) {
      await setSubmissionPlugin(field, what);
    }
    // One Freeze, into both dates — the pair comes from one call, so there is
    // no second date here to be filled in from somewhere else. Typed on every
    // update as well as every create, and typed in full: what an update leaves
    // behind is what a create would, so there is no state this form can be in
    // that an edit half-corrects.
    for (const date of devoirDateFields(devoir.freeze)) {
      await setOptionalDate(date, what);
    }
    for (const selector of DEVOIR_DATES_OFF) {
      const enabled = await writableField(
        selector,
        what,
        "a date Moodle set by default cannot be switched off"
      );
      await enabled.uncheck();
    }
    // Both answers are typed, rather than "hidden" typed and "shown" left to
    // the form's default: creating is the one moment this program decides
    // whether students can see a Devoir, and it says which it decided either
    // way. Not reached from an update, which carries no visibility at all.
    if (devoir.kind === "create") {
      await selectPossiblyCollapsed(
        SELECTORS.activityVisible,
        devoir.visible ? "1" : "0",
        `${what} ${devoir.visible ? "visible" : "hidden"}`
      );
    }

    await saveAndReturnToCourse(what);
    assertNotOnLoginHost(page, watch);
    await assertInConfiguredCourse(page, options);
  }

  return { assertFreezeZone, submitDevoirForm };
}

export type DevoirFormSteps = ReturnType<typeof createDevoirForm>;
