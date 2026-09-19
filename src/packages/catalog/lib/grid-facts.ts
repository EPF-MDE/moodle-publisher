// Implementation: private to the catalog package.
//
// What the Grid Source's front matter states about the course besides its
// Competencies and its Deliverables: the programme, the term and the Oral. The
// Grid Frame writes each into what a Student reads (ADR-0014), so each is
// stated once, here, and printed as written.
//
// Every one of them is required. There is no default programme, term or Oral:
// a Grid Frame with an empty slot, or with another course's facts in it, is a
// grid that tells Students something nobody wrote down.
import { frontMatter } from "../../documents/index.ts";

import { nonEmptyString } from "./scalar.ts";

import type { FrontMatter, FrontMatterValue } from "../../documents/index.ts";

/** The course's facts the Grid Frame states, each as the Grid Source writes it. */
export interface GridFacts {
  /** The EPF programme the course is taught in, e.g. `Ingénieur 4A`. */
  readonly programme: string;
  /** The term it is taught in, e.g. `Autumn 2026`. */
  readonly term: string;
  readonly oral: {
    /** How long one Student's Oral lasts, e.g. `20 minutes`. */
    readonly length: string;
    /** When the Orals happen, e.g. `14 and 15 September 2026`. */
    readonly when: string;
  };
}

/**
 * A fact the Grid Frame states is missing from the Grid Source's front matter,
 * or written as something other than text.
 *
 * `field` is named as the front matter spells it, a nested one by its path:
 * `oral.length`.
 */
export class MissingGridField extends Error {
  constructor(grid: string, field: string) {
    super(
      `Refusing to start: "${grid}" has no "${field}" written as text in its front matter. The Grid Frame ` +
        `states the programme, the term and the Oral from the Grid Source, written as ` +
        `"programme:", "term:" and an "oral:" block with "length:" and "when:", each as ` +
        `the text a Student reads. None of them is defaulted.`
    );
    this.name = "MissingGridField";
  }
}

/** The facts the Grid Source at `grid` states, each one checked. */
export function readGridFacts(repoRoot: string, grid: string): GridFacts {
  const declared: FrontMatter = frontMatter(repoRoot, grid) ?? {};
  const text = (value: FrontMatterValue | undefined, field: string): string => {
    const written = nonEmptyString(value);
    if (written === undefined) throw new MissingGridField(grid, field);
    return written;
  };
  const programme = text(declared["programme"], "programme");
  const term = text(declared["term"], "term");
  const oral = declared["oral"];
  if (typeof oral !== "object" || oral === null || Array.isArray(oral)) {
    throw new MissingGridField(grid, "oral");
  }
  const fields = oral as FrontMatter;
  return {
    programme,
    term,
    oral: {
      length: text(fields["length"], "oral.length"),
      when: text(fields["when"], "oral.when"),
    },
  };
}
