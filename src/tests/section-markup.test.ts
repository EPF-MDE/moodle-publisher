// Reading sections off a course page: which attribute is the id, and which
// section a run of the add-a-section URL actually added.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  readSections,
  sectionAddedBy,
  type SectionMarkup,
} from "../packages/course/sections.ts";

/**
 * The three sections of the live course (14707), transcribed from its page.
 * The two numbers that matter are on the same element: `data-sectionid="2"` is
 * the section's place on the page, `data-id="171545"` is its row id.
 */
const LIVE_COURSE: readonly SectionMarkup[] = [
  {
    name: "",
    dataNumber: "0",
    dataSectionId: "0",
    dataId: "159068",
    editSectionId: null,
    className: "",
  },
  {
    name: "Assessment",
    dataNumber: "1",
    dataSectionId: "1",
    dataId: "171529",
    editSectionId: null,
    className: "",
  },
  {
    name: "Section 2",
    dataNumber: "2",
    dataSectionId: "2",
    dataId: "171545",
    editSectionId: null,
    className: "",
  },
];

test("a section's id is its row id, never the number data-sectionid carries", () => {
  const sections = readSections(LIVE_COURSE);

  // The whole bug in one assertion: reading "2" here addresses
  // editsection.php?id=2, which is a section of somebody else's course.
  assert.deepEqual(sections, [
    { number: 0, name: "", id: "159068", visible: true },
    { number: 1, name: "Assessment", id: "171529", visible: true },
    { number: 2, name: "Section 2", id: "171545", visible: true },
  ]);
});

test("an editsection link is taken over data-id when the page is in edit mode", () => {
  const [section] = readSections([
    {
      name: " Labs ",
      dataNumber: "3",
      dataSectionId: "3",
      dataId: "171546",
      editSectionId: "171546",
      className: "",
    },
  ]);

  assert.deepEqual(section, {
    number: 3,
    name: "Labs",
    id: "171546",
    visible: true,
  });
});

test("a section that says no id is read without one, so no write is addressed to it", () => {
  const sections = readSections([
    {
      name: "General",
      dataNumber: null,
      dataSectionId: null,
      dataId: null,
      editSectionId: null,
      className: "",
    },
    {
      name: "Lectures",
      dataNumber: null,
      dataSectionId: "1",
      dataId: null,
      editSectionId: null,
      className: "",
    },
  ]);

  assert.deepEqual(sections, [
    // No number on the page either: its place in the list is the number.
    { number: 0, name: "General", id: undefined, visible: true },
    // data-sectionid is the number, and is read as one.
    { number: 1, name: "Lectures", id: undefined, visible: true },
  ]);
});

const before = readSections(LIVE_COURSE);

test("the added section is the one whose id was not there before", () => {
  const after = readSections([
    // A format is free to put the new section anywhere: it is found by id,
    // not by being last.
    LIVE_COURSE[0]!,
    {
      name: "Section 3",
      dataNumber: "1",
      dataSectionId: "1",
      dataId: "171999",
      editSectionId: null,
      className: "",
    },
    LIVE_COURSE[1]!,
    LIVE_COURSE[2]!,
  ]);

  assert.deepEqual(sectionAddedBy(before, after), {
    kind: "added",
    section: { number: 1, name: "Section 3", id: "171999", visible: true },
  });
});

test("an add that added nothing is not the last section", () => {
  // What format-flexsections does: the URL returns, the course is unchanged.
  // Answering "the last one" here is what renamed the instructor's own
  // "Section 2" to "Lectures".
  assert.deepEqual(sectionAddedBy(before, before), { kind: "nothing" });
});

test("a course that grew but cannot say by which section is not guessed at", () => {
  const after = readSections([
    ...LIVE_COURSE,
    {
      name: "Section 3",
      dataNumber: "3",
      dataSectionId: "3",
      dataId: null,
      editSectionId: null,
      className: "",
    },
  ]);

  assert.deepEqual(sectionAddedBy(before, after), {
    kind: "unrecognisable",
    grew: 1,
  });
});

test("a hidden section is read as hidden, and a theme class that merely says so is not", () => {
  const sections = readSections([
    {
      name: "Autonomy",
      dataNumber: "4",
      dataSectionId: "4",
      dataId: "171600",
      editSectionId: null,
      className: "section course-section hidden",
    },
    {
      // The trap: a class whose *name* contains the word. Matching it as a
      // substring would report every section hidden, and a section an
      // instructor hid by hand would be indistinguishable from one they did
      // not.
      name: "Labs",
      dataNumber: "3",
      dataSectionId: "3",
      dataId: "171599",
      editSectionId: null,
      className: "section course-section section-hiddenfromstudents-badge",
    },
  ]);

  assert.deepEqual(
    sections.map((section) => [section.name, section.visible]),
    [
      ["Autonomy", false],
      ["Labs", true],
    ]
  );
});
