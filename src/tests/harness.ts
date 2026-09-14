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
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import type { PublishedEntry } from "../packages/catalog/index.ts";
import type { GradebookRow } from "../packages/course/fake.ts";

export type { PublishedEntry } from "../packages/catalog/index.ts";

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
  /** Where `probes` writes the generated Probe Sheets. */
  readonly probeSheetsPath: string;
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
    }[];
    /** The gradebook, absent until `setup` has configured the course. */
    scales?: { id: string; name: string; values: string[] }[];
    gradeItems?: {
      id: string;
      name: string;
      scaleId?: string;
      hidden: boolean;
      excludedFromTotal: boolean;
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
     * which is all but one of them: nothing in this program ever writes one.
     */
    submissions?: Record<string, { email: string; url: string }[]>;
    /**
     * What the gradebook holds for each Student in each Grade Item, by grade
     * item id: the Band, and the Probe Sheet in the feedback beside it. Absent
     * until something has been imported, which is what `setup` leaves behind.
     */
    gradebookRows?: Record<string, GradebookRow[]>;
    /**
     * Who is enrolled, absent from every fixture that is not about the Oral.
     * Enrolment is mirrored: a test writes this the way Moodle would hold it,
     * and nothing in this program ever changes it.
     */
    enrolments?: { email: string; name: string }[];
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
  const catalogPath = join(root, ".catalog.json");
  // The .env at the root every run starts in, empty unless a test writes it:
  // the suite must never read — or be changed by — the .env the developer
  // keeps in their own course repository.
  const envPath = join(root, ".env");
  const probeSheetsPath = join(root, "probe-sheets.csv");

  const workspace: Workspace = {
    root,
    manifestPath,
    coursePath,
    catalogPath,
    envPath,
    probeSheetsPath,

    write(relative, contents) {
      const path = join(root, relative);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents, "utf8");
    },

    remove(relative) {
      rmSync(join(root, relative), { force: true });
    },

    writeCatalog(catalog) {
      writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), "utf8");
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
        PUBLISHER_CATALOG: catalogPath,
        // The run's state follows the directory it is started in, so none of
        // its paths is set — and none a developer's shell exports leaks in.
        PUBLISHER_REPO_ROOT: undefined,
        PUBLISHER_MANIFEST: undefined,
        PUBLISHER_ENV_FILE: undefined,
        PUBLISHER_PROBE_SHEETS: undefined,
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
  workspace.writeEnv("");
  workspace.write("assessment-grid.md", GRID_MARKDOWN);
  workspace.write(ORAL_SCRIPT_SOURCE, INTERVIEW_MARKDOWN);
  workspace.writeCatalog({
    published: [
      {
        source: "assessment-grid.md",
        title: "Assessment Grid — how you are graded",
        section: "Assessment",
      },
    ],
  });

  return workspace;
}

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

/** The title the fixture catalog publishes the grid under. */
export const GRID_TITLE = "Assessment Grid — how you are graded";

/**
 * Rewrites the grid with `frontMatter`, leaving the catalog alone.
 *
 * What editing a Deliverable is: the definitions live in the front matter of a
 * document that is already published, so a test that changes a title or a
 * Freeze changes this file and runs the publisher again — which is what the
 * instructor does.
 */
export function writeGrid(workspace: Workspace, frontMatter: string): void {
  workspace.write(
    "assessment-grid.md",
    `---\n${frontMatter}\n---\n\n${GRID_MARKDOWN}`
  );
}

/**
 * A fixture repository whose grid carries `frontMatter`, and a catalog that
 * says the grid is where the Deliverables are defined.
 *
 * The catalog entry is what makes them read at all: nothing is discovered by
 * noticing that a document happens to carry front matter.
 */
export function gridDefining(frontMatter: string): Workspace {
  const workspace = makeWorkspace();
  writeGrid(workspace, frontMatter);
  workspace.writeCatalog({
    published: [
      {
        source: "assessment-grid.md",
        title: GRID_TITLE,
        section: "Assessment",
      },
    ],
    deliverableSources: ["assessment-grid.md"],
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
 * material with prose long enough for the audit to fingerprint.
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

/**
 * Enrols Students in the fake course, the only way anyone is ever enrolled
 * here: by the course, with no tool in this repository involved.
 *
 * Adds to whoever is already enrolled rather than replacing them, so that a
 * test can enrol somebody *after* a run — which is what "generated from the
 * live enrolment at generation time" is checked by.
 */
export function enrol(
  workspace: Workspace,
  students: readonly { readonly email: string; readonly name: string }[]
): void {
  const course = workspace.readCourse();
  workspace.writeCourse({
    ...course,
    // A course nothing has been published into yet has no file, and the empty
    // one read back carries no course id. Enrolling into it is a real case —
    // Students are enrolled long before a Devoir exists — so the id the run
    // will be pointed at is written in rather than left blank, which the fake
    // refuses to open.
    courseId: course.courseId === "" ? COURSE_ID : course.courseId,
    enrolments: [...(course.enrolments ?? []), ...students],
  });
}

/**
 * What the gradebook holds for one Student in the Grade Item named `item`, or
 * undefined where there is no row for them.
 *
 * The pair of cells the Instructor works in at the Oral, read back the way the
 * course holds them: a sheet waiting is a row that exists with an empty Band.
 */
export function gradebookRow(
  workspace: Workspace,
  item: string,
  email: string
): GradebookRow | undefined {
  const course = workspace.readCourse();
  const gradeItem = (course.gradeItems ?? []).find(
    (candidate) => candidate.name === item
  );
  if (gradeItem === undefined) return undefined;
  return (course.gradebookRows?.[gradeItem.id] ?? []).find(
    (row) => row.email === email
  );
}

/** The generated Probe Sheets file, byte for byte, or undefined if there is none. */
export function probeSheetsText(workspace: Workspace): string | undefined {
  return existsSync(workspace.probeSheetsPath)
    ? readFileSync(workspace.probeSheetsPath, "utf8")
    : undefined;
}

/**
 * The generated CSV, parsed. A parser here rather than a split on commas
 * because a Probe Sheet is several lines inside one field, and a test that
 * could not read one back could not check what is on it.
 */
export function probeSheets(workspace: Workspace): {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
} {
  const [header = [], ...rows] = parseCsv(probeSheetsText(workspace) ?? "");
  return { header, rows };
}

/** One Student's cell in one column of the generated CSV. */
export function cellFor(
  workspace: Workspace,
  email: string,
  column: string
): string | undefined {
  const { header, rows } = probeSheets(workspace);
  const at = header.indexOf(column);
  const emailAt = header.indexOf("email");
  const row = rows.find((candidate) => candidate[emailAt] === email);
  return at === -1 || row === undefined ? undefined : row[at];
}

/** RFC 4180, which is what `toCsv` writes: quotes, doubled quotes, newlines. */
function parseCsv(text: string): readonly (readonly string[])[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let at = 0;
  while (at < text.length) {
    const character = text[at] as string;
    if (quoted) {
      if (character === '"') {
        if (text[at + 1] === '"') {
          field += '"';
          at += 2;
          continue;
        }
        quoted = false;
        at += 1;
        continue;
      }
      field += character;
      at += 1;
      continue;
    }
    if (character === '"') {
      quoted = true;
      at += 1;
      continue;
    }
    if (character === ",") {
      row.push(field);
      field = "";
      at += 1;
      continue;
    }
    if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      at += 1;
      continue;
    }
    field += character;
    at += 1;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** One activity of the course, by the title it was published under. */
export function itemNamed(
  workspace: Workspace,
  title: string
): ReturnType<Workspace["readCourse"]>["items"][number] | undefined {
  return workspace.readCourse().items.find((item) => item.name === title);
}
