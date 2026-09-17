// Implementation of the fake driver: private to the course package.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

import { DELIVERABLE_SECTION, DEVOIR_SUBMISSION } from "../index.ts";

import type {
  CourseDriver,
  CreatedDevoir,
  CreatedFileResource,
  DevoirUpdate,
  FileReplacement,
  NewDevoir,
  NewFileResource,
  CourseItem,
  CourseSection,
  CourseSnapshot,
  SectionName,
  SectionOutcome,
} from "../index.ts";

/**
 * A section as the file stores it. A fixture may write the name on its own,
 * which reads as a visible section: most fixtures are about something else,
 * and making every one of them spell out visibility would bury what they are
 * actually testing.
 */
type StoredSection = string | { name: string; visible?: boolean };

interface StoredCourse {
  courseId: string;
  nextModuleId: number;
  /**
   * Sections by number: index 0 is Moodle's own top section, which always
   * exists. A fixture may leave this out, and then the sections are inferred
   * from where its items sit.
   */
  sections: StoredSection[];
  items: StoredItem[];
  /**
   * The Devoir settings of the activities that are Devoirs, by module id.
   *
   * Beside `items` rather than inside them, because a Devoir is two things at
   * once: an activity on the course page like any other — which is what `wipe`
   * deletes — and a set of collection settings that only a
   * Devoir has. Keeping the settings here means every test and every command
   * that treats a Devoir as an activity goes on working unchanged, and the one
   * test that asks whether file upload is off has somewhere to look.
   */
  devoirs?: Record<string, StoredDevoir>;
  /**
   * What Students have handed in, by the module id of the Devoir they handed
   * it into.
   *
   * Nothing in this program writes one — no tool here hands work in, and only
   * `wipe` counts them — so this exists for one more reason: an activity
   * deleted takes the Submissions on it with it, exactly as Moodle would. That is what makes
   * "the edit kept the module id" a claim a test can check rather than a claim
   * about a number, because a run that deleted the Devoir and made another one
   * beside it comes out of this fake with a student's URL gone.
   */
  submissions?: Record<string, StoredSubmission[]>;
  /**
   * Test knob: the module ids whose Submission count cannot be read.
   *
   * The Moodle that answers the grading page with something this program
   * cannot make a number of — a theme that rewrote the table, a capability the
   * account has lost. It is a knob rather than a shape of the data because
   * what is being simulated is not a course state at all: it is a reading that
   * failed, and the only thing that may follow it is an abort.
   */
  failSubmissionCountOn?: string[];
  /** Test knob: raise on the create after this many have succeeded. */
  failCreateAfter?: number;
  /** The same, for updates: the interrupted run on the re-publishing path. */
  failUpdateAfter?: number;
}

/**
 * An activity as the file stores it. `stealth` is optional for the same reason
 * a section's visibility is: it is the exception, and a fixture that does not
 * mention it means an ordinary activity.
 */
type StoredItem = Omit<CourseItem, "stealth" | "devoir"> & {
  stealth?: boolean;
  /** What a student reads on the activity, kept for the tests to read back. */
  body: string;
  /**
   * The file a file resource holds, which is what makes the activity one.
   * Its `body` is the HTML that would have been printed into that file.
   */
  fileName?: string;
};

/**
 * A Devoir's collection settings, as the file stores them.
 *
 * Every field is written out in full, including the two that are always the
 * same. `fileUpload: false` on disk is the assertion this design is checked by
 * — a Devoir that collected files would be a Devoir students uploaded zips of
 * their repositories to — and a settings record that only mentioned what was
 * switched on could not be asked about what was switched off.
 *
 * The two dates are stored as the front matter wrote the Freeze, not as this
 * program re-formatted it: the whole point of one Freeze is that what a
 * student meets is the string in the file, and a test comparing against a
 * re-rendering would pass whatever the re-rendering did.
 */
interface StoredDevoir {
  readonly onlineText: boolean;
  readonly fileUpload: boolean;
  /**
   * The Freeze, as written.
   *
   * Optional only for reading: every write here puts one in. A fixture leaves
   * it out to be the Devoir whose cut-off somebody switched off in Moodle,
   * which accepts work for ever.
   */
  readonly due?: string;
  /** The same instant. There is no grace window. */
  readonly cutOff?: string;
}

/**
 * One Student's answer to one Deliverable, as the file stores it: exactly what
 * crosses the seam, so that a fixture cannot describe a Submission this program
 * could not be handed by a real course.
 *
 * Whose it is is an email and not a name, because the email is the only
 * identity this Moodle populates.
 */
interface StoredSubmission {
  readonly email: string;
  /** The online text, which is one URL. */
  readonly url: string;
}

/**
 * The sections of a fixture written before sections were modelled: whatever
 * its items say they are in, in the order they first appear, under the top
 * section. Without this a fixture course would read as having no sections at
 * all, and every activity in it would read as misplaced.
 */
function inferSections(items: readonly StoredItem[]): StoredSection[] {
  const names = ["General"];
  for (const item of items) {
    if (item.section !== "" && !names.includes(item.section))
      names.push(item.section);
  }
  return names;
}

/**
 * Whether the activity `moduleId` is a Devoir, as this file can tell.
 *
 * The settings record is the answer — it is what a Devoir has and an ordinary
 * activity does not — and work handed into an activity is taken as the same
 * answer, so that a fixture which puts a Submission somewhere is a fixture
 * whose Submission is protected. The browser reads this off the course page's
 * own classes instead; both sides err the same way, towards "yes".
 */
function isDevoir(course: StoredCourse, moduleId: string): boolean {
  return (
    course.devoirs?.[moduleId] !== undefined ||
    course.submissions?.[moduleId] !== undefined
  );
}

function nameOf(section: StoredSection): string {
  return typeof section === "string" ? section : section.name;
}

function visibilityOf(section: StoredSection): boolean {
  return typeof section === "string" ? true : (section.visible ?? true);
}

function read(path: string, courseId: string): StoredCourse {
  if (!existsSync(path)) {
    return {
      courseId,
      nextModuleId: 1,
      sections: ["General"],
      items: [],
    };
  }
  const stored = JSON.parse(
    readFileSync(path, "utf8")
  ) as Partial<StoredCourse>;
  const items = stored.items ?? [];
  // Whatever the file said, and then the four fields a course cannot be read
  // without. Spreading first is what keeps every other field — the Devoirs,
  // the ids, the test knobs — exactly as the fixture wrote it, including the
  // ones it left out: reading a course must not change the file that holds it,
  // which is what a plan's "writes nothing" relies on. Listing them
  // instead would be a line to remember per field, and the field somebody
  // forgot is one this fake would silently drop.
  return {
    ...stored,
    courseId: stored.courseId ?? courseId,
    nextModuleId: stored.nextModuleId ?? items.length + 1,
    sections: stored.sections ?? inferSections(items),
    items,
  };
}

function write(path: string, course: StoredCourse): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(course, null, 2)}\n`, "utf8");
}

export function openFakeCourse(path: string, courseId: string): CourseDriver {
  const course = read(path, courseId);
  if (course.courseId !== courseId) {
    throw new Error(
      `Fake course ${path} is course ${course.courseId}, but MOODLE_COURSE_ID is ${courseId}.`
    );
  }
  let created = 0;
  let updated = 0;

  function sections(): CourseSection[] {
    return course.sections.map((section, number) => ({
      number,
      name: nameOf(section),
      visible: visibilityOf(section),
    }));
  }

  /**
   * The number of the section called `name`, adding it when it is not there.
   *
   * A function rather than only a driver method because two of the driver's
   * own calls need it: creating a file resource is told which section to use, and
   * creating a Devoir is not — there is one section a Devoir can be in, so the
   * driver looks it up itself.
   */
  function ensureSectionNamed(name: SectionName): SectionOutcome {
    const matches = sections().filter((section) => section.name === name);
    if (matches.length > 1) {
      throw new Error(
        `Aborting: the course has ${matches.length} sections named "${name}" ` +
          `(numbers ${matches.map((match) => match.number).join(", ")}). ` +
          `Rename or remove the duplicates: publishing into one of them at ` +
          `random would put the document somewhere nobody looked.`
      );
    }
    const [existing] = matches;
    if (existing !== undefined) {
      return { number: existing.number, created: false };
    }
    // Visible, like every section this program adds: what is in a section
    // carries its own visibility.
    course.sections.push({ name, visible: true });
    write(path, course);
    return { number: course.sections.length - 1, created: true };
  }

  return {
    async snapshot(): Promise<CourseSnapshot> {
      return {
        courseId: course.courseId,
        sections: sections(),
        items: course.items.map(
          ({ body: _body, fileName: _fileName, ...item }) => ({
          ...item,
          stealth: item.stealth ?? false,
            devoir: isDevoir(course, item.moduleId),
          })
        ),
      };
    },

    async ensureSection(name: SectionName): Promise<SectionOutcome> {
      return ensureSectionNamed(name);
    },

    async hideItem(moduleId: string): Promise<void> {
      const at = course.items.findIndex((item) => item.moduleId === moduleId);
      const existing = course.items[at];
      if (existing === undefined) {
        throw new Error(
          `Fake driver: no activity with module id ${moduleId} to hide.`
        );
      }
      // Hidden, and never stealthed: the fake can only be put into the states
      // the real driver can produce, or a test would prove something about a
      // course that cannot exist.
      course.items[at] = { ...existing, visible: false, stealth: false };
      write(path, course);
    },

    async createFileResource(
      resource: NewFileResource
    ): Promise<CreatedFileResource> {
      if (
        course.failCreateAfter !== undefined &&
        created >= course.failCreateAfter
      ) {
        throw new Error(
          `Fake driver: refusing to create "${resource.name}" (simulated failure).`
        );
      }
      // The section is put in the course if it is not there, as the real
      // driver's find-or-add does.
      ensureSectionNamed(resource.section);
      const moduleId = String(course.nextModuleId);
      course.nextModuleId += 1;
      // The HTML is kept as the activity's body: what a Student would be
      // served is the PDF printed from it, and this is what went to the printer.
      course.items.push({
        moduleId,
        name: resource.name,
        section: resource.section,
        visible: resource.visible,
        fileName: resource.fileName,
        body: resource.html,
      });
      created += 1;
      write(path, course);
      return { moduleId };
    },

    async replaceFile(replacement: FileReplacement): Promise<void> {
      if (
        course.failUpdateAfter !== undefined &&
        updated >= course.failUpdateAfter
      ) {
        throw new Error(
          `Fake driver: refusing to replace the file of ${replacement.moduleId} (simulated failure).`
        );
      }
      const at = course.items.findIndex(
        (item) => item.moduleId === replacement.moduleId
      );
      const existing = course.items[at];
      if (existing?.fileName === undefined) {
        throw new Error(
          `Fake driver: no file resource with module id ${replacement.moduleId} to replace the file of.`
        );
      }
      // The file and the name. Section and visibility are what the activity
      // already has; the old file is gone, not kept beside the new.
      course.items[at] = {
        ...existing,
        name: replacement.name,
        fileName: replacement.fileName,
        body: replacement.html,
      };
      updated += 1;
      write(path, course);
    },

    async createDevoir(devoir: NewDevoir): Promise<CreatedDevoir> {
      // The publishing layer has already put the section in the course, so
      // this is the lookup finding it — and it is a find-or-add for the same
      // reason the real driver's is: a driver that is ever called directly
      // still has to put the Devoir somewhere a student can reach.
      const { number } = ensureSectionNamed(DELIVERABLE_SECTION);
      const section = course.sections[number];
      if (section === undefined) {
        throw new Error(
          `Fake driver: no section numbered ${number} to create "${devoir.name}" in.`
        );
      }
      const moduleId = String(course.nextModuleId);
      course.nextModuleId += 1;
      course.items.push({
        moduleId,
        name: devoir.name,
        section: nameOf(section),
        visible: devoir.visible,
        // The description a student reads on the activity, held where a file
        // resource's HTML is held, so that "the text of this activity" means one thing
        // whichever kind of activity it is.
        body: devoir.html,
      });
      course.devoirs = {
        ...course.devoirs,
        [moduleId]: {
          ...DEVOIR_SUBMISSION,
          // One Freeze, written into both. There is no second date here to be
          // filled in from somewhere else.
          due: devoir.freeze.written,
          cutOff: devoir.freeze.written,
        },
      };
      write(path, course);
      return { moduleId };
    },

    async updateDevoir(devoir: DevoirUpdate): Promise<void> {
      const at = course.items.findIndex(
        (item) => item.moduleId === devoir.moduleId
      );
      const existing = course.items[at];
      const settings = course.devoirs?.[devoir.moduleId];
      if (existing === undefined || settings === undefined) {
        throw new Error(
          `Fake driver: no Devoir with module id ${devoir.moduleId} to update.`
        );
      }
      // Name and description. Section and visibility are what the activity
      // already has, which is what "in place" means — and visibility is not
      // something this call was given, so a revealed Devoir stays revealed.
      course.items[at] = {
        ...existing,
        name: devoir.name,
        body: devoir.html,
      };
      // The collection settings written again in full, dates and all: what a
      // Devoir is does not depend on what it was, so an update leaves the same
      // settings behind as a create would.
      course.devoirs = {
        ...course.devoirs,
        [devoir.moduleId]: {
          ...DEVOIR_SUBMISSION,
          due: devoir.freeze.written,
          cutOff: devoir.freeze.written,
        },
      };
      write(path, course);
    },

    async countSubmissions(moduleId: string): Promise<number> {
      if (course.failSubmissionCountOn?.includes(moduleId) === true) {
        throw new Error(
          `Fake driver: the Submission count for activity ${moduleId} could not be read ` +
            `(simulated failure).`
        );
      }
      return course.submissions?.[moduleId]?.length ?? 0;
    },

    async deleteItem(moduleId: string): Promise<void> {
      const before = course.items.length;
      course.items = course.items.filter((item) => item.moduleId !== moduleId);
      if (course.items.length === before) {
        throw new Error(
          `Fake driver: no activity with module id ${moduleId} to delete.`
        );
      }
      // The work handed into it goes with it. Moodle does this, and a fake
      // that kept the Submissions of a deleted Devoir would let a run that
      // recreated one look exactly like a run that edited it in place.
      if (course.submissions?.[moduleId] !== undefined) {
        const { [moduleId]: _gone, ...kept } = course.submissions;
        course.submissions = kept;
      }
      write(path, course);
    },

    async deleteSection(number: number): Promise<void> {
      if (number === 0) {
        throw new Error(
          "Fake driver: section 0 is the course's own top section and cannot be deleted."
        );
      }
      const section = course.sections[number];
      if (section === undefined) {
        throw new Error(`Fake driver: no section numbered ${number}.`);
      }
      course.sections.splice(number, 1);
      // A section takes its activities with it, which is exactly why wipe
      // reports the count before it does this.
      const name = nameOf(section);
      course.items = course.items.filter((item) => item.section !== name);
      write(path, course);
    },

    async close(): Promise<void> {
      write(path, course);
    },
  };
}
