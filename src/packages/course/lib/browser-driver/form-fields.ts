import type { Locator } from "playwright";

import { SELECTORS } from "../selectors.ts";
import type { DriverSession } from "./navigation.ts";
import { OPTIONAL_CLICK_TIMEOUT_MS } from "./timeouts.ts";

/** Reaching, writing and saving the fields of a Moodle settings form. */
export function createFormFields(session: DriverSession) {
  const { page } = session;

  /**
   * Opens an activity form, fills the name and the body, saves with "save and
   * return to course", and hands back the course's activities as the page
   * reports them afterwards. Creating and updating differ only in the URL and
   * in what they then look for, so they share this.
   *
   * `hide` is passed only when creating. There is no update path for
   * visibility, and this is where that is enforced: an update never has a way
   * to name the field.
   */
  /**
   * Whether the control is on screen, waiting out a fieldset still opening.
   *
   * A section unfolds with an animation, so the moment after the toggle is
   * clicked is exactly when a control can be on its way in and not yet
   * visible. Read as a question rather than an assertion: the answer decides
   * whether to try harder, so "no" is an ordinary outcome and never a throw.
   */
  async function shown(control: Locator): Promise<boolean> {
    return control
      .waitFor({ state: "visible", timeout: OPTIONAL_CLICK_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Opens whatever the form is keeping folded away.
   *
   * Moodle hides availability and weight behind "Show more…" inside a
   * collapsed fieldset, and a control that is in the DOM and not visible is
   * one Playwright will not check. Both controls are clicked when they are
   * there, and neither is required: a theme that shows everything already is
   * not a failure.
   */
  async function revealAdvancedFields(): Promise<void> {
    // Each shut section by its own toggle, and never the form's "expand all"
    // link. That link is a toggle, not a command: on a form Moodle serves with
    // its fieldsets already open, clicking it shuts them all, and a field
    // inside a section this program had just closed spends thirty seconds not
    // becoming visible. Asking only the sections that are actually collapsed
    // to open makes the call idempotent, which is what "reveal" means.
    const collapsed = page.locator(SELECTORS.formCollapsedSection);
    for (const toggle of await collapsed.all()) {
      await toggle
        .click({ timeout: OPTIONAL_CLICK_TIMEOUT_MS })
        .catch(() => undefined);
    }
    // "Show more…" is separate: it reveals advanced fields *inside* a section
    // rather than opening one. Moodle serves those hidden, so the first click
    // is the revealing one.
    const more = page.locator(SELECTORS.formShowMore);
    if ((await more.count()) > 0) {
      await more
        .first()
        .click({ timeout: OPTIONAL_CLICK_TIMEOUT_MS })
        .catch(() => undefined);
    }
  }

  /**
   * The form's own "expand all", clicked once.
   *
   * A blunter instrument than {@link revealAdvancedFields}, and a toggle
   * rather than a command — on a form Moodle already serves open it shuts
   * everything — so it is a last resort and never the first thing tried.
   */
  async function expandAllSections(): Promise<void> {
    const expandAll = page.locator(SELECTORS.formExpandAll);
    if ((await expandAll.count()) === 0) return;
    await expandAll
      .first()
      .click({ timeout: OPTIONAL_CLICK_TIMEOUT_MS })
      .catch(() => undefined);
  }

  /**
   * One field of a settings form, ready to be written to.
   *
   * Two things stand between a field and being writable, and both are asked
   * here rather than at each of the several places that write one. It is
   * absent — the form is not the form this program was written against, and
   * saying so is worth more than a timeout. Or it is inside one of the
   * collapsed fieldsets Moodle 4 renders a form as, which puts it in the DOM
   * and off the screen: a control nobody can see is not a control a browser
   * can be asked to choose an option from, and expanding the form is a click
   * on the page's own control rather than a way of reaching around the page.
   *
   * Two ways of opening the form, in order, because Moodle folds its forms
   * differently. Asking each shut section to open is enough for a form served
   * open; the activity form does not answer to it, and needs the "expand all"
   * link that would shut a form served open. Trying the gentle one first and
   * escalating only while the field is *still* hidden is what lets one
   * function serve both.
   *
   * And when neither works, this says so at once instead of leaving Playwright
   * to spend thirty seconds writing to something invisible. That wait is not
   * idle time: the last run to hit it submitted the form while it ran, and
   * left an activity in the course that no manifest accounted for.
   *
   * `cannot` says what is lost when the field is missing, in the caller's
   * words, because that sentence is the whole value of stopping here.
   */
  async function writableField(
    selector: string,
    what: string,
    cannot: string
  ): Promise<Locator> {
    const field = page.locator(selector);
    if ((await field.count()) === 0) {
      throw new Error(
        `Aborting: ${what} — this form has no "${selector}" field, so ${cannot}. ` +
          `Check the selectors against this Moodle.`
      );
    }
    const control = field.first();
    if (!(await shown(control))) {
      await revealAdvancedFields();
      if (!(await shown(control))) {
        await expandAllSections();
        if (!(await shown(control))) {
          throw new Error(
            `Aborting: ${what} — "${selector}" is on this form but stayed hidden after ` +
              `opening its folded sections and clicking "expand all", so it cannot be set. ` +
              `Nothing was submitted. Confirm the selectors in an attended codegen session ` +
              `(see the publisher's README.md).`
          );
        }
      }
    }
    return control;
  }

  /**
   * Clicks "save and return to course" and waits for the course page, or for
   * Moodle to send the form back.
   *
   * A form Moodle rejects re-renders at `modedit.php` with an error under the
   * field it objects to, and never reaches the course page. Waiting for the
   * course URL alone turned that into a thirty-second timeout that said
   * nothing; the errors on the form say which field and why, so they are what
   * the run aborts with.
   */
  async function saveAndReturnToCourse(what: string): Promise<void> {
    await page.locator(SELECTORS.activitySubmitAndReturn).click();
    const errors = page
      .locator(SELECTORS.formFieldError)
      .filter({ visible: true });
    const outcome = await Promise.race([
      page
        .waitForURL(/\/course\/view\.php/, { waitUntil: "domcontentloaded" })
        .then(() => "saved" as const),
      errors
        .first()
        .waitFor({ state: "visible" })
        .then(() => "sent back" as const),
    ]);
    if (outcome === "saved") {
      return;
    }
    const reasons = await errors.evaluateAll((nodes) =>
      nodes.map((node) => {
        const field = node.id.replace(/^id_error_/, "");
        return `${field}: ${node.textContent?.trim() ?? ""}`;
      })
    );
    throw new Error(
      `Aborting: ${what} — Moodle sent the form back instead of saving it ` +
        `(${reasons.join("; ")}). Nothing was saved.`
    );
  }

  /** Chooses an option on a select that a collapsed fieldset may be hiding. */
  async function selectPossiblyCollapsed(
    selector: string,
    value: string,
    what: string
  ): Promise<void> {
    const field = await writableField(
      selector,
      what,
      "visibility cannot be set here"
    );
    await field.selectOption(value);
  }

  return { writableField, saveAndReturnToCourse, selectPossiblyCollapsed };
}

export type FormFields = ReturnType<typeof createFormFields>;
