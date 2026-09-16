// Reading an activity's visibility off a course page: which element carries
// the mark, and which class on it means hidden.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  activityAddedBy,
  readActivityVisibility,
  readsAsDevoir,
  readsAsHoldingSubmissions,
} from "../packages/course/activities.ts";

/**
 * "Instructor — oral interview script" as Moodle rendered it in course 14707
 * on 2026-08-27, transcribed from the HTML the run recorder kept beside the
 * abort (`runs/2026-08-27T11-24-25Z/`). The page was hidden — the
 * course page showed it "Caché pour les étudiants" — and the publisher read it
 * back as visible and aborted the run.
 */
const HIDDEN_PAGE = {
  className: "activity activity-wrapper page modtype_page  hasinfo ",
  itemClassName: "activity-item focus-control hiddenactivity",
} as const;

/** A visible activity from the same page, for contrast. */
const VISIBLE_PAGE = {
  className: "activity activity-wrapper page modtype_page  hasinfo ",
  itemClassName: "activity-item focus-control ",
} as const;

test("an activity Moodle marks hidden on its card is read as hidden", () => {
  // The whole bug in one assertion: the `<li>` carries no `hidden` class, so
  // reading only the `<li>` reports this page — the oral interview script —
  // as sitting on the course page in front of the students.
  assert.deepEqual(readActivityVisibility(HIDDEN_PAGE), {
    visible: false,
    stealth: false,
  });
});

test("an activity with no such mark is read as visible", () => {
  assert.deepEqual(readActivityVisibility(VISIBLE_PAGE), {
    visible: true,
    stealth: false,
  });
});

test("a hidden class on the activity itself is still read, for older markup", () => {
  assert.equal(
    readActivityVisibility({
      className: "activity page modtype_page hidden",
      itemClassName: "",
    }).visible,
    false
  );
});

test("a stealthed activity is read as stealthed from either element", () => {
  for (const markup of [
    { className: "activity page modtype_page stealth", itemClassName: "" },
    {
      className: "activity page modtype_page",
      itemClassName: "activity-item stealth",
    },
  ]) {
    assert.equal(readActivityVisibility(markup).stealth, true);
  }
});

test("a theme class that merely mentions hiding does not hide anything", () => {
  // Matched on whole tokens: as a substring, these would report an activity
  // that really is on the course page as safely hidden.
  assert.deepEqual(
    readActivityVisibility({
      className: "activity activity-hidden-badge",
      itemClassName: "activity-item hiddenactivity-toggle stealth-toggle",
    }),
    { visible: true, stealth: false }
  );
});

test("the created activity is the one whose module id was not there before", () => {
  // Course 14707 on 2026-08-27, transcribed from the run recorder's capture
  // (`runs/2026-08-27T14-13-44Z/`): the brief moved from Labs to
  // Autonomy, and the copy already published in Labs was still there.
  const before = [
    { moduleId: "603686", name: "Lab 1 — Frame and decompose your own work" },
    { moduleId: "604466", name: "C3 Exercise — The sales pipeline bug" },
  ];
  const after = [
    ...before,
    { moduleId: "604468", name: "C3 Exercise — The sales pipeline bug" },
  ];

  const addition = activityAddedBy(before, after);

  // The whole bug in one assertion: by name this is 604466, the older copy,
  // which the course page lists first. Recording it pointed the manifest at an
  // activity the run had not created, and the read-back that proves a brief
  // was created hidden proved it of the wrong page.
  assert.deepEqual(addition, { kind: "added", activity: after[2] });
});

test("a create that added nothing is not some activity that was already there", () => {
  const before = [
    { moduleId: "604466", name: "C3 Exercise — The sales pipeline bug" },
  ];

  assert.deepEqual(activityAddedBy(before, before), { kind: "nothing" });
});

test("a course that gained more than one activity is not guessed at", () => {
  const before = [{ moduleId: "603686", name: "Lab 1" }];
  const after = [
    ...before,
    { moduleId: "604468", name: "C3 Exercise — The sales pipeline bug" },
    { moduleId: "604469", name: "C3 Exercise — The sales pipeline bug" },
  ];

  assert.deepEqual(activityAddedBy(before, after), {
    kind: "unrecognisable",
    appeared: 2,
  });
});

// Which activities on a course page are Devoirs. It is the question `wipe`
// asks before it deletes anything, and a wrong "no" is a student's work gone,
// so both markers the page carries are read and neither is trusted alone.

const DEVOIR = {
  className: "activity activity-wrapper assign modtype_assign  hasinfo ",
  itemClassName: "activity-item focus-control ",
} as const;

test("an activity Moodle classes modtype_assign is read as a Devoir", () => {
  assert.equal(readsAsDevoir(DEVOIR, "/mod/assign/view.php?id=604470"), true);
});

test("a Devoir whose classes a theme rewrote is still read from its link", () => {
  const reskinned = { className: "activity", itemClassName: "activity-item" };

  assert.equal(
    readsAsDevoir(reskinned, "/mod/assign/view.php?id=604470"),
    true
  );
});

test("a Devoir the page lists without a link is still read from its class", () => {
  assert.equal(readsAsDevoir(DEVOIR, ""), true);
});

test("a page is not a Devoir, and neither is the module named like one", () => {
  const page = {
    className: "activity activity-wrapper page modtype_page  hasinfo ",
    itemClassName: "activity-item focus-control ",
  };
  assert.equal(readsAsDevoir(page, "/mod/page/view.php?id=603686"), false);
  // Pre-4.0 `mod_assignment` is a different module with a different page, and
  // a substring match would read it — and every theme class that merely
  // contains the word — as the thing this guard protects.
  const oldModule = {
    className: "activity modtype_assignment",
    itemClassName: "activity-item",
  };
  assert.equal(
    readsAsDevoir(oldModule, "/mod/assignment/view.php?id=1"),
    false
  );
});

// What one row of the grading table says a Student has handed in. This is the
// decision that used to sit in a CSS selector, where the only test available
// was a live Moodle with thirty students' work in it.

test("a row Moodle classes submitted holds work", () => {
  assert.equal(
    readsAsHoldingSubmissions(["cell c4 submissionstatussubmitted", "cell c5"]),
    true
  );
});

test("a draft holds work: it is typed into the Devoir and goes down with it", () => {
  assert.equal(readsAsHoldingSubmissions(["submissionstatusdraft"]), true);
});

test("a reopened submission holds work", () => {
  assert.equal(readsAsHoldingSubmissions(["submissionstatusreopened"]), true);
});

test("a Student who has handed in nothing holds nothing", () => {
  assert.equal(
    readsAsHoldingSubmissions(["cell c4 submissionstatusnew"]),
    false
  );
});

test("the grading table itself is not a Submission", () => {
  // The false refusal the substring selector produced: `submissionstatustable`
  // names the table around every row, including every row of a Devoir nobody
  // has handed anything into, so a course with Students and nothing handed in
  // read as holding Submissions — and issue #41 asks for exactly that course
  // to stay rebuildable.
  assert.equal(readsAsHoldingSubmissions(["submissionstatustable"]), false);
});

test("a status class this program has not seen is taken to be a Submission", () => {
  // The direction the whole guard errs in: an unknown status costs a refusal
  // and a look in Moodle, where a missed one costs a Student's work.
  assert.equal(readsAsHoldingSubmissions(["submissionstatusmarooned"]), true);
});

test("a bare submissionstatus is a Student who has never touched the Devoir", () => {
  // The class core actually renders for an untouched row, and the reading this
  // program got wrong until a live course was read: the grading table builds
  // the class as `'submissionstatus' . $displaystatus` after blanking a status
  // of `new`, so `submissionstatusnew` never appears and the bare token carries
  // "Pas de travail remis" on every row of a Devoir nobody has handed into.
  // Counting it made a course nobody had handed into unrebuildable.
  assert.equal(readsAsHoldingSubmissions(["cell c4 submissionstatus"]), false);
});

test("a bare submissionstatus beside a real status still holds work", () => {
  // The exclusion is of one whole token and not of the row: a status cell that
  // carries both the container class and a status keeps its Submission.
  assert.equal(
    readsAsHoldingSubmissions([
      "submissionstatus",
      "submissionstatus submissionstatussubmitted",
    ]),
    true
  );
});

test("a row with no status class at all holds nothing", () => {
  assert.equal(readsAsHoldingSubmissions(["cell c0", "cell c1 email"]), false);
});
