// Test support: a temporary repository of fixture documents, and a way to run
// the command line against it with the fake driver.
//
// Everything the tests know about this program is what these two things
// expose — a command, an environment, and the files left behind.
import { execFile } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import type { PublishedEntry } from "../packages/catalog/index.ts";
import { SKILLS } from "../packages/skills/installed.ts";

export type { PublishedEntry } from "../packages/catalog/index.ts";
export { SKILLS } from "../packages/skills/installed.ts";

const run = promisify(execFile);

/**
 * The command line as a course repository installs it: the package `npm pack`
 * makes, installed by the suite's global setup (`packaged.ts`) and started
 * through its binary, never from this checkout's sources.
 */
function packagedCli(): string {
  const bin = process.env["PUBLISHER_PACKAGED_BIN"];
  if (bin === undefined)
    throw new Error(
      "PUBLISHER_PACKAGED_BIN is not set. Run the suite through `npm test`, " +
        "whose global setup packs and installs the publisher."
    );
  return bin;
}

/** The package name a course repository installs the publisher under. */
export const PUBLISHER_PACKAGE = "@epf-mde/moodle-publisher";

/**
 * Where the suite's global setup installed the packed publisher: what a course
 * repository finds under its own `node_modules`, glossary and ADRs included.
 */
export function installedPublisher(): string {
  // The binary is linked from node_modules/.bin, beside the package it runs.
  return join(dirname(dirname(packagedCli())), PUBLISHER_PACKAGE);
}

/** Where a course repository's `node_modules` holds the publisher. */
export const INSTALLED_PUBLISHER = `node_modules/${PUBLISHER_PACKAGE}`;

/** The publisher installed into the course repository, as `npm install` leaves it. */
export function installPublisher(workspace: Workspace): void {
  const target = join(workspace.root, INSTALLED_PUBLISHER);
  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(installedPublisher(), target, "dir");
}

/** The `CONTEXT-MAP.md` the README shows: the course's context beside the publisher's. */
export const CONTEXT_MAP_MARKDOWN = `# Context map

- [Course](./CONTEXT.md) and its [ADRs](./docs/adr/): this course.
- [Publisher](./${INSTALLED_PUBLISHER}/CONTEXT.md) and its
  [ADRs](./${INSTALLED_PUBLISHER}/docs/adr/): publishing and grading.
`;

/**
 * Where a course repository links one of the publisher's skills. Written out
 * here rather than taken from the skills package, whose layout is private and
 * is what the tests hold it to.
 */
export function skillLink(name: string): string {
  return `.claude/skills/${name}`;
}

/**
 * The publisher's skills linked into the course repository as `install-skills`
 * links them: a relative symlink into the installed publisher.
 */
export function linkSkills(workspace: Workspace): void {
  for (const name of SKILLS) {
    const link = join(workspace.root, skillLink(name));
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(`../../${INSTALLED_PUBLISHER}/skills/${name}`, link, "dir");
  }
}

/**
 * The publisher installed, the course repository's context pointer into it and
 * its skills linked: what `check` requires of every course repository before it
 * passes.
 */
export function pointContextAtPublisher(workspace: Workspace): void {
  installPublisher(workspace);
  workspace.write("CONTEXT-MAP.md", CONTEXT_MAP_MARKDOWN);
  linkSkills(workspace);
}

/** The course every run in this suite is pointed at. */
export const COURSE_ID = "4242";

export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface Workspace {
  readonly root: string;
  readonly manifestPath: string;
  readonly coursePath: string;
  readonly catalogPath: string;
  readonly envPath: string;
  write(relative: string, contents: string): void;
  remove(relative: string): void;
  writeCatalog(catalog: unknown): void;
  writeCourse(course: unknown): void;
  writeEnv(contents: string): void;
  readManifest(): {
    version: number;
    documents: Record<string, Record<string, string>>;
  };
  readCourse(): {
    courseId: string;
    /**
     * A fixture may write a section as a bare name, which reads as visible.
     * The publisher writes them out in full, so a test reading a course back
     * gets either shape and asks for what it needs through {@link sectionsOf}.
     */
    sections: (string | { name: string; visible?: boolean })[];
    items: {
      moduleId: string;
      name: string;
      section: string;
      visible: boolean;
      stealth?: boolean;
      body: string;
      /** The name of the file a file resource holds; absent on any other activity. */
      fileName?: string;
    }[];
    /**
     * The collection settings of the activities that are Devoirs, by module
     * id. Absent from a course that has none, which is most fixtures.
     */
    devoirs?: Record<
      string,
      {
        onlineText: boolean;
        fileUpload: boolean;
        due: string;
        cutOff: string;
      }
    >;
    /**
     * What Students have handed in, by the module id of the Devoir it was
     * handed into. Absent from every course no test has handed anything into,
     * which is most of them: nothing in this program ever writes one.
     */
    submissions?: Record<string, { email: string; url: string }[]>;
  };
  publisher(
    args: readonly string[],
    env?: Record<string, string | undefined>
  ): Promise<CommandResult>;
}

export const GRID_MARKDOWN = `# Assessment Grid

Three competencies, each graded independently on a five band scale with no average.

| Band | What it means |
| ---- | ------------- |
| Basic | The competency is demonstrated mechanically. |
| Solid | The junior engineer I would be OK to hire. |
`;

export const INTERVIEW_MARKDOWN = `# Oral interview script

Ask the student to walk through the commit that introduced the seeded fixture bug.

The trap is the silent currency rounding in the pipeline stage nobody reads twice.
`;

export function makeWorkspace(): Workspace {
  const root = mkdtempSync(join(tmpdir(), "publisher-test-"));
  const manifestPath = join(root, "moodle-manifest.json");
  const coursePath = join(root, ".course.json");
  // What the course publishes, at the root of the repository, where every run
  // reads it.
  const catalogPath = join(root, "publisher.json");
  // The .env at the root every run starts in, empty unless a test writes it:
  // the suite must never read — or be changed by — the .env the developer
  // keeps in their own course repository.
  const envPath = join(root, ".env");

  const workspace: Workspace = {
    root,
    manifestPath,
    coursePath,
    catalogPath,
    envPath,

    write(relative, contents) {
      const path = join(root, relative);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents, "utf8");
    },

    remove(relative) {
      rmSync(join(root, relative), { force: true });
    },

    writeCatalog(catalog) {
      // The grid is the fixture's own unless a test names another: every
      // repository has one, and a catalog is about what it publishes.
      const withGrid = { grid: GRID_SOURCE, ...(catalog as object) };
      writeFileSync(catalogPath, JSON.stringify(withGrid, null, 2), "utf8");
    },

    writeCourse(course) {
      writeFileSync(coursePath, JSON.stringify(course, null, 2), "utf8");
    },

    writeEnv(contents) {
      writeFileSync(envPath, contents, "utf8");
    },

    readManifest() {
      if (!existsSync(manifestPath)) return { version: 1, documents: {} };
      return JSON.parse(readFileSync(manifestPath, "utf8"));
    },

    readCourse() {
      if (!existsSync(coursePath))
        return { courseId: "", sections: [], items: [] };
      return JSON.parse(readFileSync(coursePath, "utf8"));
    },

    async publisher(args, env = {}) {
      const overrides: Record<string, string | undefined> = {
        MOODLE_BASE_URL: "https://moodle.example.test",
        MOODLE_COURSE_ID: COURSE_ID,
        PUBLISHER_DRIVER: "fake",
        PUBLISHER_FAKE_COURSE: coursePath,
        // The run's state follows the directory it is started in, so none of
        // its paths is set — and none a developer's shell exports leaks in.
        PUBLISHER_REPO_ROOT: undefined,
        PUBLISHER_MANIFEST: undefined,
        PUBLISHER_ENV_FILE: undefined,
        MOODLE_RUN_DIR: undefined,
        ...env,
      };
      const environment: NodeJS.ProcessEnv = { ...process.env, ...overrides };
      for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) delete environment[key];
      }
      try {
        // Started from the workspace, as an instructor starts it from the
        // course repository.
        const { stdout, stderr } = await run(process.execPath, [packagedCli(), ...args], {
          cwd: root,
          env: environment,
        });
        return { code: 0, stdout, stderr };
      } catch (error) {
        const failure = error as {
          code?: number;
          stdout?: string;
          stderr?: string;
        };
        return {
          code: failure.code ?? 1,
          stdout: failure.stdout ?? "",
          stderr: failure.stderr ?? "",
        };
      }
    },
  };

  // The document under test, plus the instructor material it must not be
  // confused with. Both exist in every fixture repository, as they do in the
  // real one; only the first is in the catalog until a test says otherwise.
  //
  // The grid defines the Deliverables, as the real one does: it is where every
  // run reads them from, and a grid defining none aborts.
  workspace.writeEnv("");
  writeGrid(workspace);
  workspace.write(ORAL_SCRIPT_SOURCE, INTERVIEW_MARKDOWN);
  workspace.writeCatalog({
    published: [
      {
        source: GRID_SOURCE,
        title: "Assessment Grid — how you are graded",
        section: "Assessment",
      },
    ],
  });

  return workspace;
}

/** Where the fixture repository keeps its assessment grid. */
export const GRID_SOURCE = "assessment-grid.md";

/** The Competencies of this course, as the real grid's front matter declares them. */
export const THREE_COMPETENCIES = `competencies:
  - Framing and decomposing work
  - Extending and constraining an agent
  - Recovering from failure`;

/** The two Deliverables of this course, as the real grid's front matter defines them. */
export const BOTH_DELIVERABLES = `deliverables:
  - id: c1-1
    title: Your repository — C1 and C2
    competencies: [C1, C2]
    due: 2026-09-10T20:00:00+02:00
  - id: c3-1
    title: Your C3 branch — recovering from failure
    competencies: [C3]
    due: 2026-09-11T09:30:00+02:00
    visible: false`;

/** The front matter of the fixture grid: both Deliverables. */
export const GRID_FRONT_MATTER = BOTH_DELIVERABLES;

/** The title the fixture catalog publishes the grid under. */
export const GRID_TITLE = "Assessment Grid — how you are graded";

/**
 * Rewrites the grid with `frontMatter` above `markdown`, leaving the catalog
 * alone.
 *
 * What editing a Deliverable is: the definitions live in the front matter of a
 * document that is already published, so a test that changes a title or a
 * Freeze changes this file and runs the publisher again — which is what the
 * instructor does. A test about the grid's prose keeps the front matter, as an
 * instructor editing the prose does.
 *
 * The course's {@link THREE_COMPETENCIES} are declared above whatever
 * `frontMatter` defines, unless it declares a `competencies:` block of its own:
 * every grid needs one, and most tests are about something else. A test about a
 * grid declaring none writes the file itself.
 */
export function writeGrid(
  workspace: Workspace,
  frontMatter: string = GRID_FRONT_MATTER,
  markdown: string = GRID_MARKDOWN
): void {
  const declared = /^competencies:/m.test(frontMatter)
    ? frontMatter
    : `${THREE_COMPETENCIES}\n${frontMatter}`;
  workspace.write(GRID_SOURCE, `---\n${declared}\n---\n\n${markdown}`);
}

/**
 * A fixture repository whose grid carries `frontMatter`, and a catalog that
 * names it as the grid and publishes it.
 *
 * The catalog's `grid` is what makes it read at all: nothing is discovered by
 * noticing that a document happens to carry front matter.
 */
export function gridDefining(frontMatter: string): Workspace {
  const workspace = makeWorkspace();
  writeGrid(workspace, frontMatter);
  workspace.writeCatalog({
    grid: GRID_SOURCE,
    published: [
      {
        source: GRID_SOURCE,
        title: GRID_TITLE,
        section: "Assessment",
      },
    ],
  });
  return workspace;
}

export const LECTURE_MARKDOWN = `# Lecture 1 — Framing and decomposing

Framing is saying what "done" means before an agent starts.

- A brief an agent can act on names the file, the seam and the check.
`;

export const LAB_MARKDOWN = `# Lab 1 — Frame and decompose your own work

You take one piece of your own backlog and cut it into agent-sized briefs.
`;

/**
 * The day-one set, as the fixture repository holds it. Typed as the real
 * table's entries are, so a fixture cannot name a section the course page does
 * not have and then fail at run time as if the program were at fault.
 */
export const DAY_ONE_ENTRIES: readonly PublishedEntry[] = [
  {
    source: "assessment-grid.md",
    title: "Assessment Grid — how you are graded",
    section: "Assessment",
  },
  {
    source: "lectures/lecture-1.md",
    title: "Lecture 1 — Framing and decomposing",
    section: "Lectures",
  },
  {
    source: "labs/lab-1.md",
    title: "Lab 1 — Frame and decompose your own work",
    section: "Labs",
  },
];

/**
 * Writes the day-one documents and a catalog naming them. One document cannot
 * show a section order or a verb that differs per document, so most of these
 * tests start from three.
 */
export function writeDayOneSet(
  workspace: Workspace,
  entries: readonly PublishedEntry[] = DAY_ONE_ENTRIES
): void {
  workspace.write("lectures/lecture-1.md", LECTURE_MARKDOWN);
  workspace.write("labs/lab-1.md", LAB_MARKDOWN);
  workspace.writeCatalog({ published: entries });
}

/**
 * The banding anchors, as the fixture repository holds them: examiner-only
 * material, a few paragraphs of prose.
 */
export const ANCHORS_MARKDOWN = `# C1 banding anchors

A Solid answer names the seam before it names the file, and says what it would check afterwards.

An Advanced answer says what it would do differently if the brief had been wrong about the seam.
`;

/** Filenames carrying the `--instructor` suffix, which is what says who they are for. */
export const ORAL_SCRIPT_SOURCE = "labs/lab-3-oral--instructor.md";
export const ANCHORS_SOURCE = "c1-assessment-examples--instructor.md";

/**
 * The instructor material of the fixture repository: the oral protocol and one
 * set of banding anchors, each beside the student document it pairs with.
 *
 * Titles are plain, like the real table's. The `Instructor — ` prefix an
 * examiner reads is derived from the `--instructor` suffix at publish time, and
 * a fixture that typed it here would be testing the string rather than the
 * derivation.
 */
export const INSTRUCTOR_ENTRIES: readonly PublishedEntry[] = [
  {
    source: ORAL_SCRIPT_SOURCE,
    title: "Oral interview script",
    section: "Labs",
  },
  {
    source: ANCHORS_SOURCE,
    title: "C1 banding anchors",
    section: "Assessment",
  },
];

/**
 * The day-one set plus the instructor material, in one catalog.
 *
 * Most of what is worth asserting about instructor material is a difference
 * from student-facing material — hidden where the other is visible, re-hidden
 * where the other is left alone — so these tests start from a course that has
 * both, in the same sections.
 */
export function writeInstructorSet(
  workspace: Workspace,
  instructor: readonly PublishedEntry[] = INSTRUCTOR_ENTRIES
): void {
  writeDayOneSet(workspace);
  workspace.write(ANCHORS_SOURCE, ANCHORS_MARKDOWN);
  workspace.writeCatalog({ published: [...DAY_ONE_ENTRIES, ...instructor] });
}

/**
 * A picture as the manifest records it. The hash is optional here for the same
 * reason it is optional in the manifest itself: entries written before pictures
 * were hashed have a URL and nothing else, and a test that could not express
 * that could not check what a run does about it.
 */
export interface RecordedAsset {
  readonly path: string;
  readonly url: string;
  readonly contentHash?: string;
}

/**
 * What the manifest recorded about the pictures published with `source`.
 *
 * Here rather than in each test file: reading it means reaching past the shape
 * {@link Workspace.readManifest} promises, and one cast the whole suite shares
 * is one place to correct if the file ever changes.
 */
export function assetsFor(
  workspace: Workspace,
  source: string
): readonly RecordedAsset[] {
  const entry = workspace.readManifest().documents[source] as
    { assets?: RecordedAsset[] } | undefined;
  return entry?.assets ?? [];
}

/** A course's sections as `[name, visible]`, whichever shape the file uses. */
export function sectionsOf(
  workspace: Workspace
): readonly (readonly [string, boolean])[] {
  return workspace
    .readCourse()
    .sections.map((section) =>
      typeof section === "string"
        ? ([section, true] as const)
        : ([section.name, section.visible ?? true] as const)
    );
}

/**
 * The activity published for a Deliverable's Devoir, and the settings it
 * collects under, found by the title the front matter gave it.
 *
 * Both halves together, because every question worth asking about a Devoir
 * spans them: "hidden, in a visible section, collecting online text and
 * closing at the Freeze" is one sentence about one thing, and the file keeps
 * it in two places only so that everything treating a Devoir as an ordinary
 * activity goes on working.
 */
export function devoirNamed(
  workspace: Workspace,
  title: string
):
  | {
      readonly item: ReturnType<Workspace["readCourse"]>["items"][number];
      readonly settings: NonNullable<
        ReturnType<Workspace["readCourse"]>["devoirs"]
      >[string];
    }
  | undefined {
  const course = workspace.readCourse();
  const item = course.items.find((candidate) => candidate.name === title);
  const settings =
    item === undefined ? undefined : course.devoirs?.[item.moduleId];
  if (item === undefined || settings === undefined) return undefined;
  return { item, settings };
}

/**
 * A Student's Submission on the Devoir called `title`, put there the only way
 * one ever appears: by a Student, in Moodle, with no tool in this repository
 * involved.
 *
 * It is what makes editing a Deliverable checkable at the thing that is
 * actually at stake. A Devoir deleted and made again keeps its title and its
 * dates and loses the work — so a test that only compared what students read
 * would pass on the one outcome this whole feature exists to prevent.
 */
export function handInTo(
  workspace: Workspace,
  title: string,
  submission: { readonly email: string; readonly url: string }
): void {
  const course = workspace.readCourse();
  const item = course.items.find((candidate) => candidate.name === title);
  if (item === undefined) throw new Error(`No activity called "${title}".`);
  workspace.writeCourse({
    ...course,
    submissions: {
      ...course.submissions,
      [item.moduleId]: [
        ...(course.submissions?.[item.moduleId] ?? []),
        submission,
      ],
    },
  });
}

/** What is still handed in on the Devoir called `title`, if it is still there. */
export function submissionsOn(
  workspace: Workspace,
  title: string
): readonly { email: string; url: string }[] {
  const course = workspace.readCourse();
  const item = course.items.find((candidate) => candidate.name === title);
  return item === undefined ? [] : (course.submissions?.[item.moduleId] ?? []);
}

/** One activity of the course, by the title it was published under. */
export function itemNamed(
  workspace: Workspace,
  title: string
): ReturnType<Workspace["readCourse"]>["items"][number] | undefined {
  return workspace.readCourse().items.find((item) => item.name === title);
}
