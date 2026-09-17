// The seam between everything that decides what to publish and the transport
// that writes it. Two implementations sit behind it: `fake.ts` (an in-memory
// course, used by the tests) and `browser.ts` (Playwright against real Moodle).

/**
 * The sections of the course page, in the order students read them.
 *
 * The order is the publisher's, not the publishable table's: a student looking
 * for how they are graded should not have to scroll past every lab brief to
 * find it. Sections are added in this order when they are missing, and a
 * section the instructor made by hand keeps whatever place it already has —
 * publishing adds sections, it never reshuffles the course.
 *
 * This is a fixed list that gains entries, not an exhaustive one.
 */
export const SECTION_ORDER = [
  "Assessment",
  "Deliverables",
  "Lectures",
  "Labs",
  "Autonomy",
  "Resources",
] as const;

/** A section of the course page the publisher is allowed to write into. */
export type SectionName = (typeof SECTION_ORDER)[number];

/**
 * The one section Devoirs are published to, and the only section no document
 * may name.
 *
 * There is no `section` field on a Deliverable: there is exactly one section a
 * Devoir can go to, and a field would invite a fixture — or a later edit — to
 * name another one. Membership is derived from the Deliverables the grid
 * defines instead, so a document claiming this section is refused rather than
 * let in beside the Devoirs.
 *
 * It is second in {@link SECTION_ORDER}, after `Assessment`, so the grid that
 * states the Freeze and the section that enforces it are adjacent on a course
 * built from scratch. On a course that already has its sections Moodle appends
 * this one, and a human drags it into place once.
 */
export const DELIVERABLE_SECTION = "Deliverables" satisfies SectionName;

/** One activity as it exists in the live course. */
export interface CourseItem {
  /** Moodle's course module id: stable across updates, the manifest's anchor. */
  readonly moduleId: string;
  readonly name: string;
  /**
   * Whatever the course calls the section this activity sits in — an arbitrary
   * string, not a {@link SectionName}. The instructor may rename or add
   * sections at any time, and a section this program does not recognise is
   * reported as what it is, never quietly as one it does.
   */
  readonly section: string;
  readonly visible: boolean;
  /**
   * Moodle's "available but not shown on the course page".
   *
   * A stealthed activity is not hidden: it is missing from the page and its
   * URL still works for anyone who has one. The driver refuses to leave an
   * activity it created in that state, so the course reports the two
   * separately rather than folding stealth into `visible`.
   */
  readonly stealth: boolean;
  /**
   * Whether this activity is a Devoir: an activity that can hold Submissions.
   *
   * Read off the live course rather than looked up in the manifest, because
   * the question it answers is "would deleting this take a Student's work with
   * it", and that is true of a Devoir nothing here published and of one whose
   * manifest entry a wipe has already cleared. What decides it is
   * `readsAsDevoir` in `activities.ts`.
   */
  readonly devoir: boolean;
}

/** One section of the course page, as the course itself numbers and names it. */
export interface CourseSection {
  /**
   * Moodle's section number. Section 0 is the course's own top section: it
   * always exists and cannot be deleted, which is what "reset to zero" means
   * here.
   */
  readonly number: number;
  readonly name: string;
  /** Whether students see the section on the course page at all. */
  readonly visible: boolean;
}

/** What the live course looks like right now. */
export interface CourseSnapshot {
  readonly courseId: string;
  readonly sections: readonly CourseSection[];
  readonly items: readonly CourseItem[];
}

/** The result of asking for a section by name. */
export interface SectionOutcome {
  readonly number: number;
  /** True when this call is what put the section in the course. */
  readonly created: boolean;
}

/**
 * A Published Document to create as a file resource: one PDF in a Section,
 * opened in the browser. Visibility is set only here, never on a replace.
 *
 * What crosses the seam is the HTML, not the PDF. Printing it is the driver's
 * business, so nothing above this seam knows a browser is involved, and the
 * fake course can record exactly what would have been printed.
 */
export interface NewFileResource {
  /** What Students read on the course page. */
  readonly name: string;
  readonly section: SectionName;
  readonly visible: boolean;
  /** The name the PDF is stored under: what a Student's download is called. */
  readonly fileName: string;
  /**
   * One self-contained, print-ready HTML document: its styles and pictures
   * inline, because nothing beside it is uploaded.
   */
  readonly html: string;
}

/**
 * A new file for an existing file resource, swapped in place: same module id,
 * so bookmarks and links to the resource survive, and the old file goes rather
 * than sitting beside the new one.
 *
 * There is deliberately no visibility here, and no name or Section either: a
 * replace changes what the resource holds and nothing about where it is or who
 * can see it. Revealing a document is a human decision, and the guarantee is
 * the interface's — there is no field to write it into.
 */
export interface FileReplacement {
  readonly moduleId: string;
  /** As {@link NewFileResource.fileName}; it may differ from the old file's. */
  readonly fileName: string;
  /** As {@link NewFileResource.html}. */
  readonly html: string;
}

/** What creating a file resource left in the course. */
export interface CreatedFileResource {
  /** Moodle's course module id for the new activity. */
  readonly moduleId: string;
}

/**
 * The instant a Devoir stops accepting work, as this seam carries it.
 *
 * It is the catalog's `Freeze` in everything but name, and it is redeclared
 * here rather than imported because the dependency only runs one way: the
 * catalog names sections this package defines, so this package cannot name a
 * type that package defines. What crosses the seam is therefore the two things
 * a driver needs — the instant, to fill Moodle's form with, and the string a
 * human wrote, so that anything the driver has to say about the date can quote
 * the file back.
 */
export interface DevoirFreeze {
  readonly instant: Date;
  /** Exactly as the front matter authored it, offset and all. */
  readonly written: string;
}

/**
 * What a Student may hand a Devoir in as.
 *
 * A constant, not a setting. Online text is the whole design — a Deliverable
 * is a URL — and file upload is off so that no student uploads a zip of their
 * repository and no artifact ever needs storing or serving. It is written down
 * once, here, so that the driver filling the form and the fake recording what
 * it was filled with cannot come to differ, and so that turning file upload on
 * is an edit to this line rather than something a caller passes in.
 */
export const DEVOIR_SUBMISSION = {
  onlineText: true,
  fileUpload: false,
} as const;

/**
 * A Devoir to create. Visibility is set only here, never on update, as it is
 * for a file resource.
 *
 * There is no `section`: every Devoir goes to {@link DELIVERABLE_SECTION} and
 * membership there is derived from the grid's Deliverables, so a field naming a
 * section would be the second way in that ADR-0005 says this design does not
 * have.
 *
 * There is one `freeze` and not a due date beside a cut-off date, for the same
 * reason: both are set from it, and two fields would be room for a grace
 * window nobody wrote down.
 */
export interface NewDevoir {
  /** The Deliverable's title. What Students read on the course page. */
  readonly name: string;
  /** The generated stub: what to paste, the Freeze, and a link to the brief. */
  readonly html: string;
  readonly visible: boolean;
  /** Due date and cut-off date, both. */
  readonly freeze: DevoirFreeze;
}

/**
 * An existing Devoir to rewrite where it stands: same module id, so every
 * Submission handed into it, every bookmark and every link to it survive the
 * edit. Deleting and recreating would take all three with it, and a Devoir is
 * the one activity in this course that holds work students have nowhere else.
 *
 * There is deliberately no visibility here, exactly as there is none on
 * {@link FileReplacement}. Revealing the C3 Devoir is a click the instructor makes
 * on the morning of the exercise, and a publisher that reasserted visibility
 * on every run would take it back the next time a typo was fixed. The
 * guarantee is the interface's, not a rule anyone has to remember: there is no
 * field here to write it into.
 *
 * There is no section either, for the reason {@link NewDevoir} gives: an
 * update rewrites an activity where it stands, and the publisher never moves
 * one.
 */
export interface DevoirUpdate {
  readonly moduleId: string;
  /** The Deliverable's title, which may be what this edit is. */
  readonly name: string;
  /** The regenerated stub: what to paste, the Freeze, and the brief's link. */
  readonly html: string;
  /**
   * Due date and cut-off date, both, written again from the Freeze the front
   * matter states now. Rewritten on every update rather than only when they
   * changed, because what makes a Devoir right is that both dates are this
   * instant — and a date somebody moved by hand in Moodle is exactly what an
   * update is for.
   */
  readonly freeze: DevoirFreeze;
}

/** What creating a Devoir left in the course. */
export interface CreatedDevoir {
  /** Moodle's course module id for the new activity. */
  readonly moduleId: string;
}

export interface CourseDriver {
  /** Reads the live course. Never mutates. */
  snapshot(): Promise<CourseSnapshot>;
  /**
   * The number of the section called `name`, adding it to the course when it
   * is not there. Every section this program adds is added visible: what is
   * *in* a section carries its own visibility, and a hidden section is a lock
   * one click undoes without saying so.
   *
   * Adding is the additive half of publishing: a course that has never been
   * built yet should not require the instructor to hand-make three sections
   * before the first run works. Two sections sharing the name is an abort, not
   * a choice — picking the first would silently publish into whichever one
   * Moodle happened to order first, and the instructor would find the grid in
   * the wrong place with nothing in the output saying so.
   */
  ensureSection(name: SectionName): Promise<SectionOutcome>;
  /**
   * Hides one activity that is already in the course.
   *
   * It takes no boolean, and that is the interface carrying the guarantee: the
   * publisher sets visibility when it creates something and can only ever
   * conceal afterwards. There is no call here that reveals anything, so no run
   * — and no later edit to the layers above — can undo a hiding by hand.
   */
  hideItem(moduleId: string): Promise<void>;
  /**
   * Creates a file resource in a Section, holding `resource.html` printed to
   * a PDF and set to open in the browser, and reports its course module id.
   *
   * Visibility is written here and nowhere else. A resource created hidden is
   * read back hidden, or the call fails; after this, {@link hideItem} is the
   * only thing that touches its visibility, and it can only conceal.
   */
  createFileResource(resource: NewFileResource): Promise<CreatedFileResource>;
  /**
   * Replaces the file an existing file resource holds with `replacement.html`
   * printed to a PDF: same module id, same name, same Section, same
   * visibility, and the old file removed rather than kept beside the new one.
   *
   * It cannot write visibility, because {@link FileReplacement} has none: no
   * run and no later edit above this seam can reveal a resource the
   * Instructor is holding back, or re-hide one they have revealed.
   */
  replaceFile(replacement: FileReplacement): Promise<void>;
  /**
   * Creates a Devoir in {@link DELIVERABLE_SECTION} and reports the course
   * module id Moodle gave it.
   *
   * The section is not a parameter. There is one section a Devoir can be in,
   * and a driver that could be told another one would be a way round the table
   * that decides what is in it.
   *
   * Online text, no file upload, and the Freeze written into both the due date
   * and the cut-off date: those are {@link DEVOIR_SUBMISSION} and
   * {@link NewDevoir.freeze}, and none of them is a choice a caller makes.
   */
  createDevoir(devoir: NewDevoir): Promise<CreatedDevoir>;
  /**
   * Rewrites an existing Devoir in place: same module id, same section, same
   * visibility, and the dates written again from the Freeze.
   *
   * What it cannot do is what matters. There is no visibility on
   * {@link DevoirUpdate}, so no run and no later edit above this seam can
   * reveal a Devoir the instructor is holding back, or re-hide one they have
   * revealed. What a Student may hand in is not a parameter either: it is
   * {@link DEVOIR_SUBMISSION}, written again here so that a Devoir somebody
   * switched file upload on in comes back to online text only.
   */
  updateDevoir(devoir: DevoirUpdate): Promise<void>;
  /**
   * How many Submissions the Devoir at `moduleId` holds. Used only by `wipe`,
   * and only to refuse.
   *
   * Read through the browser, on the page that already shows them, with the
   * session the driver is holding open — deliberately not through a web
   * service token, which for a single count would add a credential, a renewal
   * problem and a second transport to the one program here that needs none.
   *
   * It throws rather than reporting a number it is unsure of. A count is what
   * stands between thirty students' work and a delete, and the one answer that
   * must never be available is "I could not tell, so I deleted it": there is
   * no `undefined` here to be read as zero further up.
   */
  countSubmissions(moduleId: string): Promise<number>;
  /** Removes one activity. Used only by `wipe`. */
  deleteItem(moduleId: string): Promise<void>;
  /**
   * Removes one section and everything in it. Used only by `wipe`.
   *
   * Deleting renumbers the sections after it, so callers delete from the
   * highest number down.
   */
  deleteSection(number: number): Promise<void>;
  /** Releases whatever the driver holds open. Always safe to call. */
  close(): Promise<void>;
}
