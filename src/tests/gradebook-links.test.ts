// Reading the gradebook's own pages: which of a page's links name a scale,
// and which name a grade item. The links are transcribed from the live course
// (14707), because the shape that broke `setup` is not the shape a reading of
// Moodle's source suggests — the scales table writes its links relative.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GRADE_ITEM_FORM_PATH,
  SCALE_FORM_PATH,
  gradeItemIdsOnPage,
  idsLinkedToForm,
} from "../packages/course/gradebook.ts";

const SCALES_PAGE = "https://moodle.epf.fr/grade/edit/scale/index.php?id=14707";

/**
 * The links of the live course's scales page, verbatim, the run after `setup`
 * created the Bands scale (id 77). The edit link is relative and the delete
 * link goes to the page itself; the standard scales below the course's own
 * carry no link at all.
 */
const SCALES_PAGE_LINKS: readonly string[] = [
  "https://moodle.epf.fr/grade/edit/scale/edit.php",
  "edit.php?courseid=14707&id=77",
  "index.php?id=14707&scaleid=77&action=delete&sesskey=swLDjHYP0j",
  "https://moodle.epf.fr/course/view.php?id=14707",
];

test("a scale's edit link is found though the page writes it relative", () => {
  assert.deepEqual(
    idsLinkedToForm(SCALE_FORM_PATH, SCALES_PAGE, SCALES_PAGE_LINKS),
    ["77"]
  );
});

test("the add-a-scale link names no scale", () => {
  assert.deepEqual(
    idsLinkedToForm(SCALE_FORM_PATH, SCALES_PAGE, [
      "edit.php?courseid=14707&id=0",
      "https://moodle.epf.fr/grade/edit/scale/edit.php",
    ]),
    []
  );
});

test("a grade item's link is found written either way, and named once", () => {
  const treePage = "https://moodle.epf.fr/grade/edit/tree/index.php?id=14707";
  assert.deepEqual(
    idsLinkedToForm(GRADE_ITEM_FORM_PATH, treePage, [
      "item.php?courseid=14707&id=87064",
      "https://moodle.epf.fr/grade/edit/tree/item.php?courseid=14707&id=87064",
      "https://moodle.epf.fr/grade/edit/tree/item.php?courseid=14707&id=87065",
      "https://moodle.epf.fr/grade/edit/tree/action.php?id=14707&action=hide",
      "calculation.php?courseid=14707&id=87063",
    ]),
    ["87064", "87065"]
  );
});

/**
 * The gradebook setup page of the live course, the run after C1 was created.
 * Moodle 4.5 opens the item settings in a modal, so every action in the row's
 * menu is `href="#"` — the page lists the Grade Item and links to it nowhere.
 * The ids are on the rows: 88660 is C1, 87063 the course total and its
 * category, which read as no Grade Item once their form is opened.
 */
test("a grade item is found on a page that links to none of them", () => {
  const treePage = "https://moodle.epf.fr/grade/edit/tree/index.php?id=14707";
  assert.deepEqual(
    gradeItemIdsOnPage(
      treePage,
      ["#", "calculation.php?courseid=14707&id=88660", "#"],
      ["87063", "88660", "87063"]
    ),
    ["87063", "88660"]
  );
});

test("a Moodle that still links to the item form is read the same way", () => {
  const treePage = "https://moodle.epf.fr/grade/edit/tree/index.php?id=14707";
  assert.deepEqual(
    gradeItemIdsOnPage(
      treePage,
      ["item.php?courseid=14707&id=88661", "item.php?courseid=14707&id=88660"],
      ["88660"]
    ),
    ["88660", "88661"]
  );
});
