// An entry point: what the feedback-letter skill reads from `publisher.json`.
//
// The block is optional, and nothing that writes to a course reads it: it names
// the course, the file prefix and the signature a Feedback Letter carries, so
// the skill hard-codes none of them. `check` refuses a block the skill could
// not use, the day it is written rather than the evening a letter is drafted.
import { PUBLISHER_FILE } from "./lib/publisher-file.ts";

import type { Catalog } from "./index.ts";

/** What a Feedback Letter takes from the course repository. */
export interface FeedbackLetterSettings {
  /** The course as a Student knows it, first in every gist description. */
  readonly course: string;
  /** Lower-case kebab-case, first in every letter's filename. */
  readonly prefix: string;
  /** How the Instructor signs a letter. */
  readonly signature: string;
}

/** Lower-case words of letters and digits, joined by single hyphens. */
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const EXAMPLE = `"feedbackLetter": { "course": "…", "prefix": "…", "signature": "…" }`;

/** A `feedbackLetter` block the feedback-letter skill could not use. */
export class InvalidFeedbackLetter extends Error {
  constructor(reason: string) {
    super(`Refusing to pass: the "feedbackLetter" block of ${PUBLISHER_FILE} ${reason}`);
    this.name = "InvalidFeedbackLetter";
  }
}

/**
 * The catalog's `feedbackLetter` block, checked, or `undefined` when the
 * course repository has none.
 *
 * Throws {@link InvalidFeedbackLetter} when the block is not an object, when
 * `course`, `prefix` or `signature` is not a non-blank string, or when `prefix`
 * is not lower-case kebab-case, the shape a filename takes it in.
 */
export function loadFeedbackLetter(catalog: Catalog): FeedbackLetterSettings | undefined {
  const block = catalog.feedbackLetter;
  if (block === undefined) return undefined;
  if (typeof block !== "object" || block === null || Array.isArray(block)) {
    throw new InvalidFeedbackLetter(`is not an object. Write it as ${EXAMPLE}.`);
  }
  const fields = block as Record<string, unknown>;
  for (const field of ["course", "prefix", "signature"]) {
    const value = fields[field];
    if (typeof value !== "string" || value.trim() === "") {
      const problem = field in fields ? `has a "${field}" that is blank or not a string` : `has no "${field}"`;
      throw new InvalidFeedbackLetter(
        `${problem}: it needs a non-blank string for each of "course", "prefix" and "signature".`
      );
    }
  }
  const { course, prefix, signature } = fields as Record<keyof FeedbackLetterSettings, string>;
  if (!KEBAB_CASE.test(prefix)) {
    throw new InvalidFeedbackLetter(
      `has a "prefix" of "${prefix}", which is not lower-case kebab-case: ` +
        `it starts every letter's filename, so write it like "course-2027".`
    );
  }
  return { course, prefix, signature };
}
