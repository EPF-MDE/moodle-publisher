// An entry point: the gradebook half of the course seam — the Bands, the
// Competencies, and what a driver can do about them.
//
// It is separate from `index.ts` because it is configured rather than
// published. The course page is written many times, once per run; the
// gradebook is written once, by `setup`, and then only read. Keeping the two
// apart means a publish never has to open a gradebook page, and a reader of
// either file sees one job rather than two.
//
// The Bands here are EPF's, spelled as `CONTEXT.md` spells them, and the same
// for every course. The Competencies are not: each course declares its own in
// its grid. The Bands are constants and not configuration on purpose: a CSV of
// Bands is later matched against these strings character for character, and a
// Band that could be spelled two ways is an import that silently lands nothing.

/**
 * The five Bands, lowest first.
 *
 * The order is the scale's order, and Moodle reads a scale that way: the
 * position of a value in this list is what it means. `Resit` is first because
 * it has to be somewhere, not because it is the bottom of a quality
 * ladder — it is an absence verdict, which is why nothing here ever averages
 * them.
 */
export const BANDS = [
  "Resit",
  "Needs Work",
  "Basic",
  "Solid",
  "Outstanding",
] as const;

/**
 * One of the five, by name.
 *
 * What a scale this program creates is made of: {@link NewScale} asks for
 * these and not for strings, so a driver cannot be handed a scale of
 * something else. A scale the course already holds is read as strings — that
 * one may be spelled anything at all, which is the whole point of checking
 * it.
 */
export type Band = (typeof BANDS)[number];

/**
 * The Band this text names, if it names one.
 *
 * Here, beside the Bands themselves, because two places ask it and neither owns
 * it: the catalog refuses a probe that names a Band, and the Probe Sheet
 * generator refuses a sheet that does. Both are ADR-0002 — nothing this tooling
 * writes suggests a verdict — and one of them spelling the check differently is
 * a hint that gets through one guard and not the other.
 *
 * Whole words and any case, because a probe is read out loud at an Oral and a
 * lower-case band name is the same hint as a capitalised one. Whole words
 * because a substring match would refuse "the basics", which suggests nothing.
 */
export function bandNamedIn(text: string): Band | undefined {
  return BANDS.find((band) =>
    new RegExp(`(^|\\W)${band.replace(/\s+/g, "\\s+")}(\\W|$)`, "i").test(text)
  );
}

/**
 * What the scale is called in the course's gradebook.
 *
 * One name, used to create it and to recognise it on a later run: this is what
 * makes `setup` idempotent, so it is defined once rather than typed at both
 * ends.
 */
export const BAND_SCALE_NAME = "Bands";

/**
 * One independently graded Competency, as the course's grid declares it.
 *
 * Declared by the course rather than written here, so a course graded on two or
 * five is as publishable as one graded on three. The grid writes only the
 * title; the id is `C1`, `C2`, … by the order it declares them, and the manifest
 * records a Grade Item under it. Reordering the grid therefore renumbers the
 * Competencies, and with them which recorded Grade Item each one is.
 */
export interface Competency {
  readonly id: string;
  readonly title: string;
}

/**
 * The Grade Item for one Competency, by name.
 *
 * The name is how a later run recognises a Grade Item it already made, so it
 * is derived here and never typed by hand anywhere else.
 */
export function gradeItemName(competency: Competency): string {
  return `${competency.id} — ${competency.title}`;
}

/** A scale as the course holds it. */
export interface CourseScale {
  /** Moodle's scale id. What a Grade Item points at. */
  readonly id: string;
  readonly name: string;
  /** Its values, lowest first, exactly as the course spells them. */
  readonly values: readonly string[];
}

/**
 * A Grade Item as the course holds it.
 *
 * `hidden` and `excludedFromTotal` are read back rather than assumed from what
 * was asked for: both are the whole point of a Grade Item here, and a setting
 * that did not take is a Student reading a provisional Band, or a /20 Moodle
 * computed out of three of them.
 */
export interface CourseGradeItem {
  readonly id: string;
  readonly name: string;
  /** The scale it is valued on, or undefined when it takes a number. */
  readonly scaleId: string | undefined;
  /** Hidden from Students. */
  readonly hidden: boolean;
  /** Contributes nothing to the course total. */
  readonly excludedFromTotal: boolean;
}

/** What the course's gradebook holds right now. */
export interface Gradebook {
  readonly scales: readonly CourseScale[];
  readonly items: readonly CourseGradeItem[];
}

/** A scale to create. */
export interface NewScale {
  readonly name: string;
  /** Lowest first, and Bands: this program creates no other scale. */
  readonly values: readonly Band[];
}

/**
 * A Grade Item to create.
 *
 * There is no visibility flag and no weight: every Grade Item this program
 * creates is hidden and weightless, and that is expressed by the interface
 * having no way to ask for anything else. A later change that wanted a visible
 * one would have to say so here, in front of a reviewer, rather than by
 * passing a different boolean from somewhere.
 */
export interface NewGradeItem {
  readonly name: string;
  /** The scale the Grade Item is valued on — the Bands, always. */
  readonly scaleId: string;
}

/**
 * What one column of an imported file is mapped onto in the gradebook.
 *
 * Three targets, and the one that is missing is the point of the list. There
 * is no `band` here, so no import this program drives can write a verdict into
 * a Grade Item: the columns the generated file leaves empty for the Instructor
 * are mapped to `ignore` and travel nowhere. ADR-0002 is a property of the
 * interface rather than a rule the caller has to keep, exactly as
 * {@link NewGradeItem} has no way to ask for a visible Grade Item.
 *
 * Mapping the sheet column still puts the Band cell on screen: a Grade Item
 * with feedback for a Student has a grade record for that Student, and its
 * grade is what the Instructor picks from the Bands at the Oral. The field is
 * waiting; nothing has been written into it.
 */
export type ColumnTarget =
  | { readonly kind: "ignore" }
  /** The email the row's Student is matched by. Exactly one column is this. */
  | { readonly kind: "identity" }
  /** The Probe Sheet, into the feedback beside this Grade Item's Band cell. */
  | { readonly kind: "sheet"; readonly gradeItemId: string };

/** One column of the file, by the heading the file writes above it. */
export interface ImportColumn {
  readonly heading: string;
  readonly target: ColumnTarget;
}

/**
 * Which column of the file says whose row this is.
 *
 * Asked here rather than worked out by each driver, because both of them have
 * to know it and neither is entitled to a different answer: the identity is the
 * one mapping that must not be wrong — a row matched by name would put one
 * Student's sheet on another — and an import with no identity column at all is
 * a fault in this program, which is why it is refused rather than guessed at.
 *
 * `what` names the file or the run, so the abort says which import it is about.
 */
export function identityColumnOf(
  columns: readonly ImportColumn[],
  what: string
): number {
  const at = columns.findIndex((column) => column.target.kind === "identity");
  if (at === -1) {
    throw new Error(
      `Aborting: ${what} — no column of the file says which Student a row is ` +
        `for. That is a fault in this program rather than in the course. ` +
        `Nothing has been imported.`
    );
  }
  return at;
}

/**
 * A file to put through Moodle's own gradebook import.
 *
 * The path and not the contents: the file is uploaded as it is, and no driver
 * rewrites, re-renders or re-encodes it. That is what keeps the CSV the
 * Instructor read the CSV Moodle read, and what keeps the same file importable
 * by hand through the same screen when a selector breaks on the night.
 *
 * The columns are stated by the caller rather than discovered by the driver,
 * in the order the file writes them, because what a column means is a fact
 * about the file this program generated and not something to be guessed from a
 * heading in a form.
 */
export interface SheetImport {
  readonly path: string;
  readonly columns: readonly ImportColumn[];
}

/**
 * What a driver can do to the gradebook: read it, add to it, and put a file
 * through its import.
 *
 * Additive only, like the rest of this seam. Nothing here edits or deletes an
 * existing scale or Grade Item — a gradebook holds Bands somebody entered, and
 * a program that could rewrite one could lose them. Nothing here reads a Band
 * back out either: this seam carries the sheets in, and the verdicts written on
 * them stay in Moodle (ADR-0002).
 */
export interface GradebookDriver {
  /** Reads the course's scales and Grade Items. Never mutates. */
  gradebook(): Promise<Gradebook>;
  /**
   * Creates a scale in the course and reports it as the course now holds it,
   * values included, so a caller can check what it got rather than what it
   * asked for.
   */
  createScale(scale: NewScale): Promise<CourseScale>;
  /**
   * Creates one hidden, weightless Grade Item valued on `scaleId`, and reports
   * it as the course now holds it.
   */
  createGradeItem(item: NewGradeItem): Promise<CourseGradeItem>;
  /**
   * Puts one file through Moodle's own gradebook import, mapping its columns
   * as {@link SheetImport} says.
   *
   * Moodle's import tool and not its grading grid: thirty Students times a
   * field per Competency is one form rather than a page of AJAX interactions
   * each, and one file covers every Competency in a single pass — including
   * the one graded live, so that even its field is waiting rather than being
   * made mid-slot.
   *
   * It reports nothing, and that is deliberate. What a driver could report is
   * a number read off a page in whatever language the site is set to, and a
   * count invented from a French success notice is worse than no count at all:
   * what the run says it sent is what the file held, which it read itself.
   * Anything Moodle refused over is an abort naming what the page said.
   */
  importSheets(request: SheetImport): Promise<void>;
}

/**
 * Where Moodle's scale form lives, as a path. What a link on the scales page
 * has to resolve to before the id in it is read as a scale's.
 */
export const SCALE_FORM_PATH = "/grade/edit/scale/edit.php";

/** Where Moodle's grade item form lives, as a path. */
export const GRADE_ITEM_FORM_PATH = "/grade/edit/tree/item.php";

/**
 * Where Moodle's CSV gradebook import lives, as a path.
 *
 * Core Moodle, and the same screen a human uses: the driver fills in the form
 * the Instructor would fill in, which is what makes doing it by hand a real
 * fallback rather than a different procedure nobody has tried.
 */
export const GRADE_IMPORT_PATH = "/grade/import/csv/index.php";

/**
 * The ids the links on a gradebook page name, for one of the forms above.
 *
 * The trap this exists for: Moodle writes those links **relative**. The
 * scales table's edit link is `edit.php?courseid=14707&id=77`, and matching
 * links by the form's path against the `href` attribute — which is what a CSS
 * `[href*='/grade/edit/scale/edit.php']` does — finds none of them on the very
 * page they are all on. A course's own scale then reads as no scale at all,
 * and `setup` aborts saying the scale it just created is not there.
 *
 * So the href is resolved against the page it was read from, exactly as the
 * browser resolves it when the link is followed, and only then is its path
 * compared. `id=0` is the form's "new one" link, not an existing row, and is
 * left out along with anything the page repeats.
 */
export function idsLinkedToForm(
  formPath: string,
  pageUrl: string,
  hrefs: readonly string[]
): readonly string[] {
  const ids: string[] = [];
  for (const href of hrefs) {
    let url: URL;
    try {
      url = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (url.pathname !== formPath) continue;
    const id = url.searchParams.get("id");
    if (id !== null && id !== "0" && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * The ids of the Grade Items a gradebook setup page carries.
 *
 * Two readings, because Moodle changed how the page offers a Grade Item's
 * settings. It used to link to `/grade/edit/tree/item.php`; 4.5 opens that
 * same form in a **modal**, so every action in the row's menu is `href="#"`
 * and the page listing the course's Grade Items contains not one link to one.
 * Read by links alone, a course holding three items reads as holding none —
 * which is `setup` aborting on the item it has just made and can see on
 * screen.
 *
 * What the page does still say, on the row itself, is `data-itemid`. That is
 * read first and in page order, and a link is honoured too, so a Moodle that
 * still renders them is read the same way. Rows that are not Grade Items at
 * all — the course category, the course total — are named here as readily as
 * any other, and dropped where the difference is actually visible: their
 * settings form has no item name on it.
 */
export function gradeItemIdsOnPage(
  pageUrl: string,
  hrefs: readonly string[],
  rowItemIds: readonly string[]
): readonly string[] {
  const ids: string[] = [];
  for (const id of rowItemIds) {
    if (id !== "" && id !== "0" && !ids.includes(id)) ids.push(id);
  }
  for (const id of idsLinkedToForm(GRADE_ITEM_FORM_PATH, pageUrl, hrefs)) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}
