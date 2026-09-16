// Implementation of the fake driver: private to the course package.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

import {
  DELIVERABLE_SECTION,
  DEVOIR_SUBMISSION,
  PLUGINFILE_PREFIX,
  pluginfileReference,
} from "../index.ts";

import type {
  CourseDriver,
  CreatedDevoir,
  CreatedPage,
  DevoirUpdate,
  NewDevoir,
  PageImage,
  PublishedAsset,
  CourseItem,
  CourseSection,
  CourseSnapshot,
  NewPage,
  PageUpdate,
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
 *
 * `files` is the activity's own file area — stored name to content hash — and
 * it is what makes this fake able to disagree with the caller. A run that
 * decides a picture is already in the course and is wrong finds an activity
 * that does not hold it, exactly as Moodle would leave a page whose reference
 * resolves to nothing.
 */
type StoredItem = Omit<CourseItem, "stealth" | "devoir"> & {
  stealth?: boolean;
  files?: Record<string, string>;
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

/**
 * Where the fake course serves a picture uploaded into activity `moduleId`.
 *
 * Shaped like Moodle's own `pluginfile.php` URL, and derived rather than
 * invented fresh each time: a run that published nothing must leave the
 * manifest byte-for-byte as it found it, which a URL carrying a timestamp or
 * a counter would quietly break.
 */
function servedAt(moduleId: string, image: PageImage): string {
  return `/pluginfile.php/${moduleId}/mod_page/content/1/${encodeURIComponent(image.name)}`;
}

/** What a file in the fake course's file area hashes to. */
function hashOf(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/** What saving a page left behind: its file area, and the body a student reads. */
interface Saved {
  readonly body: string;
  readonly files: Record<string, string>;
  readonly assets: readonly PublishedAsset[];
}

/**
 * Uploads the pictures the caller sent, keeps the ones the activity already
 * held, and returns the body a student would read.
 *
 * The bytes of a sent picture are read here, and a picture that cannot be read
 * fails the call: the whole point of uploading is that the file is really
 * there, and a fake that accepted a path nothing was at would let a test pass
 * over a document whose diagram never left the repository. What each file
 * hashes to is read from those bytes rather than taken from the caller, so
 * that the manifest ends up recording what the course holds and not what the
 * run intended to put there.
 *
 * Keeping the files already in the area is Moodle's behaviour, not a
 * convenience: an activity's files survive its text being rewritten, which is
 * what makes it safe for a run to send only the pictures that changed.
 *
 * Resolving `@@PLUGINFILE@@` is what Moodle does when it renders the activity,
 * so the body stored here is what a student would actually be served — which
 * means a reference to a file the page does not hold shows up as what it is,
 * rather than as a placeholder nobody looks at.
 */
function save(
  moduleId: string,
  held: Record<string, string>,
  page: {
    html: string;
    images: readonly PageImage[];
    upload: readonly PageImage[];
  }
): Saved {
  const shown = new Set(page.images.map((image) => image.name));
  const files = { ...held };
  for (const image of page.upload) {
    if (!shown.has(image.name)) {
      throw new Error(
        `Fake driver: "${image.path}" was sent to activity ${moduleId}, which does not ` +
          `show it. A page holds the pictures it shows and no others.`
      );
    }
    files[image.name] = hashOf(readFileSync(image.absolutePath));
  }

  const assets: PublishedAsset[] = [];
  let body = page.html;
  for (const image of page.images) {
    const contentHash = files[image.name];
    if (contentHash === undefined) {
      throw new Error(
        `Fake driver: activity ${moduleId} shows "${image.path}" but does not hold it — ` +
          `it was not sent with this save and was not there before. A student would see ` +
          `a broken image.`
      );
    }
    const url = servedAt(moduleId, image);
    body = body.replaceAll(pluginfileReference(image.name), url);
    assets.push({ path: image.path, url, contentHash });
  }
  if (body.includes(PLUGINFILE_PREFIX)) {
    throw new Error(
      `Fake driver: the body of "${moduleId}" still names a file of its own that was ` +
        `not uploaded with it, so a student would see a broken image.`
    );
  }
  return { body, files, assets };
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
   * own calls need it: creating a page is told which section to use, and
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
        items: course.items.map(({ files: _files, ...item }) => ({
          ...item,
          stealth: item.stealth ?? false,
          devoir: isDevoir(course, item.moduleId),
        })),
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

    async createPage(page: NewPage): Promise<CreatedPage> {
      if (
        course.failCreateAfter !== undefined &&
        created >= course.failCreateAfter
      ) {
        throw new Error(
          `Fake driver: refusing to create "${page.name}" (simulated failure).`
        );
      }
      const moduleId = String(course.nextModuleId);
      // A new activity holds nothing, so what it ends up with is exactly what
      // this call sends it.
      const { body, files, assets } = save(moduleId, {}, page);
      course.nextModuleId += 1;
      course.items.push({
        moduleId,
        name: page.name,
        section: page.section,
        visible: page.visible,
        body,
        ...(Object.keys(files).length === 0 ? {} : { files }),
      });
      created += 1;
      write(path, course);
      return { moduleId, assets };
    },

    async updatePage(page: PageUpdate): Promise<readonly PublishedAsset[]> {
      if (
        course.failUpdateAfter !== undefined &&
        updated >= course.failUpdateAfter
      ) {
        throw new Error(
          `Fake driver: refusing to update "${page.name}" (simulated failure).`
        );
      }
      const at = course.items.findIndex(
        (item) => item.moduleId === page.moduleId
      );
      const existing = course.items[at];
      if (existing === undefined) {
        throw new Error(
          `Fake driver: no activity with module id ${page.moduleId} to update.`
        );
      }
      const { body, files, assets } = save(
        page.moduleId,
        existing.files ?? {},
        page
      );
      // Name, body and files. Section and visibility are what the activity
      // already has, which is what "in place" means.
      //
      // The file area is replaced by what `save` worked out rather than merged
      // again here: a picture a document no longer shows stays in the area, as
      // it does in Moodle, and one it does show is whatever was last sent.
      course.items[at] = {
        ...existing,
        name: page.name,
        body,
        ...(Object.keys(files).length === 0 ? {} : { files }),
      };
      updated += 1;
      write(path, course);
      return assets;
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
        // The description a student reads on the activity, held where a page's
        // body is held, so that "the text of this activity" means one thing
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
