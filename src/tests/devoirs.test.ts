// Devoirs: the activities students actually hand in to.
//
// Driven through the command line like everything else here. What is asserted
// on is what the run left behind — the course file, the manifest, the exit
// code, the words printed — and never a selector: the browser driver is one of
// two implementations of the seam these tests exercise, and a test that knew
// its markup would be testing Moodle's theme.
//
// The expensive failures this file exists to catch are all silent ones. A
// Devoir that collects files, a cut-off an hour out, a second Devoir beside the
// one students already used, an empty section on the course page: none of them
// throws anything, and every one of them is found out by a student.
import { test } from "node:test";
import assert from "node:assert/strict";

import { DELIVERABLE_SECTION } from "../packages/course/index.ts";
import {
  BOTH_DELIVERABLES as BOTH,
  GRID_TITLE,
  devoirNamed,
  gridDefining,
  itemNamed,
  sectionsOf,
} from "./harness.ts";

const C1_TITLE = "Your repository — C1 and C2";
const C3_TITLE = "Your C3 branch — recovering from failure";

test("publish --apply creates one Devoir per Deliverable", async () => {
  const workspace = gridDefining(BOTH);

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const c1 = devoirNamed(workspace, C1_TITLE);
  const c3 = devoirNamed(workspace, C3_TITLE);
  assert.ok(c1, `no Devoir for c1-1:\n${result.stdout}`);
  assert.ok(c3, `no Devoir for c3-1:\n${result.stdout}`);
  // Two Deliverables, two Devoirs, and two different activities: one Devoir
  // serving both would be one URL where the course asks for two.
  assert.notEqual(c1.item.moduleId, c3.item.moduleId);
});

test("a Devoir accepts online text and has file upload disabled", async () => {
  // The rule this design turns on. A Devoir collecting files is students
  // uploading zips of their repositories, and an artifact somebody then has to
  // store and serve.
  //
  // What this asserts is that a run reaches the end with those settings on the
  // Devoir it made. What it cannot assert is that the *form* is told them —
  // the fake course has no form — so the switches themselves are asserted in
  // `devoir-form.test.ts`, against the list the browser driver ticks its way
  // through. Neither test is the whole statement on its own.
  const workspace = gridDefining(BOTH);

  await workspace.publisher(["publish", "--apply"]);

  for (const title of [C1_TITLE, C3_TITLE]) {
    const devoir = devoirNamed(workspace, title);
    assert.ok(devoir, `no Devoir called "${title}"`);
    assert.equal(devoir.settings.onlineText, true, title);
    assert.equal(devoir.settings.fileUpload, false, title);
  }
});

test("a Devoir's due date and cut-off date are both the Freeze, to the minute", async () => {
  // One instant in both fields is what makes a late Submission not exist,
  // rather than exist and be flagged. A second date here would be a grace
  // window nobody wrote down.
  const workspace = gridDefining(BOTH);

  await workspace.publisher(["publish", "--apply"]);

  const c1 = devoirNamed(workspace, C1_TITLE);
  const c3 = devoirNamed(workspace, C3_TITLE);
  assert.ok(c1 && c3);
  // Compared against the string the front matter states, not against a
  // re-rendering of it: the offset is what makes 20:00 one instant, and a test
  // comparing two re-renderings would pass whatever the rendering did.
  //
  // This is the instant travelling intact, end to end. Turning it into the
  // five numbers a Moodle form receives is the other half, and the fake has no
  // form to receive them — that half is `devoir-form.test.ts`.
  assert.equal(c1.settings.due, "2026-09-10T20:00:00+02:00");
  assert.equal(c1.settings.cutOff, "2026-09-10T20:00:00+02:00");
  assert.equal(c3.settings.due, "2026-09-11T09:30:00+02:00");
  assert.equal(c3.settings.cutOff, "2026-09-11T09:30:00+02:00");
});

test("a Devoir's description says what to paste, states the Freeze and links to the brief", async () => {
  const workspace = gridDefining(BOTH);

  await workspace.publisher(["publish", "--apply"]);

  const devoir = devoirNamed(workspace, C1_TITLE);
  const grid = itemNamed(workspace, GRID_TITLE);
  assert.ok(devoir && grid);
  // What to paste: the Deliverable's own title, which is the sentence that
  // says it. There is no second field distinguishing a repository URL from a
  // branch URL, and there should not be.
  assert.match(devoir.item.body, /pasting one URL/);
  assert.match(devoir.item.body, /Your repository — C1 and C2/);
  // The Freeze, in the same words the plan states it in.
  assert.match(
    devoir.item.body,
    /Thursday 10 September 2026 at 20:00 Europe\/Paris \(2026-09-10T20:00:00\+02:00\)/
  );
  // And the brief, as a link to the activity that holds its prose — not a copy
  // of the prose. Pointed at the module id Moodle gave the page in this run.
  assert.match(
    devoir.item.body,
    new RegExp(`href="[^"]*/mod/page/view\\.php\\?id=${grid.moduleId}"`)
  );
  assert.match(devoir.item.body, new RegExp(GRID_TITLE));
});

test("the Devoirs land in a Deliverables section the run creates, and it is visible", async () => {
  const workspace = gridDefining(BOTH);

  await workspace.publisher(["publish", "--apply"]);

  assert.deepEqual(
    sectionsOf(workspace).find(([name]) => name === DELIVERABLE_SECTION),
    [DELIVERABLE_SECTION, true]
  );
  for (const title of [C1_TITLE, C3_TITLE]) {
    const devoir = devoirNamed(workspace, title);
    assert.ok(devoir, `no Devoir called "${title}"`);
    assert.equal(devoir.item.section, DELIVERABLE_SECTION);
  }
});

test("the hidden C3 Devoir sits inside a visible Deliverables section", async () => {
  // Two locks would be one too many, and the wrong one: hiding the section
  // would take the C1 Devoir off the course page with it, and students would
  // have nowhere to hand in on 10 September. The Devoir is hidden; the section
  // is never hidden.
  const workspace = gridDefining(BOTH);

  await workspace.publisher(["publish", "--apply"]);

  const c1 = devoirNamed(workspace, C1_TITLE);
  const c3 = devoirNamed(workspace, C3_TITLE);
  assert.ok(c1 && c3);
  assert.equal(c1.item.visible, true);
  assert.equal(c3.item.visible, false);
  assert.deepEqual(
    sectionsOf(workspace).find(([name]) => name === DELIVERABLE_SECTION),
    [DELIVERABLE_SECTION, true]
  );
});

test("publish without --apply creates no Devoir", async () => {
  const workspace = gridDefining(BOTH);

  const result = await workspace.publisher(["publish"]);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(workspace.readCourse().items, []);
  assert.equal(workspace.readCourse().devoirs, undefined);
  assert.deepEqual(workspace.readManifest().documents, {});
  assert.match(result.stdout, /Nothing has been applied/);
});

test("the plan says what it would do to each Devoir, with the Freeze in full", async () => {
  const workspace = gridDefining(BOTH);

  const planned = await workspace.publisher(["publish"]);
  await workspace.publisher(["publish", "--apply"]);
  const again = await workspace.publisher(["publish"]);

  assert.match(planned.stdout, /create\s+c1-1\s+Your repository — C1 and C2/);
  assert.match(planned.stdout, /create\s+c3-1/);
  // And afterwards, nothing to do — with both Freezes still stated in full,
  // because a date nobody reads again until a student meets it is the whole
  // failure this block exists to prevent.
  assert.equal(again.code, 0, again.stderr);
  assert.match(again.stdout, /skip\s+c1-1/);
  assert.match(again.stdout, /skip\s+c3-1/);
  assert.match(
    again.stdout,
    /Friday 11 September 2026 at 09:30 Europe\/Paris \(2026-09-11T09:30:00\+02:00\)/
  );
});

test("the manifest records each Devoir by module id, saying it is a Devoir", async () => {
  const workspace = gridDefining(BOTH);

  await workspace.publisher(["publish", "--apply"]);

  const entry = workspace.readManifest().documents["deliverable:c1-1"];
  const devoir = devoirNamed(workspace, C1_TITLE);
  assert.ok(entry, "expected a manifest entry for c1-1");
  assert.ok(devoir);
  assert.equal(entry["kind"], "devoir");
  assert.equal(entry["moduleId"], devoir.item.moduleId);
  assert.equal(entry["section"], DELIVERABLE_SECTION);
  // Recorded under a key that is plainly not a repository path, beside the
  // page entries in the one file a wipe clears.
  assert.ok(
    Object.keys(workspace.readManifest().documents).includes(
      "assessment-grid.md"
    )
  );
});

test("a second run adds no second Devoir beside the one students used", async () => {
  const workspace = gridDefining(BOTH);
  await workspace.publisher(["publish", "--apply"]);
  const first = devoirNamed(workspace, C1_TITLE);

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  const after = devoirNamed(workspace, C1_TITLE);
  assert.ok(first && after);
  assert.equal(after.item.moduleId, first.item.moduleId);
  assert.equal(
    workspace.readCourse().items.filter((item) => item.name === C1_TITLE)
      .length,
    1
  );
  assert.equal(Object.keys(workspace.readCourse().devoirs ?? {}).length, 2);
});

test("a Deliverable defined in a document this run does not publish aborts", async () => {
  // The description's whole content is "here is where the brief is". A Devoir
  // whose link points nowhere is a hand-in box for an exercise nobody can
  // read, and it would be found out by a student at a deadline.
  const workspace = gridDefining(BOTH);
  workspace.writeCatalog({
    published: [],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Aborting/);
  assert.match(result.stderr, /c1-1/);
  assert.match(result.stderr, /assessment-grid\.md/);
  // Nothing published, and no section made for a Devoir that was never created.
  assert.deepEqual(workspace.readCourse().items, []);
  assert.equal(
    sectionsOf(workspace).some(([name]) => name === DELIVERABLE_SECTION),
    false
  );
});
