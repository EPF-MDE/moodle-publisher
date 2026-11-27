import type { Page } from "playwright";

import { SELECTORS } from "../selectors.ts";

import { readSections as readSectionMarkup } from "../../sections.ts";
import type { ReadSection } from "../../sections.ts";
import { readActivityVisibility, readsAsDevoir } from "../../activities.ts";
import type { CourseItem } from "../../index.ts";

/**
 * The sections of the course page.
 *
 * The browser only reads attributes off the page; what they mean is decided by
 * `readSectionMarkup` in the package root, where it is tested. Moodle's section
 * *number* and section *id* are different things, they sit in attributes whose
 * names suggest the opposite, and confusing them addresses a write to another
 * course entirely.
 */
export async function readSections(page: Page): Promise<readonly ReadSection[]> {
  const markup = await page.evaluate((selector) => {
    const nodes = Array.from(document.querySelectorAll(selector));
    return nodes.map((node) => {
      const heading = node.querySelector(".sectionname, h3, h4");
      const edit = node.querySelector<HTMLAnchorElement>(
        "a[href*='editsection.php?id=']"
      );
      return {
        name: heading?.textContent ?? "",
        dataNumber: node.getAttribute("data-number"),
        dataSectionId: node.getAttribute("data-sectionid"),
        dataId: node.getAttribute("data-id"),
        className: node.className,
        editSectionId:
          edit === null
            ? null
            : new URL(edit.href, document.location.href).searchParams.get("id"),
      };
    });
  }, SELECTORS.courseSection);
  return readSectionMarkup(markup);
}

/**
 * The section called `name`, or `undefined` when the course has none.
 *
 * Two sections with the same name is an abort. The instructor's own course
 * carries repeated names ("Section 2" twice over), so taking the first match
 * would be picking a section at random and reporting success.
 */
export function findSection(
  sections: readonly ReadSection[],
  name: string
): ReadSection | undefined {
  const matches = sections.filter((candidate) => candidate.name === name);
  if (matches.length > 1) {
    throw new Error(
      `Aborting: the course has ${matches.length} sections named "${name}" ` +
        `(numbers ${matches.map((match) => match.number).join(", ")}). ` +
        `Rename or remove the duplicates: publishing into one of them at ` +
        `random would put the document somewhere nobody looked.`
    );
  }
  return matches[0];
}

/** Moodle's per-session write token, carried by every page it renders. */
export async function sessionKey(page: Page): Promise<string> {
  const key = await page.evaluate(
    () => (globalThis as { M?: { cfg?: { sesskey?: string } } }).M?.cfg?.sesskey
  );
  if (key === undefined || key === "") {
    throw new Error(
      "Aborting: the page carries no Moodle session key, so no write can be addressed to it."
    );
  }
  return key;
}

export async function readItems(page: Page): Promise<readonly CourseItem[]> {
  const sections = await readSections(page);
  const raw = await page.evaluate((selector) => {
    /**
     * The course module id, taken from where Moodle actually puts it.
     *
     * Not from "the first link in the element": a course page carries `li`
     * elements that look like activities and hold a link to the course, and
     * reading `?id=` off that yields the *course* id. It then travels as a
     * module id into a delete URL, where the same number means an entirely
     * different thing.
     */
    function moduleIdOf(activity: Element): string {
      const data = activity.getAttribute("data-id");
      if (data !== null && data !== "") return data;
      const fromElementId = /(?:^|\s)module-(\d+)/.exec(activity.id);
      if (fromElementId?.[1] !== undefined) return fromElementId[1];
      // Only a link into /mod/ identifies an activity. Any other link on the
      // element is somebody else's id.
      const link =
        activity.querySelector<HTMLAnchorElement>("a[href*='/mod/']");
      if (link === null) return "";
      return (
        new URL(link.href, document.location.href).searchParams.get("id") ?? ""
      );
    }

    /**
     * The activity's name without the type suffix Moodle hides behind
     * `.accesshide` for screen readers — "Annonces Forum" is one activity
     * called "Annonces", not an activity whose name ends in its own type.
     */
    function nameOf(activity: Element): string {
      const instance = activity.querySelector(".instancename");
      if (instance !== null) {
        const copy = instance.cloneNode(true) as Element;
        for (const hidden of Array.from(copy.querySelectorAll(".accesshide"))) {
          hidden.remove();
        }
        return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
      }
      // A label — "Text and media area" — has no name at all: it is content
      // dropped straight onto the course page. Its first words are what the
      // instructor recognises it by, and something has to be shown before it
      // is deleted.
      //
      // The editing UI is stripped first. Left in, every label reads
      // "Sélectionner l'activité … Caché pour les étudiants" — the checkbox
      // and the badges around the content rather than the content.
      const copy = activity.cloneNode(true) as Element;
      for (const chrome of Array.from(
        copy.querySelectorAll(
          ".accesshide, .visually-hidden, .sr-only, .activity-actions, " +
            ".actions, .activitybadge, .badge, input, select, button, form"
        )
      )) {
        chrome.remove();
      }
      const text = (copy.textContent ?? "").replace(/\s+/g, " ").trim();
      return text.length > 60 ? `${text.slice(0, 60)}…` : text;
    }

    const nodes = Array.from(document.querySelectorAll(selector));
    return nodes.flatMap((node, index) =>
      Array.from(node.querySelectorAll("li.activity")).map((activity) => {
        const link =
          activity.querySelector<HTMLAnchorElement>("a[href*='/mod/']");
        return {
          moduleId: moduleIdOf(activity),
          name: nameOf(activity),
          sectionIndex: index,
          // Handed over verbatim and read in `activities.ts`. Moodle marks a
          // hidden activity on the `.activity-item` card inside this `<li>`,
          // not on the `<li>`, and deciding that here — in a browser, in a
          // function no test can reach — is how the wrong element went
          // unnoticed against a live course.
          className: activity.getAttribute("class") ?? "",
          itemClassName:
            activity.querySelector(".activity-item")?.getAttribute("class") ??
            "",
          url: link?.getAttribute("href") ?? "",
        };
      })
    );
  }, SELECTORS.courseSection);

  const items: CourseItem[] = [];
  for (const item of raw) {
    // Nothing on this element identified it as an activity. It is course
    // furniture, and passing it on as an activity with a borrowed id is how a
    // delete ends up addressed to something else entirely.
    if (item.moduleId === "") continue;

    const { visible, stealth } = readActivityVisibility(item);
    const devoir = readsAsDevoir(item, item.url);

    items.push({
      moduleId: item.moduleId,
      name: item.name,
      // Whatever the course calls this section, including a name the publisher
      // has never heard of. Inventing one here would make a misplaced activity
      // look correctly placed.
      section: sections[item.sectionIndex]?.name ?? "",
      visible,
      stealth,
      devoir,
    });
  }
  return items;
}
