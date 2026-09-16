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
 * How HTML written by this program addresses a picture uploaded with it.
 *
 * Moodle stores an activity's text with `@@PLUGINFILE@@/name` where a file of
 * its own is referenced, and rewrites it to a real URL every time the activity
 * is rendered. That is what makes the reference survive the activity being
 * updated, moved or restored into another course: the stored text names the
 * file, and Moodle works out the URL. Writing the URL we saw once would tie
 * the document to a course context that is free to change under it.
 *
 * It lives here because it is the contract between the two sides of this seam
 * — what the HTML says, and what the driver has to have uploaded for it to
 * mean anything.
 */
export const PLUGINFILE_PREFIX = "@@PLUGINFILE@@/";

/**
 * How `html` addresses the picture stored under `name`.
 *
 * One function, so that the side writing the reference and the sides looking
 * for it cannot spell it differently: the encoding is part of the contract,
 * and a diagram whose name has a space in it is exactly where two hand-written
 * copies of this rule would quietly stop agreeing.
 */
export function pluginfileReference(name: string): string {
  return `${PLUGINFILE_PREFIX}${encodeURIComponent(name)}`;
}

/**
 * One picture to upload with the page that shows it.
 *
 * The picture rides in the activity's own file area rather than anywhere
 * central, because that is the one place whose permissions already match the
 * document's: a student who can open the page can fetch the picture, and one
 * who cannot, cannot.
 */
export interface PageImage {
  /** Repository-relative path. What the manifest records and errors name. */
  readonly path: string;
  /** Where the bytes are read from. */
  readonly absolutePath: string;
  /**
   * The name Moodle stores the file under, and the name the HTML addresses
   * after {@link PLUGINFILE_PREFIX}. Not the file's own name: two pictures in
   * one document may share one, and the second would overwrite the first.
   */
  readonly name: string;
  /**
   * What the file on disk hashes to. Its own hash, per picture, rather than
   * only the document-wide one: the document's hash says whether the page has
   * to be rewritten, and this says whether *these* bytes have to travel again.
   * Lecture 1 shows twenty-eight pictures, and a typo fixed in its prose must
   * not resend five megabytes through a browser session.
   */
  readonly contentHash: string;
}

/** A picture that is in the course, and where the course serves it. */
export interface PublishedAsset {
  /** Repository-relative path, as {@link PageImage.path}. */
  readonly path: string;
  /**
   * What the copy the course holds hashes to, reported by the driver alongside
   * the URL it read back off the published page.
   *
   * This is what a later run compares the file on disk against to decide
   * whether to send it again, so it is recorded only for a picture the driver
   * has just seen the course serve: a hash written for a page that never saved
   * is how a picture would go stale for good.
   */
  readonly contentHash: string;
  /**
   * The URL the course served it at, read back from the published page rather
   * than predicted. Recorded so that a picture nobody can see is something the
   * manifest can be asked about afterwards.
   */
  readonly url: string;
}

/** What creating a page left in the course. */
export interface CreatedPage {
  /** Moodle's course module id for the new activity. */
  readonly moduleId: string;
  readonly assets: readonly PublishedAsset[];
}

/** A page to create. Visibility is set only here, never on update. */
export interface NewPage {
  readonly name: string;
  readonly section: SectionName;
  readonly html: string;
  readonly visible: boolean;
  /**
   * The pictures `html` shows, each addressed as
   * `@@PLUGINFILE@@/{@link PageImage.name}`.
   */
  readonly images: readonly PageImage[];
  /**
   * The ones whose bytes go up with this submission — for a new page, all of
   * them. They are sent before the form is submitted: a page saved before its
   * pictures are there is a page that is briefly broken for whoever is
   * reading it.
   */
  readonly upload: readonly PageImage[];
}

/**
 * An existing page to rewrite where it stands. The module id is the one Moodle
 * already gave the activity, so student bookmarks, links from elsewhere in the
 * course and completion tracking survive the edit.
 *
 * There is deliberately no visibility here. Revealing a document is a human
 * decision, and a publisher that reasserted visibility on every run would undo
 * it silently the next time a typo was fixed.
 */
export interface PageUpdate {
  readonly moduleId: string;
  readonly name: string;
  readonly html: string;
  /** The pictures `html` shows, as on {@link NewPage}: all of them. */
  readonly images: readonly PageImage[];
  /**
   * The ones whose bytes go up again — those the course does not already hold
   * unchanged, which on most updates is none of them.
   *
   * A picture left out of this list is not left out of the activity: opening
   * the form puts the files the activity already holds back into the draft
   * area, so saving without resending keeps them. Which ones those are is
   * decided from the manifest, above this seam, because the same answer is
   * what lets a plan say how many pictures a run would upload before it
   * uploads any — and a driver is never asked to report on work it has not
   * done: {@link PublishedAsset} is read back from the course either way.
   */
  readonly upload: readonly PageImage[];
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
 * for a page.
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
 * {@link PageUpdate}. Revealing the C3 Devoir is a click the instructor makes
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
   * Creates a page activity, uploading the pictures it shows with it, and
   * reports its course module id, where the course serves each picture and
   * what the course now holds for it.
   */
  createPage(page: NewPage): Promise<CreatedPage>;
  /**
   * Rewrites an existing page activity in place: same module id, same section,
   * same visibility. Deleting and recreating would give the document a new
   * module id, and every link and bookmark to it would go dead.
   *
   * Reports where the course serves each picture, as {@link createPage} does,
   * so that a run which republishes a document records what a student would
   * now fetch rather than what the last run saw.
   */
  updatePage(page: PageUpdate): Promise<readonly PublishedAsset[]>;
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
