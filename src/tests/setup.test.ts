// Configuring the live course for the Oral: the Bands scale and the three
// Grade Items, made once by tooling rather than by hand during a lab.
//
// Two of these tests are the ones the command exists for. A Grade Item a
// Student can see is a provisional Band defended the night before the Oral,
// and one that counts is Moodle turning three Bands into the /20 the
// assessment grid refuses — so both are failures here, whether the run made
// the Grade Item or found it.
import { test } from "node:test";
import assert from "node:assert/strict";

import { makeWorkspace } from "./harness.ts";
import type { Workspace } from "./harness.ts";

const BANDS = ["Resit", "Needs Work", "Basic", "Solid", "Outstanding"];
const C1 = "C1 — Framing and decomposing work";
const C2 = "C2 — Extending and constraining an agent";
const C3 = "C3 — Recovering from failure";

/** A course whose gradebook already holds the Bands scale, as `setup` left it. */
function seedConfigured(
  workspace: Workspace,
  overrides: {
    items?: {
      id: string;
      name: string;
      scaleId: string;
      hidden: boolean;
      excludedFromTotal: boolean;
    }[];
    scaleValues?: string[];
  } = {}
): void {
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 1,
    sections: ["General"],
    items: [],
    scales: [
      { id: "1", name: "Bands", values: overrides.scaleValues ?? BANDS },
    ],
    nextScaleId: 2,
    gradeItems: overrides.items ?? [],
    nextGradeItemId: (overrides.items?.length ?? 0) + 1,
  });
}

test("setup reports the scale and the three grade items, and creates nothing", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["setup"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(
    result.stdout,
    /create scale {5}Bands \(Resit, Needs Work, Basic, Solid, Outstanding\)/
  );
  assert.match(
    result.stdout,
    /create item {6}C1 — Framing and decomposing work/
  );
  assert.match(result.stdout, /create item {6}C3 — Recovering from failure/);
  assert.match(result.stdout, /Nothing has been configured/);
  assert.deepEqual(workspace.readCourse().scales ?? [], []);
  assert.deepEqual(workspace.readCourse().gradeItems ?? [], []);
});

test("setup --apply creates the Bands scale with the five Bands in order", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["setup", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const scales = workspace.readCourse().scales ?? [];
  assert.equal(scales.length, 1);
  assert.equal(scales[0]?.name, "Bands");
  assert.deepEqual(scales[0]?.values, BANDS);
});

test("setup --apply creates one hidden, weightless grade item per Competency", async () => {
  const workspace = makeWorkspace();

  const result = await workspace.publisher(["setup", "--apply"]);

  assert.equal(result.code, 0, result.stderr);
  const items = workspace.readCourse().gradeItems ?? [];
  assert.deepEqual(
    items.map((item) => item.name),
    [C1, C2, C3]
  );
  for (const item of items) {
    assert.equal(
      item.hidden,
      true,
      `${item.name} must be hidden from Students`
    );
    assert.equal(
      item.excludedFromTotal,
      true,
      `${item.name} must not count towards the course total`
    );
    assert.equal(item.scaleId, "1", `${item.name} must be valued on the Bands`);
  }
});

test("the manifest records the grade items keyed by Competency, beside the pages", async () => {
  const workspace = makeWorkspace();

  await workspace.publisher(["publish", "--apply"]);
  await workspace.publisher(["setup", "--apply"]);

  const documents = workspace.readManifest().documents;
  assert.deepEqual(Object.keys(documents).sort(), [
    "C1",
    "C2",
    "C3",
    "assessment-grid.md",
    "deliverable:c1-1",
    "deliverable:c3-1",
  ]);
  const entry = documents["C1"];
  assert.ok(entry, "expected a manifest entry for C1");
  assert.equal(entry["kind"], "grade-item");
  assert.equal(entry["name"], C1);
  assert.deepEqual(Object.keys(entry).sort(), [
    "createdAt",
    "itemId",
    "kind",
    "name",
    "scaleId",
  ]);
  // The page entry is untouched by a setup run: one file, two kinds.
  assert.equal(documents["assessment-grid.md"]?.["kind"], "page");
});

test("a second run creates no second scale and no fourth grade item, and says so", async () => {
  const workspace = makeWorkspace();
  await workspace.publisher(["setup", "--apply"]);
  const manifest = workspace.readManifest();

  const second = await workspace.publisher(["setup", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /scale in place {3}Bands/);
  assert.match(second.stdout, /item in place {4}C2 —/);
  assert.match(second.stdout, /already configured for the Oral. Nothing to do/);
  const course = workspace.readCourse();
  assert.equal((course.scales ?? []).length, 1);
  assert.equal((course.gradeItems ?? []).length, 3);
  // Nothing to record either: a run that did nothing leaves no diff.
  assert.deepEqual(workspace.readManifest(), manifest);
});

test("a grade item Students can see fails the run and changes nothing", async () => {
  const workspace = makeWorkspace();
  seedConfigured(workspace, {
    items: [
      {
        id: "1",
        name: C1,
        scaleId: "1",
        hidden: false,
        excludedFromTotal: true,
      },
    ],
  });

  const result = await workspace.publisher(["setup", "--apply"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Aborting/);
  assert.match(result.stderr, /Students can see it/);
  assert.match(result.stderr, /Hide the item/);
  // Not one of the two Grade Items it had not yet made, either: the run stops
  // before it writes anything.
  assert.equal((workspace.readCourse().gradeItems ?? []).length, 1);
  assert.deepEqual(workspace.readManifest().documents, {});
});

test("a grade item that counts towards the course total fails the run", async () => {
  const workspace = makeWorkspace();
  seedConfigured(workspace, {
    items: [
      {
        id: "1",
        name: C2,
        scaleId: "1",
        hidden: true,
        excludedFromTotal: false,
      },
    ],
  });

  const result = await workspace.publisher(["setup", "--apply"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /counts towards the course total/);
  assert.match(result.stderr, /weight to 0/);
  assert.equal((workspace.readCourse().gradeItems ?? []).length, 1);
  assert.deepEqual(workspace.readManifest().documents, {});
});

test("a grade item the course saves visible fails the run, though none was asked for", async () => {
  const workspace = makeWorkspace();
  // Nothing here asks for a visible Grade Item — there is no way to. This is
  // the course taking the form and saving the item without the setting, which
  // is why the run reads back what it made rather than believing what it typed.
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 1,
    sections: ["General"],
    items: [],
    moodleIgnoresGradeItemHidden: true,
  });

  const result = await workspace.publisher(["setup", "--apply"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /visible to Students/);
  assert.match(result.stderr, /Hide it and set its weight to 0/);
  // The one it made and read back, and not the two that would have followed.
  assert.equal((workspace.readCourse().gradeItems ?? []).length, 1);
  assert.deepEqual(workspace.readManifest().documents, {});
});

test("a grade item the course saves counting towards the total fails the run", async () => {
  const workspace = makeWorkspace();
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 1,
    sections: ["General"],
    items: [],
    moodleIgnoresGradeItemWeight: true,
  });

  const result = await workspace.publisher(["setup", "--apply"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /counting towards the course total/);
  assert.equal((workspace.readCourse().gradeItems ?? []).length, 1);
  assert.deepEqual(workspace.readManifest().documents, {});
});

test("a grade item renamed by hand is recognised from the manifest, not made twice", async () => {
  const workspace = makeWorkspace();
  await workspace.publisher(["setup", "--apply"]);

  // C1's Grade Item renamed in the gradebook by a human, and C3's deleted, so
  // the run has something left to do and gets as far as looking at the other
  // two. Recognised by the name it was created under, C1's would be invisible
  // here and the run would make a fourth Grade Item beside it.
  const course = workspace.readCourse();
  const renamed = "C1 — Framing, as the gradebook now calls it";
  workspace.writeCourse({
    ...course,
    gradeItems: (course.gradeItems ?? [])
      .filter((item) => item.name !== C3)
      .map((item) => (item.name === C1 ? { ...item, name: renamed } : item)),
  });

  const second = await workspace.publisher(["setup", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  const after = workspace.readCourse().gradeItems ?? [];
  assert.deepEqual(
    after.map((item) => item.name).sort(),
    [renamed, C2, C3].sort()
  );
  // And the record says what the gradebook says, so a reader of the manifest
  // is not looking for a Grade Item under a name nothing answers to.
  assert.equal(workspace.readManifest().documents["C1"]?.["name"], renamed);
});

test("a scale named Bands whose values are not the Bands aborts with instructions", async () => {
  const workspace = makeWorkspace();
  seedConfigured(workspace, {
    scaleValues: ["Resit", "Needs work", "Basic", "Solid", "Outstanding"],
  });

  const result = await workspace.publisher(["setup", "--apply"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /its values are\s+not the Bands/);
  assert.match(result.stderr, /Needs work/);
  assert.match(result.stderr, /run setup again/);
  assert.deepEqual(workspace.readCourse().gradeItems ?? [], []);
});

test("a course that will not take a grade item aborts, having recorded what it made", async () => {
  const workspace = makeWorkspace();
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 1,
    sections: ["General"],
    items: [],
    failCreateGradeItemAfter: 1,
  });

  const result = await workspace.publisher(["setup", "--apply"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /refusing to create the grade item/);
  // The abort carries what to do next, not only what broke: setup is
  // idempotent, so running it again is the remedy, and doing the rest by hand
  // is the way out if it stops there again.
  assert.match(result.stderr, /Run setup again/);
  assert.match(result.stderr, /hidden, weight 0, valued on the Bands/);
  // One Grade Item made and recorded, the rest not: an interrupted run leaves
  // a record of what is really in the course, as publishing does.
  assert.equal((workspace.readCourse().gradeItems ?? []).length, 1);
  assert.deepEqual(Object.keys(workspace.readManifest().documents), ["C1"]);
});

test("the run that stopped halfway finishes on the next run, making nothing twice", async () => {
  const workspace = makeWorkspace();
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 1,
    sections: ["General"],
    items: [],
    failCreateGradeItemAfter: 1,
  });
  await workspace.publisher(["setup", "--apply"]);

  // The knob is what the course refuses under, so it goes: the same course,
  // now willing to take the other two.
  const halfway = workspace.readCourse();
  workspace.writeCourse({ ...halfway, failCreateGradeItemAfter: undefined });
  const second = await workspace.publisher(["setup", "--apply"]);

  assert.equal(second.code, 0, second.stderr);
  const items = workspace.readCourse().gradeItems ?? [];
  assert.deepEqual(
    items.map((item) => item.name),
    [C1, C2, C3]
  );
  assert.equal((workspace.readCourse().scales ?? []).length, 1);
  assert.deepEqual(Object.keys(workspace.readManifest().documents).sort(), [
    "C1",
    "C2",
    "C3",
  ]);
});

test("a grade item that is there before the Bands scale is aborts, not adopted", async () => {
  const workspace = makeWorkspace();
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 1,
    sections: ["General"],
    items: [],
    // Made by hand, on some other scale, before this course had a Bands scale
    // at all: recording it against the scale this run would create would put a
    // mapping in the manifest that the gradebook does not have.
    gradeItems: [
      {
        id: "1",
        name: C1,
        scaleId: "9",
        hidden: true,
        excludedFromTotal: true,
      },
    ],
    nextGradeItemId: 2,
  });

  const result = await workspace.publisher(["setup", "--apply"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /the course has no "Bands" scale/);
  assert.deepEqual(workspace.readCourse().scales ?? [], []);
  assert.deepEqual(workspace.readManifest().documents, {});
});

test("two grade items with one Competency's name abort rather than one being picked", async () => {
  const workspace = makeWorkspace();
  seedConfigured(workspace, {
    items: [
      {
        id: "1",
        name: C3,
        scaleId: "1",
        hidden: true,
        excludedFromTotal: true,
      },
      {
        id: "2",
        name: C3,
        scaleId: "1",
        hidden: true,
        excludedFromTotal: true,
      },
    ],
  });

  const result = await workspace.publisher(["setup", "--apply"]);

  assert.notEqual(result.code, 0);
  assert.match(
    result.stderr,
    /2 grade items named "C3 — Recovering from failure"/
  );
  assert.match(result.stderr, /Delete the duplicates/);
  assert.equal((workspace.readCourse().gradeItems ?? []).length, 2);
  assert.deepEqual(workspace.readManifest().documents, {});
});

test("a course that will not take the scale aborts before any grade item is made", async () => {
  const workspace = makeWorkspace();
  workspace.writeCourse({
    courseId: "4242",
    nextModuleId: 1,
    sections: ["General"],
    items: [],
    failCreateScale: true,
  });

  const result = await workspace.publisher(["setup", "--apply"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /refusing to create the scale/);
  assert.deepEqual(workspace.readCourse().gradeItems ?? [], []);
  assert.deepEqual(workspace.readManifest().documents, {});
});

test("setup leaves the course page alone", async () => {
  const workspace = makeWorkspace();
  await workspace.publisher(["publish", "--apply"]);
  const before = workspace.readCourse();

  await workspace.publisher(["setup", "--apply"]);

  const after = workspace.readCourse();
  assert.deepEqual(after.items, before.items);
  assert.deepEqual(after.sections, before.sections);
});
