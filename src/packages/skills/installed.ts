// Where the publisher sits in a course repository, and the skills it ships.
//
// Both are read by more than the skills package: `check` holds the context
// pointer to the installed publisher's path, and the tests link the skills a
// course repository is required to hold.
import { readFileSync } from "node:fs";

/** The skills this package ships, in the order they are linked. */
export const SKILLS = ["feedback-letter", "banding-anchors"] as const;

/**
 * The name this package is installed under, read from its own `package.json`
 * so that a path into it is where `npm install` actually puts it.
 */
function packageName(): string {
  const manifest = new URL("../../../package.json", import.meta.url);
  const { name } = JSON.parse(readFileSync(manifest, "utf8")) as { name: string };
  return name;
}

/** Repository-relative: where a course repository's `npm install` puts the publisher. */
export function installedPublisher(): string {
  return `node_modules/${packageName()}`;
}
