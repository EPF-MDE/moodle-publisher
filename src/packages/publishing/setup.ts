// An entry point: configuring the live course for the Oral, once.
//
// Configuring is not publishing. Publishing runs many times — every time a
// document changes — and is shaped around deciding what has moved. This runs
// once per course and then never does anything again, which is why it is a
// command of its own rather than something attempted at the start of every
// routine run.
//
// What it puts in the course is the assessment: the five-value Bands scale,
// spelled as `CONTEXT.md` spells it so that a CSV import can later be matched
// against it character for character, and one Grade Item per Competency, so
// that nobody is making Grade Items by hand during a lab.
//
// Every Grade Item is hidden and weightless, and this file will not proceed
// against a course where one is not:
//
//   - a visible one is a Student reading a provisional Band the night before
//     the Oral they were meant to defend it at;
//   - one that counts is Moodle aggregating three Bands into the /20 the
//     assessment grid refuses, with `Resit` averaged in as though it were a
//     low mark rather than an absence.
//
// Neither can be undone by noticing afterwards, so both are checked before
// anything is written and again on what the course reports back.
import {
  BANDS,
  BAND_SCALE_NAME,
  COMPETENCIES,
  gradeItemName,
} from "../course/gradebook.ts";
import {
  gradeItemFor,
  readManifest,
  recordGradeItem,
} from "../manifest/index.ts";

import type {
  Band,
  Competency,
  CourseGradeItem,
  CourseScale,
  Gradebook,
  GradebookDriver,
} from "../course/gradebook.ts";
import type { GradeItemEntry, Manifest } from "../manifest/index.ts";

/**
 * The course cannot be configured, and no run will fix it.
 *
 * Carried as an error rather than as a plan that reports a problem, because
 * there is nothing to report next to it: a Bands scale that is spelled
 * differently makes every Grade Item built on it wrong, so the run stops with what
 * a human has to do instead. The message is the instructions — this is the
 * failure that would otherwise be found out as a silently mismapped import
 * weeks later.
 */
export class CourseNotConfigurable extends Error {
  constructor(message: string) {
    super(`Aborting: ${message}`);
    this.name = "CourseNotConfigurable";
  }
}

/** What the run would do about the Bands scale. */
export type ScaleStep =
  | {
      readonly verb: "create";
      readonly name: string;
      readonly values: readonly Band[];
    }
  | { readonly verb: "in-place"; readonly scale: CourseScale };

/** What the run would do about one Competency's Grade Item. */
export type ItemStep =
  | {
      readonly verb: "create";
      readonly competency: Competency;
      readonly name: string;
    }
  | {
      readonly verb: "in-place";
      readonly competency: Competency;
      readonly item: CourseGradeItem;
    };

export interface SetupPlan {
  readonly courseId: string;
  readonly scale: ScaleStep;
  readonly items: readonly ItemStep[];
}

/**
 * The Grade Items the run would have to make.
 *
 * Asked here rather than counted at each place that wants it: whether the
 * course is configured and what the report's last line says are the same
 * question, and two spellings of it are two things to keep in step.
 */
function toCreate(plan: SetupPlan): readonly ItemStep[] {
  return plan.items.filter((item) => item.verb === "create");
}

/** True when the course already holds everything the Oral needs. */
export function isConfigured(plan: SetupPlan): boolean {
  return plan.scale.verb === "in-place" && toCreate(plan).length === 0;
}

function sameValues(
  found: readonly string[],
  wanted: readonly string[]
): boolean {
  return (
    found.length === wanted.length &&
    found.every((value, at) => value === wanted[at])
  );
}

/**
 * The Bands scale as the course holds it, or nothing if it has to be made.
 *
 * A scale under the name whose values are not the Bands is an abort and not a
 * second scale: two scales called the same thing is a gradebook where nobody
 * can tell which Grade Item is valued on which, and importing against the
 * wrong one maps every Band to its neighbour.
 */
function existingScale(gradebook: Gradebook): CourseScale | undefined {
  const named = gradebook.scales.filter(
    (scale) => scale.name === BAND_SCALE_NAME
  );
  if (named.length > 1) {
    throw new CourseNotConfigurable(
      `the course has ${named.length} scales named "${BAND_SCALE_NAME}", so a grade item ` +
        `cannot be valued on "the" Bands. Delete the duplicates in the gradebook ` +
        `(Grades → Scales) and run setup again. Nothing has been changed.`
    );
  }
  const [scale] = named;
  if (scale === undefined) return undefined;
  if (!sameValues(scale.values, BANDS)) {
    throw new CourseNotConfigurable(
      `the course already has a scale named "${BAND_SCALE_NAME}", and its values are ` +
        `not the Bands:\n` +
        `  in the course: ${scale.values.join(", ")}\n` +
        `  the Bands:     ${BANDS.join(", ")}\n` +
        `A Band is matched by its exact text when marks are imported, so a scale that ` +
        `differs by a character maps every verdict to the wrong one. Correct the scale ` +
        `in the gradebook (Grades → Scales) or delete it, then run setup again. ` +
        `Nothing has been changed.`
    );
  }
  return scale;
}

/**
 * One Competency's Grade Item as the course holds it, or nothing if it has to
 * be made.
 *
 * One that is there but visible, or there but counting towards the total, is
 * an abort. Quietly fixing it would be the more helpful thing to do and the
 * wrong one: whoever made it that way did so by hand, and a tool that silently
 * reconfigured a Grade Item is a tool nobody can be sure has not also silently
 * reconfigured something holding Bands.
 */
function soleNamed(
  gradebook: Gradebook,
  competency: Competency,
  name: string
): CourseGradeItem | undefined {
  const named = gradebook.items.filter((item) => item.name === name);
  if (named.length > 1) {
    throw new CourseNotConfigurable(
      `the course has ${named.length} grade items named "${name}" (items ` +
        `${named.map((item) => item.id).join(", ")}), so the Bands entered for ` +
        `${competency} would go into whichever one Moodle happened to order first. ` +
        `Delete the duplicates in the gradebook (Grades → Setup) and run setup again. ` +
        `Nothing has been changed.`
    );
  }
  return named[0];
}

function existingItem(
  gradebook: Gradebook,
  competency: Competency,
  scale: CourseScale | undefined,
  recorded: GradeItemEntry | undefined
): CourseGradeItem | undefined {
  const name = gradeItemName(competency);
  // The id the manifest recorded is asked first, and the name only when that
  // finds nothing. A Grade Item this program made and somebody has since
  // renamed in the gradebook is still that Competency's Grade Item, and
  // looked for by name alone it is invisible: the run would make a second one
  // beside it, which is the fourth Grade Item this command exists not to make.
  // Recording the id is what buys that, so it is what is asked.
  const byId =
    recorded === undefined
      ? undefined
      : gradebook.items.find((item) => item.id === recorded.itemId);
  const found = byId ?? soleNamed(gradebook, competency, name);
  if (found === undefined) return undefined;
  // What the gradebook calls it, which is what a human reading the abort has
  // in front of them — not the name this program would have given it.
  const label = found.name;

  // The scale first, because it is the check the other two are worth nothing
  // without: a Grade Item hidden and weightless but valued on something else
  // takes marks that are not Bands.
  //
  // A Grade Item that is already there while the Bands scale is not is the
  // same failure a run ahead of itself: this run would make the scale, record
  // that scale's id against a Grade Item not valued on it, and leave the
  // manifest claiming a mapping the gradebook does not have.
  if (scale === undefined) {
    throw new CourseNotConfigurable(
      `the grade item "${label}" is in the course's gradebook, but the course has no ` +
        `"${BAND_SCALE_NAME}" scale, so what is entered in it cannot be a Band. Delete ` +
        `the item and run setup again — it will be made against the scale this run ` +
        `creates. Nothing has been changed.`
    );
  }
  if (found.scaleId !== scale.id) {
    throw new CourseNotConfigurable(
      `the grade item "${label}" is not valued on the "${BAND_SCALE_NAME}" scale ` +
        `(scale ${scale.id}), so what is entered in it is not a Band. Point it at the ` +
        `Bands scale in the gradebook, or delete the item and run setup again. ` +
        `Nothing has been changed.`
    );
  }
  if (!found.hidden) {
    throw new CourseNotConfigurable(
      `the grade item "${label}" is in the course's gradebook and Students can see it. ` +
        `A Band read before the Oral is a verdict defended in advance. Hide the item ` +
        `in the gradebook (Grades → Setup → Edit → Hidden), leaving "Hidden until" ` +
        `unset — a date is a Band that becomes readable on it — and run setup again. ` +
        `Nothing has been changed.`
    );
  }
  if (!found.excludedFromTotal) {
    throw new CourseNotConfigurable(
      `the grade item "${label}" counts towards the course total. Three Bands ` +
        `aggregated is the /20 this assessment does not have, and it averages "Resit" ` +
        `as though it were a low mark rather than work that was not done. Set the ` +
        `item's weight to 0 in the gradebook (Grades → Setup) and run setup again. ` +
        `Nothing has been changed.`
    );
  }
  return found;
}

/**
 * What this course still needs, read from its gradebook.
 *
 * Everything already there is left exactly as it is — that is what makes a
 * second run produce no second scale and no fourth Grade Item. The plan is built
 * before anything is written, so the aborts above happen with the gradebook
 * untouched.
 *
 * The manifest is read alongside the gradebook because it is the only place
 * that remembers which Grade Item belongs to which Competency. Without it,
 * recognising one means matching the name it was created under, and a name is
 * something a human can change in the gradebook in a second.
 */
export function buildSetupPlan(
  courseId: string,
  gradebook: Gradebook,
  manifest: Manifest
): SetupPlan {
  const scale = existingScale(gradebook);
  const items = COMPETENCIES.map((competency): ItemStep => {
    const found = existingItem(
      gradebook,
      competency,
      scale,
      gradeItemFor(manifest, competency)
    );
    return found === undefined
      ? { verb: "create", competency, name: gradeItemName(competency) }
      : { verb: "in-place", competency, item: found };
  });

  return {
    courseId,
    scale:
      scale === undefined
        ? { verb: "create", name: BAND_SCALE_NAME, values: BANDS }
        : { verb: "in-place", scale },
    items,
  };
}

export function formatSetupPlan(plan: SetupPlan): string {
  const lines = [`Configuring course ${plan.courseId} for the Oral:`];
  lines.push(
    plan.scale.verb === "create"
      ? `  create scale     ${plan.scale.name} (${plan.scale.values.join(", ")})`
      : `  scale in place   ${plan.scale.scale.name} (${plan.scale.scale.values.join(", ")})`
  );
  for (const item of plan.items) {
    lines.push(
      item.verb === "create"
        ? `  create item      ${item.name}, hidden and excluded from the course total`
        : `  item in place    ${item.item.name} (grade item ${item.item.id})`
    );
  }
  lines.push(`\n${summary(plan)}`);
  return lines.join("\n");
}

/** The last line of the report: what this run would actually add. */
function summary(plan: SetupPlan): string {
  if (isConfigured(plan)) {
    return `The Bands scale and all ${plan.items.length} grade items are already in the course.`;
  }
  const creating = toCreate(plan).length;
  const items =
    creating === 0
      ? "no grade items"
      : `${creating} grade item${creating === 1 ? "" : "s"}`;
  return plan.scale.verb === "create"
    ? `To create: the Bands scale and ${items}.`
    : `To create: ${items}. The Bands scale is already there.`;
}

export interface SetupOptions {
  readonly manifestPath: string;
  readonly driver: GradebookDriver;
  readonly report: (line: string) => void;
}

/**
 * Creates whatever the plan says is missing, and records the Grade Items.
 *
 * Everything the driver reports back is checked against what was asked for.
 * The driver has no way to ask for a visible or a weighted Grade Item, so a
 * failure here is the course having done something other than what it was
 * told — which is exactly the case where believing the request rather than the
 * answer would leave a Student able to read their Band.
 */
export async function applySetup(
  plan: SetupPlan,
  options: SetupOptions
): Promise<void> {
  const scale =
    plan.scale.verb === "in-place"
      ? plan.scale.scale
      : await createScale(plan.scale.name, plan.scale.values, options);

  for (const step of plan.items) {
    const item =
      step.verb === "in-place"
        ? step.item
        : await createItem(step.name, scale, options);
    record(step.competency, item, scale, options);
  }
}

async function createScale(
  name: string,
  values: readonly Band[],
  options: SetupOptions
): Promise<CourseScale> {
  const created = await options.driver.createScale({ name, values });
  if (!sameValues(created.values, values)) {
    throw new CourseNotConfigurable(
      `created the scale "${name}" in the course and it came back holding ` +
        `${created.values.join(", ")} rather than ${values.join(", ")}. ` +
        `No grade item has been made against it. Check the scale in the gradebook ` +
        `(Grades → Scales), correct or delete it, and run setup again.`
    );
  }
  options.report(`created scale  ${name} (scale ${created.id})`);
  return created;
}

async function createItem(
  name: string,
  scale: CourseScale,
  options: SetupOptions
): Promise<CourseGradeItem> {
  const created = await options.driver.createGradeItem({
    name,
    scaleId: scale.id,
  });
  const wrong = [
    ...(created.hidden ? [] : ["visible to Students"]),
    ...(created.excludedFromTotal ? [] : ["counting towards the course total"]),
  ];
  if (wrong.length > 0) {
    throw new CourseNotConfigurable(
      `created the grade item "${name}" and the course reports it ` +
        `${wrong.join(" and ")}. Hide it and set its weight to 0 by hand in the ` +
        `gradebook, or delete it, then run setup again.`
    );
  }
  options.report(
    `created item   ${name} (grade item ${created.id}, hidden, weight 0)`
  );
  return created;
}

/**
 * Records one Grade Item, keyed by its Competency, unless the manifest already
 * says the same thing.
 *
 * The manifest is re-read per item, as `recordPublished` is written per
 * document: a run that aborts halfway still leaves an accurate record of the
 * Grade Items that were made. Writing nothing when the entry is already right is
 * what keeps a second run from producing a diff — and "right" is every field
 * of it, so a Grade Item somebody has renamed in the gradebook is recorded
 * under the name it now has rather than the one it no longer answers to.
 */
function record(
  competency: Competency,
  item: CourseGradeItem,
  scale: CourseScale,
  options: SetupOptions
): void {
  const recorded = gradeItemFor(readManifest(options.manifestPath), competency);
  if (
    recorded?.itemId === item.id &&
    recorded.name === item.name &&
    recorded.scaleId === scale.id
  ) {
    return;
  }
  recordGradeItem(options.manifestPath, competency, {
    kind: "grade-item",
    itemId: item.id,
    name: item.name,
    scaleId: scale.id,
    createdAt: new Date().toISOString(),
  });
  options.report(`recorded       ${competency} → grade item ${item.id}`);
}
