// Editing a Deliverable that has already been published.
//
// A Devoir is where students' work is. Its module id is what every Submission,
// every bookmark and every link to it hangs off, so fixing a typo in a title
// or moving a Freeze by an hour has to rewrite the activity that is already
// there — never delete it and make another one beside it.
//
// The other half is what an edit must *not* touch: visibility is written when
// a Devoir is created and never again, so a Devoir revealed by hand on the
// morning of the exercise is still revealed after the next typo fix, and one
// still hidden is still hidden.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GRID_TITLE,
  devoirNamed,
  gridDefining,
  handInTo,
  itemNamed,
  submissionsOn,
  writeGrid,
} from "./harness.ts";

import type { Workspace } from "./harness.ts";

const C1_TITLE = "Your repository — C1 and C2";
const C3_TITLE = "Your C3 branch — recovering from failure";
const C1_FREEZE = "2026-09-10T20:00:00+02:00";
const C3_FREEZE = "2026-09-11T09:30:00+02:00";

/**
 * The course's two Deliverables, with whatever this test is editing changed
 * and everything else exactly as the real grid states it.
 *
 * Written as one function rather than as a pair of fixtures so that the two
 * runs in each test differ by the one field the test is about: an edit is what
 * these tests are for, and a fixture that differed in two places would not say
 * which one the publisher reacted to.
 */
function deliverables(
  edits: {
    readonly c1Title?: string;
    readonly c1Due?: string;
    readonly c3Due?: string;
  } = {}
): string {
  return `deliverables:
  - id: c1-1
    title: ${edits.c1Title ?? C1_TITLE}
    competencies: [C1, C2]
    due: ${edits.c1Due ?? C1_FREEZE}
  - id: c3-1
    title: ${C3_TITLE}
    competencies: [C3]
    due: ${edits.c3Due ?? C3_FREEZE}
    visible: false`;
}

/**
 * What the instructor does on 11 September: opens the Devoir in Moodle and
 * makes it visible. Nothing in the publisher can do it — which is the point —
 * so the tests do it the only way it happens, by changing the course.
 */
function revealByHand(workspace: Workspace, title: string): void {
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.map((item) =>
      item.name === title ? { ...item, visible: true } : item
    ),
  });
}

test("editing a Deliverable's title updates the Devoir in place", async () => {
  const retitled = "Your repository — C1 and C2 (one URL)";
  const workspace = gridDefining(deliverables());
  await workspace.publisher(["publish", "--apply"]);
  const before = devoirNamed(workspace, C1_TITLE);
  writeGrid(workspace, deliverables({ c1Title: retitled }));

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  const after = devoirNamed(workspace, retitled);
  assert.ok(before && after, `no Devoir called "${retitled}"`);
  // The same activity, rewritten. A new module id here is every Submission
  // gone, and nothing in the output would have said so.
  assert.equal(after.item.moduleId, before.item.moduleId);
  assert.equal(
    devoirNamed(workspace, C1_TITLE),
    undefined,
    "the old Devoir is still in the course beside the new one"
  );
  // The description quotes the title — it is the sentence that says what to
  // paste — so an edit that left the body alone would leave students reading
  // the old name.
  assert.ok(
    after.item.body.includes(retitled),
    `the description still reads:\n${after.item.body}`
  );
  assert.match(second.stdout, /updated\s+devoir/);
});

test("a Deliverable edited after work is handed in keeps the Submissions", async () => {
  // The criterion this feature exists for, checked on the thing it is about.
  // The two edits students see are the title and the description, and the
  // description is written from the title, so one edit moves both.
  const retitled = "Your repository — C1 and C2 (one URL)";
  const workspace = gridDefining(deliverables());
  await workspace.publisher(["publish", "--apply"]);
  handInTo(workspace, C1_TITLE, {
    email: "amina@epf.fr",
    url: "https://github.com/amina/agents-c1",
  });
  handInTo(workspace, C1_TITLE, {
    email: "bruno@epfedu.fr",
    url: "https://github.com/bruno/agents-c1",
  });
  writeGrid(workspace, deliverables({ c1Title: retitled }));

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  const after = devoirNamed(workspace, retitled);
  assert.ok(after);
  assert.ok(after.item.body.includes(retitled));
  // Two students' work, still on the activity, under the title it now has.
  // A run that deleted the Devoir and made another one beside it would leave
  // both of them with nothing handed in and nothing said about it.
  assert.deepEqual(submissionsOn(workspace, retitled), [
    { email: "amina@epf.fr", url: "https://github.com/amina/agents-c1" },
    { email: "bruno@epfedu.fr", url: "https://github.com/bruno/agents-c1" },
  ]);
});

test("changing the Freeze updates the live Devoir's due and cut-off dates in place", async () => {
  // The most expensive edit in this program: a Freeze corrected in the grid
  // and not carried into Moodle leaves students reading one deadline while
  // Moodle enforces the Freeze at another instant.
  const moved = "2026-09-10T18:00:00+02:00";
  const workspace = gridDefining(deliverables());
  await workspace.publisher(["publish", "--apply"]);
  const before = devoirNamed(workspace, C1_TITLE);

  writeGrid(workspace, deliverables({ c1Due: moved }));
  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  const after = devoirNamed(workspace, C1_TITLE);
  assert.ok(before && after);
  assert.equal(after.item.moduleId, before.item.moduleId);
  // Both dates, from the one Freeze. A grace window is what a cut-off left at
  // the old instant would be.
  assert.equal(after.settings.due, moved);
  assert.equal(after.settings.cutOff, moved);
  // And what students read on the activity says the same instant.
  assert.match(after.item.body, /at 18:00 Europe\/Paris/);
  // The other Devoir is left alone: one edit, one update.
  assert.match(second.stdout, /skip\s+devoir\s+Your C3 branch/);
});

test("an edited Deliverable is planned as an update, and reporting applies nothing", async () => {
  const workspace = gridDefining(deliverables());
  await workspace.publisher(["publish", "--apply"]);
  writeGrid(workspace, deliverables({ c1Due: "2026-09-10T18:00:00+02:00" }));

  const plan = await workspace.publisher(["publish"]);

  assert.equal(plan.code, 0, plan.stderr);
  assert.match(plan.stdout, /update\s+c1-1/);
  assert.match(plan.stdout, /skip\s+c3-1/);
  // The Freeze the plan states is the one that would be written, stated in
  // full: this block is the check against the timetable.
  assert.match(
    plan.stdout,
    /Thursday 10 September 2026 at 18:00 Europe\/Paris \(2026-09-10T18:00:00\+02:00\)/
  );
  const devoir = devoirNamed(workspace, C1_TITLE);
  assert.equal(devoir?.settings.cutOff, C1_FREEZE);
});

test("a second consecutive publish --apply reports zero Devoir changes", async () => {
  const workspace = gridDefining(deliverables());
  await workspace.publisher(["publish", "--apply"]);
  const before = workspace.readCourse();

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /skip\s+devoir\s+Your repository/);
  assert.match(second.stdout, /skip\s+devoir\s+Your C3 branch/);
  assert.doesNotMatch(second.stdout, /updated\s+devoir/);
  assert.doesNotMatch(second.stdout, /created\s+devoir/);
  // Boring all the way down: the course file is what it was, dates and all.
  assert.deepEqual(second.code === 0 ? workspace.readCourse() : {}, before);
});

test("a Devoir revealed by hand stays revealed after a later run that edits it", async () => {
  // 11 September: the instructor reveals the C3 Devoir with one click, and the
  // next edit to its description must not take that back. There is no
  // visibility on the update at all, so there is nothing here to get wrong.
  const workspace = gridDefining(deliverables());
  await workspace.publisher(["publish", "--apply"]);
  revealByHand(workspace, C3_TITLE);
  writeGrid(workspace, deliverables({ c3Due: "2026-09-11T10:00:00+02:00" }));

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  const c3 = devoirNamed(workspace, C3_TITLE);
  assert.ok(c3);
  assert.equal(c3.item.visible, true, "the update re-hid a revealed Devoir");
  assert.equal(c3.settings.cutOff, "2026-09-11T10:00:00+02:00");
});

test("a Devoir still hidden stays hidden through an edit", async () => {
  // The other side of the same rule: an update writes no visibility, so it
  // cannot reveal an exercise students are not meant to have yet either.
  const workspace = gridDefining(deliverables());
  await workspace.publisher(["publish", "--apply"]);
  writeGrid(workspace, deliverables({ c3Due: "2026-09-11T10:00:00+02:00" }));

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  const c3 = devoirNamed(workspace, C3_TITLE);
  assert.ok(c3);
  assert.equal(c3.item.visible, false);
  assert.equal(c3.settings.cutOff, "2026-09-11T10:00:00+02:00");
});

test("an edit keeps what a Devoir collects: online text, never files", async () => {
  const workspace = gridDefining(deliverables());
  await workspace.publisher(["publish", "--apply"]);
  writeGrid(workspace, deliverables({ c1Title: "Your repository — C1, C2" }));

  await workspace.publisher(["publish", "--apply"]);

  const devoir = devoirNamed(workspace, "Your repository — C1, C2");
  assert.ok(devoir);
  assert.equal(devoir.settings.onlineText, true);
  assert.equal(devoir.settings.fileUpload, false);
});

test("an updated Devoir keeps its manifest entry, with the date it was first published", async () => {
  const workspace = gridDefining(deliverables());
  await workspace.publisher(["publish", "--apply"]);
  const first = workspace.readManifest().documents["deliverable:c1-1"];
  writeGrid(workspace, deliverables({ c1Due: "2026-09-10T18:00:00+02:00" }));

  await workspace.publisher(["publish", "--apply"]);

  const after = workspace.readManifest().documents["deliverable:c1-1"];
  assert.ok(first && after);
  assert.equal(after["kind"], "devoir");
  assert.equal(after["moduleId"], first["moduleId"]);
  assert.equal(after["publishedAt"], first["publishedAt"]);
  assert.notEqual(after["contentHash"], first["contentHash"]);
});

test("a Devoir deleted in Moodle is created again rather than updated into nothing", async () => {
  // The record outlived what it recorded. Updating would open a form on a
  // module id that names nothing; the activity has to be made again.
  const workspace = gridDefining(deliverables());
  await workspace.publisher(["publish", "--apply"]);
  const before = devoirNamed(workspace, C1_TITLE);
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.filter((item) => item.name !== C1_TITLE),
  });

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  const after = devoirNamed(workspace, C1_TITLE);
  assert.ok(before && after);
  assert.notEqual(after.item.moduleId, before.item.moduleId);
  assert.match(second.stdout, /created\s+devoir\s+Your repository/);
});

test("a Devoir's link follows the brief when the brief is created again", async () => {
  // The brief was deleted in Moodle and the next run makes it afresh, with a
  // module id it did not have. Nothing about the repository changed, so the
  // hash says there is nothing to do — and the link in the Devoir's
  // description would point at an activity that no longer exists. The run is
  // what sees that, and rewrites the description with the new id.
  const workspace = gridDefining(deliverables());
  await workspace.publisher(["publish", "--apply"]);
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.filter((item) => item.name !== GRID_TITLE),
  });

  const second = await workspace.publisher(["publish", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  const grid = itemNamed(workspace, GRID_TITLE);
  const devoir = devoirNamed(workspace, C1_TITLE);
  assert.ok(grid && devoir);
  assert.match(
    devoir.item.body,
    new RegExp(`href="[^"]*/mod/resource/view\\.php\\?id=${grid.moduleId}"`)
  );
});
