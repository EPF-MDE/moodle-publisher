// Implementation: private to the catalog package.
//
// How a definition in the grid's front matter reads a field written as text.
import type { FrontMatterValue } from "../../documents/index.ts";

/** A field's value when it was written as a non-empty string, else undefined. */
export function nonEmptyString(
  value: FrontMatterValue | undefined
): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim() === "" ? undefined : value.trim();
}
