// The publisher ships the agent skills an Instructor grades with, and a course
// repository links them rather than copying them.
//
// `install-skills` makes `.claude/skills/<name>` a relative symlink into the
// installed publisher, so moving the pinned tag moves the skills with it, as it
// moves the glossary. It runs once, never touches Moodle, and never replaces
// something it did not make. `check` fails while a link is missing or leads
// nowhere, and on a `feedbackLetter` block the letter skill could not use.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";

import {
  GRID_SOURCE,
  GRID_TITLE,
  INSTALLED_PUBLISHER,
  SKILLS,
  installPublisher,
  installedPublisher,
  makeWorkspace,
  pointContextAtPublisher,
  skillLink,
} from "./harness.ts";

import type { CommandResult, Workspace } from "./harness.ts";

/** A publisher command run with nothing about Moodle in the environment. */
function offline(workspace: Workspace, args: readonly string[]): Promise<CommandResult> {
  return workspace.publisher(args, {
    MOODLE_BASE_URL: undefined,
    MOODLE_COURSE_ID: undefined,
    PUBLISHER_DRIVER: undefined,
    PUBLISHER_FAKE_COURSE: undefined,
    CI: "true",
    MOODLE_SESSION_STATE: join(workspace.root, "session.json"),
  });
}

/** A course repository that has installed the publisher and nothing else. */
function installedRepository(): Workspace {
  const workspace = makeWorkspace();
  installPublisher(workspace);
  return workspace;
}

/** The files each shipped skill holds. */
const SKILL_FILES: Record<(typeof SKILLS)[number], readonly string[]> = {
  "feedback-letter": ["SKILL.md", "LETTER.md"],
  "banding-anchors": ["SKILL.md", "EXAMPLE-OUTPUT.md"],
};

/** Every file of one shipped skill, joined. */
function skillText(name: (typeof SKILLS)[number]): string {
  return SKILL_FILES[name]
    .map((file) => readFileSync(join(installedPublisher(), "skills", name, file), "utf8"))
    .join("\n");
}

test("the packed publisher holds both skills, each named as it is linked and invoked only by the user", () => {
  for (const name of SKILLS) {
    for (const file of SKILL_FILES[name]) {
      assert.ok(
        existsSync(join(installedPublisher(), "skills", name, file)),
        `skills/${name}/${file} ships`
      );
    }
    const skill = readFileSync(join(installedPublisher(), "skills", name, "SKILL.md"), "utf8");
    assert.match(skill, new RegExp(`^---\\nname: ${name}\\n`), `${name} is its name`);
    assert.match(skill, /^disable-model-invocation: true$/m, `${name} is user-invoked`);
  }
});

test("neither skill names a Probe, a Grade Item, a specific course or a specific Instructor", () => {
  for (const name of SKILLS) {
    const text = skillText(name);
    for (const banned of [/probe/i, /grade item/i, /coding agents management/i, /cam-2026/i, /xavier/i, /xavxyz/i]) {
      assert.doesNotMatch(text, banned, `${name} mentions ${banned}`);
    }
  }
});

test("the banding-anchors skill uses the glossary's term, and suggests the instructor filename", () => {
  const text = skillText("banding-anchors");

  assert.match(text, /Banding Anchors/);
  assert.doesNotMatch(text, /assessment[- ]examples/i);
  assert.match(text, /<id>-banding-anchors--instructor\.md/);
});

test("the feedback-letter skill writes in English, from publisher.json, and never publishes an unverifiable criterion", () => {
  const text = skillText("feedback-letter");

  assert.match(text, /always in English/i);
  assert.match(text, /feedbackLetter/);
  assert.match(text, /unverifiable/);
  assert.match(text, /\.public/);
  assert.match(text, /gh api gists\/<id>/);
  assert.doesNotMatch(text, /Salut|Prénom|Bon travail|Pourquoi pas/);
});

test("install-skills links each skill into .claude/skills, relatively, with no Moodle configured", async () => {
  const workspace = installedRepository();

  const result = await offline(workspace, ["install-skills"]);

  assert.equal(result.code, 0, result.stderr);
  for (const name of SKILLS) {
    const link = join(workspace.root, skillLink(name));
    assert.ok(lstatSync(link).isSymbolicLink(), `${name} is a symlink`);
    assert.equal(readlinkSync(link), `../../${INSTALLED_PUBLISHER}/skills/${name}`);
    assert.equal(
      realpathSync(link),
      realpathSync(join(installedPublisher(), "skills", name))
    );
    assert.match(result.stdout, new RegExp(`Linked ${skillLink(name)}`));
  }
});

test("install-skills a second time changes nothing and says so", async () => {
  const workspace = installedRepository();
  await offline(workspace, ["install-skills"]);
  const before = SKILLS.map((name) => lstatSync(join(workspace.root, skillLink(name))).mtimeMs);

  const result = await offline(workspace, ["install-skills"]);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    SKILLS.map((name) => lstatSync(join(workspace.root, skillLink(name))).mtimeMs),
    before
  );
  for (const name of SKILLS) {
    assert.match(result.stdout, new RegExp(`${skillLink(name)} is already linked`));
  }
});

test("install-skills refuses to replace a directory it did not make, and links nothing", async () => {
  const workspace = installedRepository();
  workspace.write(`${skillLink("feedback-letter")}/SKILL.md`, "the course's own letter skill\n");

  const result = await offline(workspace, ["install-skills"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /\.claude\/skills\/feedback-letter/);
  assert.equal(
    readFileSync(join(workspace.root, skillLink("feedback-letter"), "SKILL.md"), "utf8"),
    "the course's own letter skill\n"
  );
  assert.ok(!existsSync(join(workspace.root, skillLink("banding-anchors"))));
});

test("install-skills refuses to replace a link to somewhere else", async () => {
  const workspace = installedRepository();
  workspace.write("my-skills/banding-anchors/SKILL.md", "mine\n");
  workspace.write(".claude/skills/.keep", "");
  symlinkSync("../../my-skills/banding-anchors", join(workspace.root, skillLink("banding-anchors")));

  const result = await offline(workspace, ["install-skills"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /\.claude\/skills\/banding-anchors/);
  assert.equal(readlinkSync(join(workspace.root, skillLink("banding-anchors"))), "../../my-skills/banding-anchors");
});

test("install-skills replaces a link of its own that leads nowhere, as a renamed skill leaves", async () => {
  const workspace = installedRepository();
  workspace.write(".claude/skills/.keep", "");
  symlinkSync(
    `../../${INSTALLED_PUBLISHER}/skills/student-feedback`,
    join(workspace.root, skillLink("feedback-letter"))
  );

  const result = await offline(workspace, ["install-skills"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    readlinkSync(join(workspace.root, skillLink("feedback-letter"))),
    `../../${INSTALLED_PUBLISHER}/skills/feedback-letter`
  );
});

test("install-skills replaces a link of its own that leads nowhere, however its target is written", async () => {
  const workspace = installedRepository();
  workspace.write(".claude/skills/.keep", "");
  symlinkSync(
    join(workspace.root, ".", INSTALLED_PUBLISHER, "skills", "student-feedback"),
    join(workspace.root, skillLink("feedback-letter"))
  );

  const result = await offline(workspace, ["install-skills"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    readlinkSync(join(workspace.root, skillLink("feedback-letter"))),
    `../../${INSTALLED_PUBLISHER}/skills/feedback-letter`
  );
});

test("install-skills --dry-run says what it would link and writes nothing", async () => {
  const workspace = installedRepository();

  const result = await offline(workspace, ["install-skills", "--dry-run"]);

  assert.equal(result.code, 0, result.stderr);
  for (const name of SKILLS) assert.match(result.stdout, new RegExp(`Would link ${skillLink(name)}`));
  assert.ok(!existsSync(join(workspace.root, ".claude")));
});

test("install-skills refuses when the publisher is not installed in the course repository", async () => {
  const workspace = makeWorkspace();

  const result = await offline(workspace, ["install-skills"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /npm install/);
  assert.ok(!existsSync(join(workspace.root, ".claude")));
});

test("install-skills takes --dry-run and nothing else", async () => {
  const workspace = installedRepository();

  const result = await offline(workspace, ["install-skills", "feedback-letter"]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /install-skills takes --dry-run and nothing else/);
  assert.ok(!existsSync(join(workspace.root, ".claude")));
});

test("check passes once install-skills has run", async () => {
  const workspace = makeWorkspace();
  installPublisher(workspace);
  pointContextAtPublisherWithoutSkills(workspace);
  assert.equal((await offline(workspace, ["install-skills"])).code, 0);

  const result = await offline(workspace, ["check"]);

  assert.equal(result.code, 0, result.stderr);
});

/** The context map alone, for a repository whose skills are the test's business. */
function pointContextAtPublisherWithoutSkills(workspace: Workspace): void {
  workspace.write(
    "CONTEXT-MAP.md",
    `- [Publisher](./${INSTALLED_PUBLISHER}/CONTEXT.md), [ADRs](./${INSTALLED_PUBLISHER}/docs/adr/)\n`
  );
}

test("check fails on a missing skill link, saying to run install-skills", async () => {
  const workspace = makeWorkspace();
  pointContextAtPublisher(workspace);
  workspace.remove(skillLink("banding-anchors"));

  const result = await offline(workspace, ["check"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /\.claude\/skills\/banding-anchors/);
  assert.match(result.stderr, /moodle-publisher install-skills/);
});

test("check fails on a skill link that leads nowhere, saying to run install-skills", async () => {
  const workspace = makeWorkspace();
  pointContextAtPublisher(workspace);
  workspace.remove(skillLink("feedback-letter"));
  symlinkSync(
    `../../${INSTALLED_PUBLISHER}/skills/student-feedback`,
    join(workspace.root, skillLink("feedback-letter"))
  );

  const result = await offline(workspace, ["check"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /\.claude\/skills\/feedback-letter/);
  assert.match(result.stderr, /moodle-publisher install-skills/);
});

/** A course repository check passes on, but for its `feedbackLetter` block. */
function withFeedbackLetter(block: unknown): Workspace {
  const workspace = makeWorkspace();
  pointContextAtPublisher(workspace);
  workspace.writeCatalog({
    published: [{ source: GRID_SOURCE, title: GRID_TITLE, section: "Assessment" }],
    feedbackLetter: block,
  });
  return workspace;
}

test("check passes on a complete feedbackLetter block", async () => {
  const workspace = withFeedbackLetter({
    course: "Software Craft 2027",
    prefix: "craft-2027",
    signature: "Ada",
  });

  const result = await offline(workspace, ["check"]);

  assert.equal(result.code, 0, result.stderr);
});

for (const [why, block, named] of [
  ["it is not an object", "craft-2027", /feedbackLetter/],
  ["it has no signature", { course: "Software Craft 2027", prefix: "craft-2027" }, /signature/],
  ["its course is blank", { course: " ", prefix: "craft-2027", signature: "Ada" }, /course/],
  ["its prefix is a number", { course: "Software Craft 2027", prefix: 2027, signature: "Ada" }, /prefix/],
  ["its prefix is not kebab-case", { course: "Software Craft 2027", prefix: "Craft 2027", signature: "Ada" }, /kebab-case/],
] as const) {
  test(`check fails on a feedbackLetter block when ${why}`, async () => {
    const workspace = withFeedbackLetter(block);

    const result = await offline(workspace, ["check"]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /feedbackLetter/);
    assert.match(result.stderr, named);
  });
}
