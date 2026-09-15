// Implementation: private to the catalog package.
//
// The yes/no probes a Probe Sheet carries, per Competency, read from the front
// matter of the document whose band criteria they are drawn from. Defined once
// and in the grid, for the reason `deliverable.ts` gives about the Freeze: what
// the Instructor asks at the Oral is what the Students read in the criteria two
// screens below, and the two are checked against each other by eye, in one
// diff. A second list of questions kept somewhere else is a set of probes that
// quietly stops being the ones the course promised.
//
// Every failure here is an abort naming the document and the Competency. There
// is no default probe and no partial set: a Competency whose probes could not
// be read is an Oral opened with a blank sheet, which is the hand-written sheet
// this exists to replace.
import { bandNamedIn } from "../../course/gradebook.ts";
import { frontMatter } from "../../documents/index.ts";

import { idsOf, isDeclared } from "./competency.ts";

import type { Competency } from "../../course/gradebook.ts";
import type { FrontMatterValue } from "../../documents/index.ts";

/** The probes for one Competency, in the order the Instructor reads them. */
export interface CompetencyProbes {
  readonly competency: Competency;
  readonly probes: readonly string[];
}

/** One list of probes per Competency, in the order the grid declares them. */
export type Probes = readonly CompetencyProbes[];

/**
 * The grid the catalog names defines no probes.
 *
 * Not "no probes, then", for the reason {@link NoDeliverables} is not "no
 * Deliverables, then": naming a grid is a statement that the probes are in it,
 * and a run that generated sheets with nothing on them would leave the
 * Instructor exactly where they started.
 */
export class NoProbes extends Error {
  constructor(grid: string) {
    super(
      `Refusing to start: "${grid}" is the grid that defines the Oral's probes, and its ` +
        `front matter defines none. Probes are written in a "probes:" block at the top of the ` +
        `file, one list per competency. Restore it, or point the catalog's grid at the ` +
        `document that defines them.`
    );
    this.name = "NoProbes";
  }
}

/** A declared Competency the document says nothing about. */
export class MissingProbes extends Error {
  constructor(source: string, competency: string) {
    super(
      `Refusing to start: "${source}" defines no probes for ${competency}, which is a ` +
        `competency this course grades. Every competency's Probe Sheet is prepared, ` +
        `${competency}'s included — an Oral opened on a blank sheet is the sheet written out ` +
        `by hand that this replaces. Add a "${competency}:" list under "probes:".`
    );
    this.name = "MissingProbes";
  }
}

/** A probes block naming something the grid does not declare as a Competency. */
export class UnknownProbedCompetency extends Error {
  constructor(
    source: string,
    written: string,
    declared: readonly Competency[]
  ) {
    super(
      `Refusing to start: "${source}" defines probes for "${written}", which is not a ` +
        `competency it declares. The competencies are ${idsOf(declared)}. Probes ` +
        `nobody is graded on are questions asked at an Oral for nothing.`
    );
    this.name = "UnknownProbedCompetency";
  }
}

/** A probes block whose entries are not a list of questions. */
export class MalformedProbes extends Error {
  constructor(source: string, competency: string) {
    super(
      `Refusing to start: the probes for "${competency}" in "${source}" are not a list of ` +
        `questions. Write one "- " item per probe, each a question the Instructor can answer ` +
        `yes or no at the Oral.`
    );
    this.name = "MalformedProbes";
  }
}

/**
 * A probe that names a Band.
 *
 * The whole content of ADR-0002 read backwards: the tooling prepares the sheet
 * and the human fills it in, so a probe reading "is this Solid?" would be this
 * program suggesting the verdict it is not allowed to have an opinion about —
 * printed at the top of the sheet, above the field the Instructor has yet to
 * fill in. It is refused at the source rather than filtered out later, because
 * the fix is a word in the front matter and the person who typed it is the one
 * who should see this.
 */
export class ProbeNamesABand extends Error {
  constructor(source: string, competency: string, probe: string, band: string) {
    super(
      `Refusing to start: the ${competency} probe "${probe}" in "${source}" names the band ` +
        `"${band}". A Probe Sheet carries the questions and an empty verdict — nothing on it ` +
        `suggests a band, because the tooling prepares the sheet and the Instructor fills it ` +
        `in. Reword the probe as something answerable yes or no.`
    );
    this.name = "ProbeNamesABand";
  }
}

/**
 * The probes every declared Competency's Probe Sheet carries, read from the
 * grid.
 *
 * Read before the course is opened, like the Deliverables and for the same
 * reason: every refusal in this file is about the repository, and none of them
 * is worth finding out with a browser sitting in the course.
 */
export function readProbes(
  repoRoot: string,
  grid: string,
  competencies: readonly Competency[]
): Probes {
  const found = new Map<string, readonly string[]>(
    probesIn(repoRoot, grid, competencies)
  );
  return competencies.map((competency) => {
    const probes = found.get(competency.id);
    if (probes === undefined) throw new MissingProbes(grid, competency.id);
    return { competency, probes };
  });
}

function probesIn(
  repoRoot: string,
  source: string,
  competencies: readonly Competency[]
): readonly (readonly [string, readonly string[]])[] {
  const written = frontMatter(repoRoot, source)?.["probes"];
  if (written === undefined) throw new NoProbes(source);
  if (
    typeof written !== "object" ||
    written === null ||
    Array.isArray(written)
  ) {
    throw new NoProbes(source);
  }
  const entries = Object.entries(written as Record<string, FrontMatterValue>);
  if (entries.length === 0) throw new NoProbes(source);
  return entries.map(([name, value]) => {
    if (!isDeclared(competencies, name)) {
      throw new UnknownProbedCompetency(source, name, competencies);
    }
    return [name, readList(source, name, value)] as const;
  });
}

function readList(
  source: string,
  competency: string,
  value: FrontMatterValue
): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new MalformedProbes(source, competency);
  }
  return value.map((entry) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw new MalformedProbes(source, competency);
    }
    const probe = entry.trim();
    const band = bandNamedIn(probe);
    if (band !== undefined) {
      throw new ProbeNamesABand(source, competency, probe, band);
    }
    return probe;
  });
}
