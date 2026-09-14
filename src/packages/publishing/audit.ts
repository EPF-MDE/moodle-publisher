// An entry point: what is actually in front of students, rather than what the
// publisher intended. Runnable on its own, and it never writes to the course.
//
// Six questions, against a live reading of the course:
//
//   - is everything the manifest claims is published still there, where it
//     says it is?
//   - is every instructor page in the course, hidden, and not stealthed?
//   - is the C3 exercise brief still hidden, on a day before the one the
//     instructor reveals it on?
//   - is instructor material anywhere a student can reach?
//   - is every Devoir still there, closing at the Freeze the front matter
//     states, and collecting a URL and nothing else — and is there one in the
//     course that the front matter no longer defines a Deliverable for?
//   - and, said rather than judged: who can see the Devoirs that were
//     published hidden?
//
// The Devoirs are the half a student loses work over. A cut-off somebody
// edited by hand in Moodle, a file upload switched back on, an activity
// deleted — none of them shows on the course page, and all of them are found
// out at a Freeze unless something goes and looks. This is what goes and
// looks, and it still writes nothing: running it in the hour before a deadline
// has to be safe, or it will not be run then.
//
// Hiding is per activity, so the audit reads it per activity — by module id,
// which is what survives a page being renamed or dragged into another section.
// Where a page sits is reported and never judged: the section is not what keeps
// students out of it.
import {
  documentsToPublish,
  isRevealed,
  plainTitle,
  titleFor,
} from "../catalog/index.ts";
import { formatFreeze, formatInstant } from "../catalog/deliverables.ts";
import { DEVOIR_SUBMISSION } from "../course/index.ts";
import { fingerprints, prose } from "../documents/index.ts";
import {
  devoirEntries,
  devoirEntryFor,
  pageFor,
  pages,
} from "../manifest/index.ts";

import type { Catalog, PublishedDocument } from "../catalog/index.ts";
import type { Deliverable } from "../catalog/deliverables.ts";
import type {
  CourseItem,
  CourseSnapshot,
  DevoirSettings,
} from "../course/index.ts";
import type { DevoirEntry, Manifest } from "../manifest/index.ts";

export interface AuditFinding {
  /**
   * `drift` is a live setting that is not what was published: a Freeze
   * somebody moved in Moodle, a cut-off switched off, file upload switched
   * back on. It is a failure like the other two, and it is named apart from
   * them because most of it is the only kind this program could put right —
   * the fix is a `publish --apply`, not an edit in Moodle — and because what
   * it is about is a date or a setting rather than a page. The exception says
   * so in its own message: a Devoir published for a Deliverable the front
   * matter has dropped is drift no run removes.
   *
   * `note` is something the audit could not check, or something it checked and
   * has no business objecting to — a question this program cannot ask of a
   * course is not evidence of a leak, and neither is a document the instructor
   * was always going to open by hand being open on the day. Notes are printed
   * with the rest and never suppressed; they do not fail the run.
   */
  readonly kind: "missing" | "leak" | "drift" | "note";
  readonly message: string;
}

export interface AuditReport {
  readonly findings: readonly AuditFinding[];
  /**
   * How many published *documents* the audit accounted for.
   *
   * Pages only, though the manifest now holds Devoirs beside them. Every
   * entry is checked for being present in the course — a Devoir that vanished
   * is reported like a page that vanished — but what this number is printed
   * under is the sentence "N published document(s) present", and a count that
   * quietly included hand-in boxes would make that sentence untrue. What was
   * checked about the Devoirs is {@link devoirsChecked}.
   */
  readonly checked: number;
  /**
   * How many Deliverables the audit read a live Devoir back for.
   *
   * Counted where they were read rather than where they are defined: a
   * Deliverable whose Devoir is missing, or whose settings could not be read,
   * is a finding of its own and is not counted here. The number under a
   * passing verdict is therefore a count of Devoirs whose dates and collection
   * settings were actually compared, which is what the sentence it is printed
   * in claims.
   */
  readonly devoirsChecked: number;
  /** How many instructor documents the audit read back, one activity each. */
  readonly instructorChecked: number;
  readonly passed: boolean;
}

function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Where an activity is, as a message says it. */
function place(item: CourseItem): string {
  return `activity "${item.name}" (module ${item.moduleId}, in section "${item.section}")`;
}

/** Everything the manifest claims is published must be in the course. */
function missingDocuments(
  catalog: Catalog,
  manifest: Manifest,
  snapshot: CourseSnapshot
): readonly AuditFinding[] {
  const byModuleId = new Map(
    snapshot.items.map((item) => [item.moduleId, item])
  );
  // The pages, and not the whole record: a Grade Item is in the gradebook and
  // not on the course page, so looking for one among the activities would
  // report every Grade Item the Oral needs as missing from the course.
  return pages(manifest).flatMap(([source, entry]): AuditFinding[] => {
    const item = byModuleId.get(entry.moduleId);
    const title = titleFor(catalog, source);
    if (item === undefined) {
      return [
        {
          kind: "missing",
          message: `"${title}" (${source}) is recorded as module ${entry.moduleId} but is not in the course.`,
        },
      ];
    }
    if (item.section !== entry.section) {
      return [
        {
          kind: "missing",
          message: `"${title}" is in section ${item.section}, but the manifest records ${entry.section}.`,
        },
      ];
    }
    return [];
  });
}

/**
 * The documents the `--instructor` suffix makes examiner material, and the
 * rest. Every check below is about one side or the other, and two of them
 * compare the sides, so the split is what the audit actually works in.
 *
 * Asked of {@link documentsToPublish} rather than of the table, so that the
 * audit and the publisher answer "who is this for" the same way — and asked
 * once per run, because each check would otherwise rebuild the whole list.
 */
interface Sides {
  readonly instructor: readonly PublishedDocument[];
  readonly student: readonly PublishedDocument[];
}

function sidesOf(catalog: Catalog): Sides {
  const documents = documentsToPublish(catalog);
  return {
    instructor: documents.filter((document) => document.instructorMaterial),
    student: documents.filter((document) => !document.instructorMaterial),
  };
}

/**
 * Every instructor document is in the course, hidden, and not reachable by a
 * URL that works while the page shows nothing.
 *
 * Located by module id rather than by title or by section, because a retitled
 * or dragged activity is exactly the case this exists to catch: it is still the
 * same activity, and it is still the answer key. Where it sits is said in the
 * message and is not a failure — hiding is a property of the page, and the
 * section it stands in is the student one it pairs with.
 *
 * Hidden and stealthed are not the same check. A stealthed activity is
 * "available but not shown on the course page": it is absent from the page and
 * its URL still works for anyone who has it, which is the failure this whole
 * design is meant to make impossible.
 */
function instructorHiding(
  sides: Sides,
  manifest: Manifest,
  snapshot: CourseSnapshot
): readonly AuditFinding[] {
  const byModuleId = new Map(
    snapshot.items.map((item) => [item.moduleId, item])
  );
  return sides.instructor.flatMap((document): AuditFinding[] => {
    const entry = pageFor(manifest, document.source);
    const item =
      entry === undefined ? undefined : byModuleId.get(entry.moduleId);
    if (item === undefined) {
      // Either never published or already reported gone by
      // `missingDocuments`. Said here in the instructor material's own terms:
      // a co-examiner arriving to a missing script is the failure, and the
      // message should be about that rather than about a manifest row.
      return [
        {
          kind: "missing",
          message:
            `"${document.title}" (${document.source}) is instructor material and is not in ` +
            `the course. An examiner has no way to read it.`,
        },
      ];
    }
    const findings: AuditFinding[] = [];
    if (item.visible) {
      findings.push({
        kind: "leak",
        message: `Instructor material is visible: ${place(item)} is not hidden.`,
      });
    }
    if (item.stealth) {
      findings.push({
        kind: "leak",
        message:
          `Instructor material is stealthed rather than hidden: ${place(item)}. ` +
          `"Available but not shown on the course page" leaves a working URL for anyone ` +
          `who has one; hide it instead.`,
      });
    }
    return findings;
  });
}

/**
 * Every document the table says a human reveals on a known day is present,
 * hidden and not stealthed — until that day, after which the same reading is
 * reported rather than judged.
 *
 * This is the C3 exercise brief, and the exercise is the whole reason for the
 * rule: students must meet the seeded bug for the first time in the autonomy
 * slot, so the brief being open on 4 September is a failure of the course and
 * not just of the tool. On 8 September it is exactly what the instructor went
 * and did, and an audit that kept failing over it would be
 * fighting them for the rest of the term — so the gate turns the same
 * observation from a finding into a sentence.
 *
 * Presence is not gated. A brief that has gone missing is a failure on any
 * day, and stealth before the reveal is a failure of its own kind: "available
 * but not shown on the course page" leaves a URL that works for whoever has
 * it, which is the one state that looks hidden and is not.
 *
 * Presence can be asked of every dated document unconditionally: every entry
 * the table names is published on every run, so a document with a reveal date
 * that the course does not hold is missing rather than merely not due yet.
 *
 * When the day has come is the catalog's to say, not this file's: it owns the
 * field, and a second reading of the date here would be a second place to be
 * wrong about it.
 */
function revealGate(
  sides: Sides,
  manifest: Manifest,
  snapshot: CourseSnapshot,
  now: Date
): readonly AuditFinding[] {
  const byModuleId = new Map(
    snapshot.items.map((item) => [item.moduleId, item])
  );
  return sides.student.flatMap((document): AuditFinding[] => {
    const { revealedOn } = document;
    if (revealedOn === undefined) return [];
    const entry = pageFor(manifest, document.source);
    const item =
      entry === undefined ? undefined : byModuleId.get(entry.moduleId);
    if (item === undefined) {
      return [
        {
          kind: "missing",
          message:
            `"${document.title}" (${document.source}) is not in the course. It ships hidden ` +
            `and is revealed by hand on ${revealedOn}; a document that is not there cannot ` +
            `be revealed when the class is sitting in front of it.`,
        },
      ];
    }

    if (!isRevealed(revealedOn, now)) {
      const findings: AuditFinding[] = [];
      if (item.visible) {
        findings.push({
          kind: "leak",
          message:
            `"${document.title}" is visible to students before ${revealedOn}: ${place(item)}. ` +
            `Hide it in Moodle. The publisher will not do it: visibility here is yours, ` +
            `which is why it can neither reveal this nor take a reveal back.`,
        });
      }
      if (item.stealth) {
        findings.push({
          kind: "leak",
          message:
            `"${document.title}" is stealthed rather than hidden before ${revealedOn}: ` +
            `${place(item)}. "Available but not shown on the course page" leaves a working ` +
            `URL for anyone who guesses it, and this exercise depends on nobody having one.`,
        });
      }
      return findings;
    }

    return [
      {
        kind: "note",
        message: item.visible
          ? `"${document.title}" is visible to students. It was to be revealed by hand on ` +
            `${revealedOn}, which has passed, so this is reported and not a finding.`
          : `"${document.title}" is still hidden, and ${revealedOn} has passed. Reveal it in ` +
            `Moodle when the slot starts — no run of this program will do it for you.`,
      },
    ];
  });
}

/**
 * The prose of every document the catalog publishes to students, in the form
 * the audit compares text in.
 *
 * A phrase that appears here is not evidence of anything: it is a sentence a
 * student is meant to read. The assessment grid quotes the oral questions the
 * banding anchors are worked answers to, so without this the audit reports the
 * anchors as leaking into the very activity that publishes the question on
 * purpose — and three findings a reader has to learn to ignore are worse than
 * none, because the fourth is real.
 *
 * The rule is "anywhere in a publishable document", not "in one this run found
 * in the course". What makes the phrase innocent is that the course means to
 * publish it, which is the catalog's to say; making it depend on what has been
 * published so far would have the same course pass or fail according to how
 * much of it had been run.
 */
function studentFacingProse(repoRoot: string, sides: Sides): readonly string[] {
  return sides.student
    .flatMap((document) => prose(repoRoot, document.source))
    .map(normalise)
    .filter((line) => line.length > 0);
}

/**
 * One document's title and text, as the audit recognises them in a course.
 *
 * The title looked for is the {@link plainTitle}, not the one the publisher
 * writes: what this is hunting is a page nobody published, so it never carries
 * the `Instructor — ` prefix, and looking for the prefixed title would find
 * only the pages already accounted for.
 *
 * `studentProse` is the prose from {@link studentFacingProse}: any
 * fingerprint also found in it is dropped before the body is searched, so a
 * shared sentence proves nothing and the document's other fingerprints still
 * catch it if it really is in there.
 */
function matches(
  repoRoot: string,
  document: PublishedDocument,
  item: CourseItem,
  studentProse: readonly string[]
): "title" | "body" | undefined {
  if (normalise(item.name).includes(normalise(plainTitle(document))))
    return "title";
  const body = normalise(item.body);
  const hit = fingerprints(repoRoot, document.source)
    .map(normalise)
    .filter(
      (phrase) =>
        phrase.length > 0 && !studentProse.some((line) => line.includes(phrase))
    )
    .find((phrase) => body.includes(phrase));
  return hit === undefined ? undefined : "body";
}

/**
 * How a match reads in a finding: what the audit recognised, and by what.
 *
 * The two leak rules differ in what they conclude from a match, not in how
 * they describe one, so they say this the same way.
 */
function describeMatch(how: "title" | "body", source: string): string {
  return how === "title"
    ? `matches "${source}" by title`
    : `contains text from "${source}"`;
}

/**
 * No instructor material anywhere a student can reach.
 *
 * Matched against every activity but the instructor pages themselves, which are
 * skipped because {@link instructorHiding} says something more useful about
 * them than "this is a copy of itself". What is left is a copy somebody made by
 * hand, which no manifest row accounts for and no run would ever re-hide.
 */
function instructorLeaks(
  repoRoot: string,
  sides: Sides,
  manifest: Manifest,
  snapshot: CourseSnapshot
): readonly AuditFinding[] {
  const published = new Set(
    sides.instructor
      .map((document) => pageFor(manifest, document.source)?.moduleId)
      .filter((moduleId): moduleId is string => moduleId !== undefined)
  );
  const studentFacing = snapshot.items.filter(
    (item) => !published.has(item.moduleId)
  );
  const studentProse = studentFacingProse(repoRoot, sides);
  return sides.instructor.flatMap((document): AuditFinding[] =>
    studentFacing.flatMap((item): AuditFinding[] => {
      const how = matches(repoRoot, document, item, studentProse);
      if (how === undefined) return [];
      return [
        {
          kind: "leak",
          message:
            `Instructor material is in a student-facing part of the course: ${place(item)} ` +
            `${describeMatch(how, document.source)}. ` +
            `Nothing this program published accounts for it; delete it in Moodle.`,
        },
      ];
    })
  );
}

/**
 * What the course is collecting for each Deliverable, as the driver read it
 * back, by module id.
 *
 * Read before the audit runs and handed to it, rather than read from inside
 * it: opening a Devoir's settings is a page load per Devoir, and this file
 * decides what is wrong with a course rather than how to go and look at one.
 * A module id absent from the map is a Devoir whose settings could not be
 * read, which is a sentence the audit prints rather than a verdict it reaches.
 */
export type LiveDevoirs = ReadonlyMap<string, DevoirSettings>;

/** How a Devoir is named in a finding: what students read, and its id. */
function named(deliverable: Deliverable): string {
  return `"${deliverable.title}" (${deliverable.id})`;
}

/**
 * One of a Devoir's two dates, against the Freeze the front matter states.
 *
 * Both instants are named, always. A message saying only that a date is wrong
 * leaves the instructor opening two windows to find out how wrong; naming what
 * the course holds and what the repository says is what makes the next action
 * obvious — republish, or correct the front matter, depending on which of the
 * two is the one somebody meant.
 *
 * A date that is switched off entirely is its own sentence, because it is its
 * own failure: a Devoir with no cut-off accepts work for ever, and reading
 * "the cut-off is not 20:00" would understate an activity that has no cut-off
 * at all.
 */
function devoirDate(
  deliverable: Deliverable,
  what: "due" | "cut-off",
  live: Date | undefined,
  consequence: string
): readonly AuditFinding[] {
  if (live === undefined) {
    return [
      {
        kind: "drift",
        message:
          `The Devoir ${named(deliverable)} has no ${what} date in the course: ` +
          `${consequence} The front matter states ${formatFreeze(deliverable.freeze)}. ` +
          `Re-run publish to write it back.`,
      },
    ];
  }
  if (live.getTime() === deliverable.freeze.instant.getTime()) return [];
  return [
    {
      kind: "drift",
      message:
        `The Devoir ${named(deliverable)} has a ${what} date of ` +
        `${formatInstant(live)} in the course, and the front matter states ` +
        `${formatFreeze(deliverable.freeze)}. One of the two was edited by hand; ` +
        `whichever it was, students are working to the course's date.`,
    },
  ];
}

/** What a Devoir collects now, against the one thing it is ever allowed to. */
function devoirSubmission(
  deliverable: Deliverable,
  settings: DevoirSettings
): readonly AuditFinding[] {
  const findings: AuditFinding[] = [];
  if (settings.onlineText !== DEVOIR_SUBMISSION.onlineText) {
    findings.push({
      kind: "drift",
      message:
        `The Devoir ${named(deliverable)} does not collect online text, so there is ` +
        `nowhere to paste a URL. Re-run publish to switch it back on.`,
    });
  }
  if (settings.fileUpload !== DEVOIR_SUBMISSION.fileUpload) {
    findings.push({
      kind: "drift",
      message:
        `The Devoir ${named(deliverable)} accepts file uploads. This course collects a ` +
        `URL and never a file, so somebody switched this on in Moodle. Re-run publish ` +
        `to switch it off.`,
    });
  }
  return findings;
}

/**
 * Who can see a Devoir, said and never judged.
 *
 * Visibility is the instructor's, exactly as it is for a page they reveal by
 * hand: the publisher sets it when it creates the activity and never touches
 * it again, so there is no state here this program can call wrong. What it can
 * do is say what it saw — which is what the 11 September checklist ends by
 * reading, to confirm what was revealed and what was not.
 *
 * Said for a Devoir that was published hidden, because that is the one whose
 * visibility is a step in a procedure; and for one published visible that is
 * not visible now, because a hand-in box nobody can see is worth a sentence
 * whoever hid it will want to read.
 */
function devoirVisibility(
  deliverable: Deliverable,
  item: CourseItem
): readonly AuditFinding[] {
  const where = place(item);
  // Stealth first, and for a Devoir published either way, because it is the
  // one state a reading of `visible` alone mis-states: a stealthed activity
  // says it is visible and is not on the course page. Read as visibility it
  // would tell the instructor the C3 Devoir was open on the morning no student
  // could find it, which is the sentence the 11 September checklist ends by
  // trusting.
  if (item.stealth) {
    return [
      {
        kind: "note",
        message:
          `The Devoir ${named(deliverable)} is not on the course page for students: ` +
          `${where}, which is stealthed rather than hidden. It is reached by a link and ` +
          `by nothing else, so it is neither revealed nor hidden. ` +
          (deliverable.visible
            ? `It was published visible, so somebody has taken it off the page; nobody ` +
              `finds it who was not sent to it.`
            : `It was published hidden and is revealed by hand, and this is not that: ` +
              `revealing it puts it back on the page.`),
      },
    ];
  }
  if (!deliverable.visible) {
    return [
      {
        kind: "note",
        message: item.visible
          ? `The Devoir ${named(deliverable)} is visible to students: ${where}. It was ` +
            `published hidden, so it has been revealed by hand — which is how it is meant ` +
            `to happen.`
          : `The Devoir ${named(deliverable)} is hidden from students: ${where}. It was ` +
            `published hidden and is revealed by hand; no run of this program will ` +
            `reveal it for you.`,
      },
    ];
  }
  if (item.visible) return [];
  return [
    {
      kind: "note",
      message:
        `The Devoir ${named(deliverable)} is not on the course page for students: ` +
        `${where}. It was published visible, so somebody has taken it off the page; ` +
        `nobody can hand in while it is off.`,
    },
  ];
}

/** What the walk over the Devoirs found, and how many of them it read. */
interface DevoirAudit {
  readonly findings: readonly AuditFinding[];
  /**
   * The Devoirs whose settings were actually read, which is what
   * {@link AuditReport.devoirsChecked} is printed as. Counted here, in the one
   * walk that decides what was checked, so that the number and the findings
   * cannot come to disagree.
   */
  readonly checked: number;
}

/**
 * Every Deliverable the course requires, against the Devoir the course
 * actually holds for it — and then the Devoirs the front matter no longer
 * names at all.
 *
 * Driven from the front matter rather than from the manifest, because the
 * front matter is what the course requires and the manifest is only what a run
 * once did: a Deliverable nothing was ever published for is the same failure
 * as one whose Devoir was deleted — students with nowhere to hand in — and a
 * walk over the manifest would report the first as nothing at all.
 *
 * The manifest is then walked for what that direction cannot see: a Devoir
 * published for a Deliverable the front matter has since dropped or renamed.
 * It is not missing from anywhere, which is exactly why it needs saying — the
 * hand-in box is still on the course page collecting Submissions that no
 * Deliverable is graded from, and it shows as nothing on either side read
 * alone.
 */
function auditDevoirs(
  deliverables: readonly Deliverable[],
  manifest: Manifest,
  snapshot: CourseSnapshot,
  live: LiveDevoirs
): DevoirAudit {
  const byModuleId = new Map(
    snapshot.items.map((item) => [item.moduleId, item])
  );
  let checked = 0;
  const findings = deliverables.flatMap((deliverable): AuditFinding[] => {
    const entry = devoirEntryFor(manifest, deliverable.id);
    if (entry === undefined) {
      return [
        {
          kind: "missing",
          message:
            `${named(deliverable)} is a Deliverable this course requires, and no Devoir ` +
            `has been published for it. Students have nowhere to hand in. Run publish.`,
        },
      ];
    }
    if (live.has(entry.moduleId)) checked += 1;
    const item = byModuleId.get(entry.moduleId);
    if (item === undefined) {
      return [
        {
          kind: "missing",
          message:
            `The Devoir ${named(deliverable)} is recorded as module ${entry.moduleId} and ` +
            `is not in the course. Students have nowhere to hand in, and any Submission ` +
            `it held went with it.`,
        },
      ];
    }
    const findings: AuditFinding[] = [];
    if (item.section !== entry.section) {
      findings.push({
        kind: "missing",
        message:
          `The Devoir ${named(deliverable)} is in section ${item.section}, but the ` +
          `manifest records ${entry.section}.`,
      });
    }
    findings.push(...devoirVisibility(deliverable, item));

    const settings = live.get(entry.moduleId);
    if (settings === undefined) {
      findings.push({
        kind: "note",
        message:
          `The Devoir ${named(deliverable)} is in the course, and its dates and what it ` +
          `collects could not be read. Check the Freeze and the submission types by hand ` +
          `in Moodle.`,
      });
      return findings;
    }
    findings.push(
      ...devoirDate(
        deliverable,
        "due",
        settings.due,
        "no Submission is ever marked late."
      ),
      ...devoirDate(
        deliverable,
        "cut-off",
        settings.cutOff,
        "it accepts work for ever, so the Freeze is not enforced at all."
      ),
      ...devoirSubmission(deliverable, settings)
    );
    return findings;
  });
  const defined = new Set(deliverables.map((deliverable) => deliverable.id));
  return {
    findings: [
      ...findings,
      ...devoirEntries(manifest).flatMap(([deliverableId, entry]) =>
        defined.has(deliverableId)
          ? []
          : [orphanedDevoir(deliverableId, entry, byModuleId)]
      ),
    ],
    checked,
  };
}

/**
 * A Devoir the manifest records for a Deliverable the front matter no longer
 * defines.
 *
 * Two different things, told apart by whether the activity is still there. One
 * that is still in the course is a failure: students can hand into it, their
 * Submissions land somewhere nothing in this repository reads, and no run will
 * put it right — publish creates and updates Devoirs and deletes none, so the
 * fix is a hand in Moodle or the Deliverable back in the front matter, and the
 * message says so rather than sending anyone to `publish --apply`.
 *
 * One that is gone from the course too is only a stale line in a file. Nothing
 * student-facing is wrong, so it is said and does not fail the run.
 */
function orphanedDevoir(
  deliverableId: string,
  entry: DevoirEntry,
  byModuleId: ReadonlyMap<string, CourseItem>
): AuditFinding {
  const item = byModuleId.get(entry.moduleId);
  if (item === undefined) {
    return {
      kind: "note",
      message:
        `The manifest records a Devoir for the Deliverable ${deliverableId}, which the ` +
        `front matter no longer defines and the course no longer holds. Nothing is ` +
        `wrong in front of students; the record is all that is left of it.`,
    };
  }
  return {
    kind: "drift",
    message:
      `The front matter no longer defines the Deliverable ${deliverableId}, and the ` +
      `Devoir published for it is still in the course: ${place(item)}. Students can ` +
      `still hand in to it, and nothing in this repository grades what they hand in. ` +
      `Delete it in Moodle, or put the Deliverable back in the front matter; no run of ` +
      `publish will remove it.`,
  };
}

/** Everything one run of the audit reads the course against. */
export interface AuditInput {
  readonly repoRoot: string;
  readonly catalog: Catalog;
  /** The Deliverables the front matter defines, as the publisher reads them. */
  readonly deliverables: readonly Deliverable[];
  readonly manifest: Manifest;
  readonly snapshot: CourseSnapshot;
  /** What each published Devoir is collecting, read back before this runs. */
  readonly devoirs: LiveDevoirs;
  /**
   * The date the reveal gate is measured against. Passed in rather than read
   * from the clock so that both sides of the reveal date can be tested, and so
   * that the one assertion in this program whose verdict changes with the date
   * does not depend on when the suite happens to run.
   */
  readonly now: Date;
}

export function auditCourse(input: AuditInput): AuditReport {
  const { repoRoot, catalog, deliverables, manifest, snapshot, devoirs, now } =
    input;
  const sides = sidesOf(catalog);
  const devoirAudit = auditDevoirs(deliverables, manifest, snapshot, devoirs);
  const findings = [
    ...missingDocuments(catalog, manifest, snapshot),
    ...instructorHiding(sides, manifest, snapshot),
    ...revealGate(sides, manifest, snapshot, now),
    ...instructorLeaks(repoRoot, sides, manifest, snapshot),
    ...devoirAudit.findings,
  ];
  return {
    findings,
    checked: pages(manifest).length,
    devoirsChecked: devoirAudit.checked,
    instructorChecked: sides.instructor.length,
    passed: findings.every((finding) => finding.kind === "note"),
  };
}

export function formatAudit(report: AuditReport): string {
  if (report.passed) {
    const notes = report.findings.filter((finding) => finding.kind === "note");
    return [
      `Audit passed.`,
      `  ${report.checked} published document(s) present in the course.`,
      ...(report.instructorChecked === 0
        ? []
        : [
            `  ${report.instructorChecked} instructor document(s) hidden in the course.`,
          ]),
      ...(report.devoirsChecked === 0
        ? []
        : [
            `  ${report.devoirsChecked} Devoir(s) collecting a URL and closing at the ` +
              `Freeze the front matter states.`,
          ]),
      // Printed under a passing verdict, never folded into it. "Passed" here
      // means nothing was found wrong, not that everything was checked.
      ...(notes.length === 0
        ? []
        : [
            "",
            "Noted, and not a failure:",
            ...notes.map((finding) => `  - ${finding.message}`),
          ]),
    ].join("\n");
  }
  return [
    "Audit failed:",
    ...report.findings.map((finding) => `  - ${finding.message}`),
  ].join("\n");
}
