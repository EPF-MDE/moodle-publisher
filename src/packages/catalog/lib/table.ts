// The table. Code, on purpose: it is reviewed in a diff, and a document being
// published at all is one entry in it.
import type { SectionName } from "../../course/index.ts";

export interface PublishedEntry {
  /** Repository-relative path of the markdown source. */
  readonly source: string;
  /**
   * What a reader sees on the course page — never the filename.
   *
   * Plain, for instructor material as for anything else: the `Instructor — `
   * prefix an examiner reads is derived from the suffix at publish time, so
   * there is no entry that can carry the prefix without the hiding, or the
   * hiding without the prefix.
   */
  readonly title: string;
  readonly section: SectionName;
  /**
   * `YYYY-MM-DD`: the day the instructor reveals this document by hand.
   *
   * Its presence is what makes a student-facing document ship hidden. Absent —
   * which is every other entry — the document is created visible and is nobody's
   * decision but the table's.
   *
   * It is not a schedule. Nothing in this program reveals anything, on this
   * date or any other: the date is what the *audit* measures the course
   * against, so that a document found visible the week before is a failure and
   * the same document found visible on the day is not. Publishing on the
   * morning of the reveal, or an hour after it, does not change what students
   * can see either way — the publisher sets visibility on create and has no
   * way to write it again for a document with this policy.
   */
  readonly revealedOn?: string;
}

/**
 * The `--instructor` suffix, and the only thing that decides who a document is
 * for.
 *
 * A rule over the filename rather than a field, so that renaming a document is
 * the whole of the change: the file sits beside the student document it pairs
 * with, in that document's section, and what keeps it away from students is
 * what its name says it is.
 */
const INSTRUCTOR_SUFFIX = "--instructor.md";

/**
 * Whether `source` is material for examiners and no one else.
 *
 * Asked of the path, never of an entry: there is one place this is decided, so
 * a document cannot be named one thing and published as another. A document
 * listed without its suffix publishes visible, and nothing guards against it —
 * the filename *is* the statement.
 */
export function isInstructorMaterial(source: string): boolean {
  return source.endsWith(INSTRUCTOR_SUFFIX);
}

/** How an examiner reads the title of instructor material on the course page. */
export const INSTRUCTOR_TITLE_PREFIX = "Instructor — ";

/**
 * Everything the publisher is allowed to put in the course. A document not
 * named here is not published — this program's own documentation, the
 * fixture's README, the C3 generator — and a link to one of them is refused
 * rather than published dead.
 *
 * Titles are what a reader reads on the course page, so they say what the
 * document is for rather than repeating the filename.
 *
 * Every entry publishes on every run. An entry added here is live the moment
 * it is added, so a document that must not be seen before its lecture carries
 * a `revealedOn` date and ships hidden; nothing else holds anything back.
 *
 * Being on the page from the first morning is not the same as being assigned
 * before it. Nothing a taught session depends on is read in advance — it is
 * met inside the session that needs it (ADR 0006) — so this table saying a
 * document exists is not the course asking anyone to have read it.
 *
 * The order is the reading order of the course, which is a convenience for
 * whoever reviews this diff and nothing more — the publisher does not read it.
 */
export const PUBLISHED: readonly PublishedEntry[] = [
  {
    source: "assessment-grid.md",
    title: "Assessment Grid — how you are graded",
    section: "Assessment",
  },
  // The banding anchors, beside the grid whose bands they are worked answers
  // to: an examiner reading how a competency is graded finds the anchors for
  // it in the same section, and a student finds neither.
  {
    source: "c1-assessment-examples--instructor.md",
    title: "C1 banding anchors",
    section: "Assessment",
  },
  {
    source: "c2-assessment-examples--instructor.md",
    title: "C2 banding anchors",
    section: "Assessment",
  },
  {
    source: "c3-assessment-examples--instructor.md",
    title: "C3 banding anchors",
    section: "Assessment",
  },
  // The one piece of instructor material with no student counterpart to sit
  // beside, so it sits where its reader already is (ADR 0004). At the
  // repository root for the same reason it is not in `Resources`: `resources/`
  // holds what a Lecture or a Lab points students at, and this points at
  // nobody.
  {
    source: "aihero-crash-course-quiz--instructor.md",
    title: "AI Coding Crash Course — check your understanding",
    section: "Assessment",
  },
  {
    source: "lectures/lecture-1-framing.md",
    title: "Lecture 1 — Framing and decomposing work for a coding agent",
    section: "Lectures",
  },
  // The runbook the lecture above was written from, beside it: the instructor
  // reads the script, the students read the lecture. Titled for the job it
  // does rather than for its subject, because the two documents share a
  // subject and an examiner scanning the section has to tell them apart.
  {
    source: "lectures/lecture-1-framing--instructor.md",
    title: "Lecture 1 — running the session",
    section: "Lectures",
  },
  {
    source: "labs/lab-1.md",
    title: "Lab 1 — Frame and decompose your own work",
    section: "Labs",
  },
  // Visible, unlike the C3 brief it shares a section with: students have to
  // open it on 3 September. The date is in the title because this section will
  // hold two briefs.
  {
    source: "autonomy/autonomy-1-hack-and-learn.md",
    title: "Autonomy 1 — Hack and Learn",
    section: "Autonomy",
  },
  {
    // Shipped with everything else and revealed by hand at the start of the
    // autonomy slot on 8 September. The exercise depends on students meeting
    // the seeded bug for the first time in that slot — not on the slot being
    // the whole of the time they have on it, which it stopped being when the
    // slot moved off oral day (ADR-0009). So what must not happen is either
    // half of it: the brief appearing early, or a publishing job being run in
    // the middle of a lab to make it appear at all.
    //
    // Its own section rather than `Labs`: the autonomy slot is not a lab,
    // and a brief that appears mid-page on the day would otherwise show up
    // among briefs students have already worked through.
    source: "autonomy/autonomy-2-c3-exercise-brief.md",
    title: "Autonomy 2 — C3 Exercise",
    section: "Autonomy",
    revealedOn: "2026-09-08",
  },
  {
    source: "autonomy/autonomy-2-c3-solution--instructor.md",
    title: "C3 worked solution",
    section: "Autonomy",
  },
  // The reading a Lecture or a Lab points students at, after the fact. Every
  // one is reached by a direct link from a taught document, which is the entry
  // price rather than a happy accident: a resource nothing links leaves the
  // course (ADR 0006).
  {
    source: "resources/model-effort-and-cost.md",
    title: "Model, effort, and what a session costs",
    section: "Resources",
  },
  {
    source: "resources/context-status-line.md",
    title: "Showing context in the status line",
    section: "Resources",
  },
  {
    source: "resources/killing-bloat.md",
    title: "Killing bloat",
    section: "Resources",
  },
  {
    source: "resources/resetting-to-a-clean-state.md",
    title: "Resetting to a clean state",
    section: "Resources",
  },

  // What the second half of the course needs.
  {
    source: "lectures/lecture-2-extending-and-recovering.md",
    title: "Lecture 2 — Extending, constraining and recovering",
    section: "Lectures",
  },
  // The runbook for the lecture above, on the same terms as Lecture 1's.
  {
    source: "lectures/lecture-2-extending-and-recovering--instructor.md",
    title: "Lecture 2 — running the session",
    section: "Lectures",
  },
  // The one demo in either lecture that is written down move by move, because
  // it is three minutes of live agent in front of thirty people and the runbook
  // links to it from §0:08. Beside the runbook, in the same section, on the
  // same terms: no student reads either.
  {
    source: "lectures/lecture-2-pointer-demo--instructor.md",
    title: "Lecture 2 — the woolly-pointer demo",
    section: "Lectures",
  },
  {
    source: "labs/lab-2.md",
    title: "Lab 2 — Extend and constrain your agent",
    section: "Labs",
  },
  {
    source: "labs/lab-3-oral.md",
    title: "Lab 3 — Orals",
    section: "Labs",
  },
  // The protocol every examiner runs, beside the brief the students read. No
  // student sees it either way.
  {
    source: "labs/lab-3-oral--instructor.md",
    title: "Lab 3 — Interview script",
    section: "Labs",
  },
  {
    source: "resources/beyond-vibe-coding.md",
    title: "Beyond vibe coding",
    section: "Resources",
  },
  {
    source: "resources/never-run-init.md",
    title: "Never run /init",
    section: "Resources",
  },
  // Last, because it is read last: the three competencies packaged as skills a
  // student takes to a job, pointed at from the oral brief rather than from a
  // lab, which is the one taught document every student still has ahead of
  // them on the day their sitting is called (ADR 0006).
  {
    source: "resources/matt-pocock-skills.md",
    title: "Matt Pocock's skills",
    section: "Resources",
  },
];

/**
 * The documents whose front matter defines Deliverables. One, and it is the
 * assessment grid.
 *
 * A table rather than a rule, like the publishing question itself: nothing is
 * discovered by walking a directory or by noticing that a document happens to
 * carry front matter. The grid is the one document that already states every
 * Freeze in one place, so the definition and the prose that has to agree with
 * it are read in one diff.
 *
 * A document named here and defining nothing is an abort, not an empty list:
 * the entry is a statement that the Deliverables are in that file.
 */
export const DELIVERABLE_SOURCES: readonly string[] = ["assessment-grid.md"];

/**
 * The documents whose front matter defines the Oral's probes.
 *
 * The same document, and separately said: "this file defines what students hand
 * in" and "this file defines what they are asked about it" are two statements,
 * and one list serving both would make deleting a Deliverable definition
 * silently delete the probes with it. Named here rather than discovered by
 * noticing that a document happens to carry a `probes:` block, like every other
 * membership question in this package.
 */
export const PROBE_SOURCES: readonly string[] = ["assessment-grid.md"];
