// Deliverables, defined once in the front matter of the assessment grid.
//
// Everything here is driven through the command line, like the rest of the
// suite: a `publish` run against a fixture repository, and what it printed,
// what it left in the course, and what it exited with. The Deliverables reach
// the program the only way they ever will — a block of front matter at the top
// of a document the catalog names.
//
// Most of these tests are refusals. That is the shape of this feature: a wrong
// Freeze is the most expensive defect this system has, so nothing is defaulted
// and every abort names the Deliverable it is about.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DELIVERABLE_SECTION,
  SECTION_ORDER,
} from "../packages/course/index.ts";
import {
  BOTH_DELIVERABLES as BOTH,
  THREE_COMPETENCIES,
  GRID_MARKDOWN,
  GRID_TITLE,
  gridDefining,
  itemNamed,
  makeWorkspace,
} from "./harness.ts";

test("publish lists both Deliverables, with each Freeze stated in full", async () => {
  const workspace = gridDefining(BOTH);

  const result = await workspace.publisher(["publish"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Deliverables, in section "Deliverables":/);
  assert.match(result.stdout, /c1-1/);
  assert.match(result.stdout, /c3-1/);
  // In full: the day of the week, the date, the time, the zone and the instant
  // itself. A date is only checked against a timetable if it says which day it
  // falls on.
  assert.match(
    result.stdout,
    /Thursday 10 September 2026 at 20:00 Europe\/Paris \(2026-09-10T20:00:00\+02:00\)/
  );
  assert.match(
    result.stdout,
    /Friday 11 September 2026 at 09:30 Europe\/Paris \(2026-09-11T09:30:00\+02:00\)/
  );
  assert.match(result.stdout, /C1, C2/);
});

test("the title in the front matter is what the plan reads, not the id", async () => {
  const workspace = gridDefining(BOTH);

  const result = await workspace.publisher(["publish"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Your repository — C1 and C2/);
  assert.match(result.stdout, /Your C3 branch — recovering from failure/);
});

test("a duplicate id aborts the run, naming both Deliverables", async () => {
  const workspace = gridDefining(`deliverables:
  - id: c1-1
    title: Your repository — C1 and C2
    competencies: [C1, C2]
    due: 2026-09-10T20:00:00+02:00
  - id: c1-1
    title: Your C3 branch — recovering from failure
    competencies: [C3]
    due: 2026-09-11T09:30:00+02:00`);

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Refusing to start/);
  assert.match(result.stderr, /"c1-1"/);
  assert.match(result.stderr, /Your repository — C1 and C2/);
  assert.match(result.stderr, /Your C3 branch — recovering from failure/);
  // And where each of them is written, because two entries copied from one
  // another share a title as readily as they share an id.
  assert.match(result.stderr, /assessment-grid\.md/);
  // Before the course is opened: an --apply run that got as far as the course
  // would have created the grid page.
  assert.deepEqual(workspace.readCourse().items, []);
});

test("a due without an explicit Europe/Paris offset aborts, naming the Deliverable", async () => {
  for (const due of [
    // No offset at all: read against whichever zone the machine is in.
    "2026-09-10T20:00:00",
    // An offset, but not Paris's on that day — this is 22:00 in Paris.
    "2026-09-10T20:00:00Z",
    // Winter time in September: an hour later than the grid says, and it
    // parses perfectly.
    "2026-09-10T20:00:00+01:00",
  ]) {
    const workspace = gridDefining(`deliverables:
  - id: c1-1
    title: Your repository — C1 and C2
    competencies: [C1, C2]
    due: ${due}`);

    const result = await workspace.publisher(["publish", "--apply"]);

    assert.equal(result.code, 1, `${due} was accepted`);
    assert.match(result.stderr, /Refusing to start/);
    assert.match(result.stderr, /"c1-1"/);
    assert.match(result.stderr, /Europe\/Paris|\+02:00/);
    assert.deepEqual(workspace.readCourse().items, []);
  }
});

test("a due that does not parse aborts, naming the Deliverable and using no default", async () => {
  const workspace = gridDefining(`deliverables:
  - id: c1-1
    title: Your repository — C1 and C2
    competencies: [C1, C2]
    due: 10 September, 8pm`);

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /"c1-1"/);
  assert.match(result.stderr, /10 September, 8pm/);
  assert.match(result.stderr, /Nothing is defaulted/);
  assert.deepEqual(workspace.readCourse().items, []);
});

test("a missing due aborts, naming the Deliverable", async () => {
  const workspace = gridDefining(`deliverables:
  - id: c1-1
    title: Your repository — C1 and C2
    competencies: [C1, C2]`);

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /"c1-1"/);
  assert.match(result.stderr, /no "due"/);
  assert.deepEqual(workspace.readCourse().items, []);
});

test("a competency the course does not have aborts, naming both it and the Deliverable", async () => {
  const workspace = gridDefining(`deliverables:
  - id: c1-1
    title: Your repository — C1 and C2
    competencies: [C1, C4]
    due: 2026-09-10T20:00:00+02:00`);

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /"c1-1"/);
  assert.match(result.stderr, /"C4"/);
  assert.match(result.stderr, /C1, C2, C3/);
  assert.deepEqual(workspace.readCourse().items, []);
});

test("a visible that is neither true nor false aborts rather than reading as visible", async () => {
  // The typo this catches is the expensive one: c3-1 is the Deliverable that
  // ships hidden, and anything that is not exactly `false` reading as "visible"
  // would put it on the course page a week before the autonomy slot.
  const workspace = gridDefining(`deliverables:
  - id: c3-1
    title: Your C3 branch — recovering from failure
    competencies: [C3]
    due: 2026-09-11T09:30:00+02:00
    visible: fasle`);

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /"c3-1"/);
  assert.match(result.stderr, /fasle/);
  assert.deepEqual(workspace.readCourse().items, []);
});

test("a grid defining no Deliverables aborts, naming the grid", async () => {
  // The catalog points at a document whose front matter declares the
  // Competencies and nothing else — the wrong file, or the right one after its
  // block was deleted. Either way the grid is named as where the Deliverables
  // are, and they are not there.
  const workspace = makeWorkspace();
  workspace.write(
    "labs/lab-1.md",
    `---\n${THREE_COMPETENCIES}\n---\n\n${GRID_MARKDOWN}`
  );
  workspace.writeCatalog({
    grid: "labs/lab-1.md",
    published: [
      {
        source: "assessment-grid.md",
        title: GRID_TITLE,
        section: "Assessment",
      },
    ],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /labs\/lab-1\.md/);
  assert.match(result.stderr, /defines none/);
  assert.deepEqual(workspace.readCourse().items, []);
});

test("the front matter is read by the publisher and never published to students", async () => {
  const workspace = gridDefining(BOTH);

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const grid = itemNamed(workspace, GRID_TITLE);
  assert.ok(grid !== undefined, "the grid is not in the course");
  assert.ok(
    !grid.body.includes("deliverables:"),
    "the front matter was published as part of the page"
  );
  assert.ok(!grid.body.includes("c1-1"), "the ids were published to students");
  // The document still publishes as itself: the body starts where the prose
  // starts.
  assert.match(grid.body, /Assessment Grid/);
});

test("the Deliverables section is second, after the grid that states the Freeze", () => {
  // Adjacent on a course built from scratch: the page that says what the
  // Freeze is, then the section that enforces it. On the live course Moodle
  // appends the section and a human drags it here, once.
  assert.equal(SECTION_ORDER[1], DELIVERABLE_SECTION);
});

test("a document published to the Deliverables section aborts, naming it", async () => {
  // Not an unknown section: `Deliverables` is a real section of the course
  // page, so every check that asks whether a section exists passes it. What
  // this refuses is the second way in — membership there is decided by the
  // grid's Deliverables, and nothing else may put anything beside the Devoirs.
  const workspace = gridDefining(BOTH);
  workspace.writeCatalog({
    published: [
      {
        source: "assessment-grid.md",
        title: GRID_TITLE,
        section: "Assessment",
      },
      {
        source: "labs/lab-1.md",
        title: "Lab 1",
        section: DELIVERABLE_SECTION,
      },
    ],
  });

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Refusing to start/);
  assert.match(result.stderr, /labs\/lab-1\.md/);
  assert.match(result.stderr, /Deliverables/);
  // Before the course is opened, like every other membership refusal.
  assert.deepEqual(workspace.readCourse().items, []);
});

test("the plan states the section once, not once per Deliverable", async () => {
  // Every Devoir goes to the same section and no entry decides it, so a column
  // would be the same constant printed twice. What is read against the
  // timetable on this page is the Freeze.
  const workspace = gridDefining(BOTH);

  const result = await workspace.publisher(["publish"]);

  assert.equal(result.code, 0, result.stderr);
  const block = result.stdout.slice(
    result.stdout.indexOf(`Deliverables, in section "${DELIVERABLE_SECTION}":`)
  );
  assert.ok(block.includes("c1-1") && block.includes("c3-1"), block);
  assert.doesNotMatch(block, /section: /);
});
