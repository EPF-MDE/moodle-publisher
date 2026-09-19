// Competencies, declared in the grid beside the Deliverables.
//
// A course is graded on whatever Competencies its grid declares, not on three
// written into the publisher: the Deliverables are checked against the
// `competencies:` block, and `check` counts it.
//
// The grid writes each Competency's title; its id is its place, `C1`, `C2`, …
//
// So most of these tests are a course with two Competencies, and refusals of a
// grid whose Deliverables name one it does not declare.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  competencyBlocks,
  GRID_FACTS,
  GRID_SOURCE,
  gridDefining,
  makeWorkspace,
  pointContextAtPublisher,
} from "./harness.ts";

const TWO_COMPETENCIES = `competencies:
  - Reading a codebase
  - Changing it safely`;

const REPOSITORY = "Your repository";

/** One Deliverable serving the Competencies named. */
function deliverableServing(competencies: string): string {
  return `deliverables:
  - id: k-1
    title: ${REPOSITORY}
    competencies: [${competencies}]
    due: 2026-09-10T20:00:00+02:00`;
}

test("a grid declaring two Competencies publishes a Deliverable serving both, and check counts two", async () => {
  const workspace = gridDefining(
    `${TWO_COMPETENCIES}\n${deliverableServing("C1, C2")}`
  );

  const published = await workspace.publisher(["publish", "--apply"]);
  assert.equal(published.code, 0, published.stderr);
  assert.ok(
    workspace.readCourse().items.some((item) => item.name === REPOSITORY)
  );

  pointContextAtPublisher(workspace);
  const checked = await workspace.publisher(["check"]);
  assert.equal(checked.code, 0, checked.stderr);
  assert.match(checked.stdout, /2 Competencies\./);
});

test("a Deliverable naming a Competency the grid does not declare aborts", async () => {
  const workspace = gridDefining(
    `${TWO_COMPETENCIES}\n${deliverableServing("C1, C3")}`
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /"k-1"/);
  assert.match(result.stderr, /"C3"/);
  assert.match(result.stderr, /C1, C2/);
  assert.deepEqual(workspace.readCourse().items, []);
});

test("a Competency written as anything but its title aborts, naming it", async () => {
  // The shape of a grid that writes an id by hand: the id is this program's, so
  // an entry that is not a title is refused rather than read.
  const workspace = gridDefining(
    `competencies:
  - Reading a codebase
  - id: C2
    title: Changing it safely
${deliverableServing("C1, C2")}`
  );

  const result = await workspace.publisher(["publish", "--apply"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Competency C2 in "assessment-grid\.md" has no title/);
  assert.deepEqual(workspace.readCourse().items, []);
});

test("a grid with no competencies block aborts every command that reads it, naming the block", async () => {
  const workspace = makeWorkspace();
  // Written out by hand rather than through the harness, which declares the
  // fixture course's Competencies for every grid that does not. Declaring none,
  // it has no Competency block either.
  workspace.write(
    GRID_SOURCE,
    `---\n${GRID_FACTS}\n${deliverableServing("C1, C2")}\n---\n\n${competencyBlocks(0)}`
  );

  for (const command of [["publish", "--apply"], ["publish"], ["check"]]) {
    const result = await workspace.publisher(command);

    assert.equal(result.code, 1, `${command.join(" ")} was accepted`);
    assert.match(result.stderr, /"competencies:"/);
    assert.match(result.stderr, /assessment-grid\.md/);
  }
  assert.deepEqual(workspace.readCourse().items, []);
});
