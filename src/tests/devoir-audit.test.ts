// The audit over the Devoirs: what students hand in to, checked against the
// front matter that defines it.
//
// Every test here drifts the course the way a human does — in Moodle, by hand,
// after the run that published it — and then runs the audit and reads what it
// says. That is the whole point of the feature: the drift is invisible on the
// course page, and without this it is found out by a student at a Freeze.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BOTH_DELIVERABLES,
  devoirNamed,
  gridDefining,
  writeGrid,
} from "./harness.ts";

import type { Workspace } from "./harness.ts";

const C1_TITLE = "Your repository — C1 and C2";
const C3_TITLE = "Your C3 branch — recovering from failure";

/**
 * The front matter with the C3 Deliverable dropped, which is what editing one
 * out looks like: the definition goes, and the Devoir published for it stays
 * in the course until somebody deletes it in Moodle.
 */
const WITHOUT_C3 = BOTH_DELIVERABLES.slice(
  0,
  BOTH_DELIVERABLES.indexOf("  - id: c3-1")
);

/** A course with both Devoirs published, as a run leaves it. */
async function published(): Promise<Workspace> {
  const workspace = gridDefining(BOTH_DELIVERABLES);
  const result = await workspace.publisher(["publish", "--apply"]);
  assert.equal(result.code, 0, result.stderr);
  return workspace;
}

/**
 * Edits the collection settings of the Devoir called `title`, in the course and
 * nowhere else.
 *
 * This is a hand edit in Moodle: the manifest is untouched, the repository is
 * untouched, and nothing about the course page changes. What the instructor
 * would see afterwards is the same course they published, which is why the
 * audit has to open the activity to see it at all.
 */
function editInMoodle(
  workspace: Workspace,
  title: string,
  settings: Record<string, unknown>
): void {
  const devoir = devoirNamed(workspace, title);
  assert.ok(devoir, `no Devoir called "${title}"`);
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    devoirs: {
      ...course.devoirs,
      [devoir.item.moduleId]: { ...devoir.settings, ...settings },
    },
  });
}

test("the audit passes on the Devoirs a run has just published", async () => {
  const workspace = await published();

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 0, result.stdout);
  assert.match(result.stdout, /Audit passed/);
  assert.match(
    result.stdout,
    /2 Devoir\(s\) collecting a URL and closing at the Freeze/
  );
});

test("a cut-off moved by hand in Moodle fails the audit, naming both instants", async () => {
  // The failure that shipped once already, in the other direction: the course
  // said 14:00 and the repository said 20:00, and the students worked to the
  // course.
  const workspace = await published();
  editInMoodle(workspace, C1_TITLE, { cutOff: "2026-09-10T14:00:00+02:00" });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /Audit failed/);
  assert.match(
    result.stdout,
    /cut-off date of Thursday 10 September 2026 at 14:00/
  );
  assert.match(
    result.stdout,
    /at 20:00 Europe\/Paris \(2026-09-10T20:00:00\+02:00\)/
  );
});

test("a due date moved by hand in Moodle fails the audit", async () => {
  const workspace = await published();
  editInMoodle(workspace, C3_TITLE, { due: "2026-09-11T11:30:00+02:00" });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /due date of Friday 11 September 2026 at 11:30/);
  assert.match(result.stdout, /\(c3-1\)/);
});

test("a cut-off switched off in Moodle is reported as the Freeze not being enforced", async () => {
  const workspace = await published();
  editInMoodle(workspace, C1_TITLE, { cutOff: undefined });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /has no cut-off date in the course/);
  assert.match(result.stdout, /accepts work for ever/);
});

test("file upload switched back on fails the audit", async () => {
  const workspace = await published();
  editInMoodle(workspace, C1_TITLE, { fileUpload: true });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /accepts file uploads/);
  assert.match(result.stdout, /collects a URL and never a file/);
});

test("online text switched off fails the audit: there is nowhere to paste", async () => {
  const workspace = await published();
  editInMoodle(workspace, C1_TITLE, { onlineText: false });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /does not collect online text/);
});

test("a Devoir deleted from the course fails the audit", async () => {
  const workspace = await published();
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.filter((item) => item.name !== C1_TITLE),
  });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(
    result.stdout,
    /is recorded as module \d+ and is not in the course/
  );
  assert.match(result.stdout, /nowhere to hand in/);
});

test("a Deliverable nothing has been published for fails the audit", async () => {
  const workspace = gridDefining(BOTH_DELIVERABLES);

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /no Devoir has been published for it/);
  assert.match(result.stdout, /\(c1-1\)/);
  assert.match(result.stdout, /\(c3-1\)/);
});

test("a Devoir moved to another section fails the audit", async () => {
  const workspace = await published();
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.map((item) =>
      item.name === C1_TITLE ? { ...item, section: "Archive" } : item
    ),
  });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /is in section Archive/);
  assert.match(result.stdout, /manifest records Deliverables/);
});

test("the audit states that the C3 Devoir is still hidden, and passes", async () => {
  const workspace = await published();

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 0, result.stdout);
  assert.match(result.stdout, /Noted, and not a failure/);
  assert.match(result.stdout, /\(c3-1\) is hidden from students/);
  assert.match(result.stdout, /revealed by hand/);
});

test("the audit states that the C3 Devoir has been revealed, and passes", async () => {
  // The morning of 11 September: the instructor reveals it, and the checklist
  // ends by running this and reading what it says.
  const workspace = await published();
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.map((item) =>
      item.name === C3_TITLE ? { ...item, visible: true } : item
    ),
  });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 0, result.stdout);
  assert.match(result.stdout, /\(c3-1\) is visible to students/);
  assert.match(
    result.stdout,
    /revealed by hand — which is how it is meant to happen/
  );
});

test("a Devoir taken off the course page is noted, whoever did it", async () => {
  const workspace = await published();
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.map((item) =>
      item.name === C1_TITLE ? { ...item, visible: false } : item
    ),
  });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 0, result.stdout);
  assert.match(
    result.stdout,
    /\(c1-1\) is not on the course page for students/
  );
  assert.match(result.stdout, /nobody can hand in while it is off/);
});

test("the audit writes nothing to a course whose Devoirs have drifted", async () => {
  // The property that makes it worth running an hour before a Freeze. Asserted
  // over a course that fails, because a run that found nothing wrong is the
  // easy case: this one has findings to report and still puts nothing right.
  const workspace = await published();
  editInMoodle(workspace, C1_TITLE, {
    cutOff: "2026-09-10T14:00:00+02:00",
    fileUpload: true,
  });
  const before = JSON.stringify(workspace.readCourse());
  const manifestBefore = JSON.stringify(workspace.readManifest());

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.equal(JSON.stringify(workspace.readCourse()), before);
  assert.equal(JSON.stringify(workspace.readManifest()), manifestBefore);
});

test("a Freeze edited in the repository is reported until the next publish", async () => {
  // The other direction of the same disagreement: the course is what was
  // published and the front matter has moved on. The audit reports it, and a
  // run puts it right — which is what makes the report actionable rather than
  // a thing to be endured.
  const workspace = await published();
  writeGrid(
    workspace,
    BOTH_DELIVERABLES.replace(
      "2026-09-10T20:00:00+02:00",
      "2026-09-10T18:00:00+02:00"
    )
  );

  const drifted = await workspace.publisher(["audit"]);
  assert.equal(drifted.code, 1);
  assert.match(drifted.stdout, /at 20:00 Europe\/Paris/);
  assert.match(drifted.stdout, /at 18:00 Europe\/Paris/);

  await workspace.publisher(["publish", "--apply"]);
  const settled = await workspace.publisher(["audit"]);

  assert.equal(settled.code, 0, settled.stdout);
});

test("a Devoir whose settings cannot be read is said to be unread, not passed over", async () => {
  // What an unreadable form looks like from above: the activity is on the
  // course page and nothing can say what it collects. The audit reports what
  // it could not check rather than concluding anything from it — a question
  // this program cannot ask is not evidence that the answer is fine.
  const workspace = await published();
  const course = workspace.readCourse();
  const devoir = devoirNamed(workspace, C1_TITLE);
  assert.ok(devoir);
  const { [devoir.item.moduleId]: _unreadable, ...rest } = course.devoirs ?? {};
  workspace.writeCourse({ ...course, devoirs: rest });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 0, result.stdout);
  assert.match(result.stdout, /could not be read/);
  assert.match(
    result.stdout,
    /Check the Freeze and the submission types by hand/
  );
  // One Devoir was read, and the report counts what it read rather than what
  // it looked at.
  assert.match(result.stdout, /1 Devoir\(s\) collecting a URL/);
});

test("a Devoir the front matter no longer defines is reported, and fails", async () => {
  // The other way a Deliverable and its Devoir come apart: not the activity
  // deleted, but the definition. The hand-in box stays in the course, students
  // can still hand in to it, and nothing in the repository grades what they
  // hand in — which is invisible from both the course page and the front
  // matter, and is only ever found by reading the two against each other.
  const workspace = await published();
  writeGrid(workspace, WITHOUT_C3);

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /no longer defines the Deliverable c3-1/);
  assert.match(result.stdout, /Students can still hand in to it/);
});

test("a manifest entry for a Deliverable and a Devoir both gone is noted", async () => {
  // Nothing student-facing is wrong here: there is no Deliverable and no
  // activity, only a record of one. It is said, because a stale record is what
  // a later reader would otherwise take for a published Devoir, and it does
  // not fail the run.
  const workspace = await published();
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.filter((item) => item.name !== C3_TITLE),
  });
  writeGrid(workspace, WITHOUT_C3);

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 0, result.stdout);
  assert.match(result.stdout, /Noted, and not a failure/);
  assert.match(result.stdout, /records a Devoir for the Deliverable c3-1/);
});

test("the C3 Devoir stealthed is not read as revealed", async () => {
  // Stealth is the state the 11 September checklist is trying to rule out: the
  // activity says it is visible and is not on the course page, so a report
  // that read `visible` alone would tell the instructor the brief was open on
  // the morning no student could find it.
  const workspace = await published();
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    items: course.items.map((item) =>
      item.name === C3_TITLE ? { ...item, visible: true, stealth: true } : item
    ),
  });

  const result = await workspace.publisher(["audit"]);

  assert.equal(result.code, 0, result.stdout);
  assert.match(
    result.stdout,
    /\(c3-1\) is not on the course page for students/
  );
  assert.match(result.stdout, /stealthed rather than hidden/);
  assert.doesNotMatch(result.stdout, /\(c3-1\) is visible to students/);
});
