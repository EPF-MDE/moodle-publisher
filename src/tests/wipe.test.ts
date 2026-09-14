// Emptying a course, and the guard that decides which course gets emptied.
//
// This is the only destructive command in the tool, so what is tested here is
// mostly the refusals: the run that names the wrong course, the run that names
// none, and the run that was not asked to apply. Each of them must leave the
// course exactly as it was.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  devoirNamed,
  gridDefining,
  handInTo,
  makeWorkspace,
  submissionsOn,
  GRID_MARKDOWN,
} from "./harness.ts";

import type { Workspace } from "./harness.ts";

/** A course with two sections of content, as an imported course arrives. */
function seedBuiltCourse(workspace: ReturnType<typeof makeWorkspace>): void {
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 3,
    sections: ["General", "Objectifs pédagogiques", "Assessment"],
    items: [
      {
        moduleId: "1",
        name: "Imported syllabus",
        section: "Objectifs pédagogiques",
        visible: true,
        body: "<p>Last year's material.</p>",
      },
      {
        moduleId: "2",
        name: "Assessment Grid — how you are graded",
        section: "Assessment",
        visible: true,
        body: "<p>Bands.</p>",
      },
    ],
  });
}

test("wipe reports what it would delete and deletes nothing", async () => {
  const workspace = makeWorkspace();
  seedBuiltCourse(workspace);

  const result = await workspace.publisher(["wipe", "--course", "4242"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /delete activity {2}Imported syllabus/);
  assert.match(result.stdout, /delete section {3}2\. Assessment/);
  assert.match(result.stdout, /2 activities and 2 sections/);
  assert.match(result.stdout, /Nothing has been deleted/);
  assert.equal(workspace.readCourse().items.length, 2);
});

test("wipe --apply empties the course down to its top section", async () => {
  const workspace = makeWorkspace();
  seedBuiltCourse(workspace);

  const result = await workspace.publisher([
    "wipe",
    "--course",
    "4242",
    "--apply",
  ]);

  assert.equal(result.code, 0, result.stderr);
  const course = workspace.readCourse();
  assert.deepEqual(course.items, []);
  assert.deepEqual(course.sections, ["General"]);
  assert.match(result.stdout, /is empty/);
});

test("a course id that does not match the configured one wipes nothing", async () => {
  const workspace = makeWorkspace();
  seedBuiltCourse(workspace);

  // The number of a real course the instructor also teaches.
  const result = await workspace.publisher([
    "wipe",
    "--course",
    "5150",
    "--apply",
  ]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /you typed --course 5150/);
  assert.match(result.stderr, /configured course is 4242/);
  assert.match(result.stderr, /Nothing has been touched/);
  assert.equal(workspace.readCourse().items.length, 2);
});

test("wipe refuses when the course id is not typed at all", async () => {
  const workspace = makeWorkspace();
  seedBuiltCourse(workspace);

  const result = await workspace.publisher(["wipe", "--apply"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /needs the course id typed out/);
  assert.equal(workspace.readCourse().items.length, 2);
});

test("an activity carrying the course's own id stops the wipe", async () => {
  const workspace = makeWorkspace();
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 3,
    sections: ["General", "Assessment"],
    items: [
      // What a misread course page produces: the course id where a module id
      // belongs. Deleting by it would address an activity in another course.
      {
        moduleId: "4242",
        name: "",
        section: "General",
        visible: true,
        body: "",
      },
      {
        moduleId: "2",
        name: "Real activity",
        section: "Assessment",
        visible: true,
        body: "<p>x</p>",
      },
    ],
  });

  const result = await workspace.publisher([
    "wipe",
    "--course",
    "4242",
    "--apply",
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /report the course's own id/);
  assert.match(result.stderr, /Nothing has been deleted/);
  assert.equal(workspace.readCourse().items.length, 2);
});

test("an activity with no name stops the wipe rather than going unnamed", async () => {
  const workspace = makeWorkspace();
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 3,
    sections: ["General"],
    items: [
      {
        moduleId: "91",
        name: "",
        section: "General",
        visible: true,
        body: "",
      },
    ],
  });

  const result = await workspace.publisher([
    "wipe",
    "--course",
    "4242",
    "--apply",
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /have no name \(module ids 91\)/);
  assert.equal(workspace.readCourse().items.length, 1);
});

test("typing a course id with nothing configured explains which is which", async () => {
  const workspace = makeWorkspace();
  seedBuiltCourse(workspace);

  const result = await workspace.publisher(["wipe", "--course", "14707"], {
    MOODLE_BASE_URL: undefined,
    MOODLE_COURSE_ID: undefined,
  });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /MOODLE_BASE_URL is not set/);
  // The flag confirms; it does not configure. Being told to set a course id
  // straight after typing one is the moment that needs saying out loud.
  assert.match(result.stderr, /does not configure one/);
  assert.match(result.stderr, /MOODLE_COURSE_ID=14707/);
  assert.equal(workspace.readCourse().items.length, 2);
});

test("wipe clears the manifest, so the next publish rebuilds the course", async () => {
  const workspace = makeWorkspace();
  await workspace.publisher(["publish", "--apply"]);
  assert.ok(workspace.readManifest().documents["assessment-grid.md"]);

  await workspace.publisher(["wipe", "--course", "4242", "--apply"]);
  assert.deepEqual(workspace.readManifest().documents, {});

  // The point of clearing it: publishing again actually publishes, rather
  // than skipping a document the course no longer holds.
  const again = await workspace.publisher(["publish", "--apply"]);

  assert.equal(again.code, 0, again.stderr);
  assert.match(again.stdout, /created/);
  const [item, ...rest] = workspace.readCourse().items;
  assert.deepEqual(rest, []);
  assert.equal(item?.name, "Assessment Grid — how you are graded");
  assert.equal(item?.body.includes("Solid"), true, GRID_MARKDOWN);
});

test("wiping an already empty course says so and does nothing", async () => {
  const workspace = makeWorkspace();
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 1,
    sections: ["General"],
    items: [],
  });

  const result = await workspace.publisher([
    "wipe",
    "--course",
    "4242",
    "--apply",
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /already empty/);
});

// --- the guard over student work -----------------------------------------
//
// After the Freeze a Devoir holds thirty students' work that exists nowhere
// else in a form this course can read, and `wipe` deletes activities. What
// follows is the refusal that stands between the two. It is a refusal and not
// a prompt: there is nothing to type past at 23:00 while debugging something
// else, so these tests are as much about what does *not* work — a flag, an
// environment variable — as about what does.

const C1_TITLE = "Your repository — C1 and C2";
const C3_TITLE = "Your C3 branch — recovering from failure";

/** The course's two Deliverables, as the real grid states them. */
const DELIVERABLES = `deliverables:
  - id: c1-1
    title: ${C1_TITLE}
    competencies: [C1, C2]
    due: 2026-09-10T20:00:00+02:00
  - id: c3-1
    title: ${C3_TITLE}
    competencies: [C3]
    due: 2026-09-11T09:30:00+02:00
    visible: false`;

/**
 * A published course: the grid, and the two Devoirs its front matter defines.
 *
 * Published rather than written as a fixture, because what makes an activity a
 * Devoir is the thing under test here — a fixture asserting it would be a
 * fixture agreeing with itself.
 */
async function publishedCourse(): Promise<Workspace> {
  const workspace = gridDefining(DELIVERABLES);
  const published = await workspace.publisher(["publish", "--apply"]);
  assert.equal(published.code, 0, published.stderr);
  return workspace;
}

test("a Devoir holding a Submission stops the wipe, and nothing at all goes", async () => {
  const workspace = await publishedCourse();
  handInTo(workspace, C1_TITLE, {
    email: "amina@epf.fr",
    url: "https://github.com/amina/agents-c1",
  });
  const before = workspace.readCourse();

  const result = await workspace.publisher([
    "wipe",
    "--course",
    "4242",
    "--apply",
  ]);

  assert.equal(result.code, 1);
  // Not the Devoir, not the other activities, not the sections, not the
  // manifest: the refusal is over the run, not over the one activity.
  const after = workspace.readCourse();
  assert.deepEqual(
    after.items.map((item) => item.moduleId),
    before.items.map((item) => item.moduleId)
  );
  assert.deepEqual(after.sections, before.sections);
  assert.ok(workspace.readManifest().documents["assessment-grid.md"]);
  assert.deepEqual(submissionsOn(workspace, C1_TITLE), [
    { email: "amina@epf.fr", url: "https://github.com/amina/agents-c1" },
  ]);
});

test("the refusal names each Devoir it refused over and what it holds", async () => {
  const workspace = await publishedCourse();
  for (const student of ["amina", "bruno", "chloe"]) {
    handInTo(workspace, C1_TITLE, {
      email: `${student}@epf.fr`,
      url: `https://github.com/${student}/agents-c1`,
    });
  }
  handInTo(workspace, C3_TITLE, {
    email: "amina@epf.fr",
    url: "https://github.com/amina/agents-c3/tree/c3",
  });

  const result = await workspace.publisher([
    "wipe",
    "--course",
    "4242",
    "--apply",
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, new RegExp(`${C1_TITLE}.*3 Submissions`));
  assert.match(result.stderr, new RegExp(`${C3_TITLE}.*1 Submission`));
  assert.match(result.stderr, /Nothing has been deleted/);
});

test("no flag and no environment variable waves the refusal through", async () => {
  const workspace = await publishedCourse();
  handInTo(workspace, C1_TITLE, {
    email: "amina@epf.fr",
    url: "https://github.com/amina/agents-c1",
  });

  for (const argv of [
    ["wipe", "--course", "4242", "--apply", "--force"],
    ["wipe", "--course", "4242", "--apply", "--yes"],
    ["wipe", "--course", "4242", "--apply", "--delete-submissions"],
  ]) {
    const result = await workspace.publisher(argv, {
      PUBLISHER_FORCE: "1",
      WIPE_SUBMISSIONS: "1",
      FORCE: "1",
    });

    assert.notEqual(result.code, 0, argv.join(" "));
    assert.ok(
      workspace.readCourse().items.length > 0,
      `${argv.join(" ")} emptied the course`
    );
  }
});

test("wipe aborts when a Devoir's Submission count cannot be established", async () => {
  const workspace = await publishedCourse();
  const devoir = devoirNamed(workspace, C1_TITLE);
  assert.ok(devoir);
  // A Moodle that answers with something this program cannot read. "I could
  // not tell, so I deleted it" is the one outcome never available here.
  workspace.writeCourse({
    ...workspace.readCourse(),
    failSubmissionCountOn: [devoir.item.moduleId],
  });

  const result = await workspace.publisher([
    "wipe",
    "--course",
    "4242",
    "--apply",
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, new RegExp(C1_TITLE));
  assert.match(result.stderr, /Nothing has been deleted/);
  assert.ok(devoirNamed(workspace, C1_TITLE), "the Devoir was deleted anyway");
});

test("a Devoir nobody has handed anything into is wiped normally", async () => {
  const workspace = await publishedCourse();
  assert.ok(devoirNamed(workspace, C1_TITLE));

  const result = await workspace.publisher([
    "wipe",
    "--course",
    "4242",
    "--apply",
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(workspace.readCourse().items, []);
  assert.deepEqual(workspace.readManifest().documents, {});
});
