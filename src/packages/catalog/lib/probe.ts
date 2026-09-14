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

import { COMPETENCIES } from "./deliverable.ts";

import type { FrontMatterValue } from "../../documents/index.ts";
import type { Competency } from "./deliverable.ts";

/** The probes for one Competency, in the order the Instructor reads them. */
export type Probes = Readonly<Record<Competency, readonly string[]>>;

/**
 * A document the table says defines the probes defines none.
 *
 * Not "no probes, then", for the reason {@link NoDeliverables} is not "no
 * Deliverables, then": the table naming a document is a statement that the
 * probes are in it, and a run that generated sheets with nothing on them would
 * leave the Instructor exactly where they started.
 */
export class NoProbes extends Error {
  constructor(source: string) {
    super(
      `Refusing to start: "${source}" is the document that defines the Oral's probes, and its ` +
        `front matter defines none. Probes are written in a "probes:" block at the top of the ` +
        `file, one list per competency. Restore it, or take the document out of the probe table.`
    );
    this.name = "NoProbes";
  }
}

/** A Competency the document says nothing about. */
export class MissingProbes extends Error {
  constructor(source: string, competency: Competency) {
    super(
      `Refusing to start: "${source}" defines no probes for ${competency}, which is a ` +
        `competency this course grades. Every competency's Probe Sheet is prepared, ` +
        `${competency}'s included — an Oral opened on a blank sheet is the sheet written out ` +
        `by hand that this replaces. Add a "${competency}:" list under "probes:".`
    );
    this.name = "MissingProbes";
  }
}

/** A probes block naming something that is not a Competency. */
export class UnknownProbedCompetency extends Error {
  constructor(source: string, written: string) {
    super(
      `Refusing to start: "${source}" defines probes for "${written}", which is not a ` +
        `competency this course has. The competencies are ${COMPETENCIES.join(", ")}. Probes ` +
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
 * The probes every Competency's Probe Sheet carries, read from `sources`.
 *
 * Read before the course is opened, like the Deliverables and for the same
 * reason: every refusal in this file is about the repository, and none of them
 * is worth finding out with a browser sitting in the course.
 */
export function readProbes(
  repoRoot: string,
  sources: readonly string[]
): Probes {
  const found = new Map<Competency, readonly string[]>();
  for (const source of sources) {
    for (const [competency, probes] of probesIn(repoRoot, source)) {
      found.set(competency, probes);
    }
  }
  const [source = ""] = sources;
  for (const competency of COMPETENCIES) {
    if (!found.has(competency)) throw new MissingProbes(source, competency);
  }
  return Object.fromEntries(found) as Probes;
}

function probesIn(
  repoRoot: string,
  source: string
): readonly (readonly [Competency, readonly string[]])[] {
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
    if (!(COMPETENCIES as readonly string[]).includes(name)) {
      throw new UnknownProbedCompetency(source, name);
    }
    return [name as Competency, readList(source, name, value)] as const;
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
