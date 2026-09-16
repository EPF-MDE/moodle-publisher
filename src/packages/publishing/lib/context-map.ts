// Implementation: private to the publishing package.
//
// A course repository's context pointer: the `CONTEXT-MAP.md` at its root,
// naming its own glossary and ADRs beside the installed publisher's. The
// publisher's glossary and ADRs ship in its package and are never copied, so
// upgrading the pinned tag is the sync, and the pointer is the one thing left
// that can go stale: a typo, a folder renamed by an upgrade, a publisher that
// was never installed. Each leaves an agent following a path to nothing.
//
// The pointer is required, as `publisher.json` is: a repository with no
// `CONTEXT-MAP.md`, or with one that never links to the publisher's glossary
// and its ADRs, leaves an agent with no way to find them at all. Any other
// link — the course's own glossary, its own ADRs — is the course's business.
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { installedPublisher } from "../../skills/installed.ts";

/** Where a course repository keeps its context pointer. */
const CONTEXT_MAP = "CONTEXT-MAP.md";

/** The context pointer names a path into the installed publisher that is not there. */
export class UnresolvedContextPointer extends Error {
  constructor(target: string, installed: string) {
    super(
      `Refusing to pass: ${CONTEXT_MAP} points to "${target}", which is not there. ` +
        `The installed publisher ships its glossary at ${installed}/CONTEXT.md and its ` +
        `ADRs in ${installed}/docs/adr/. Point there, or run npm install if the ` +
        `publisher is not installed.`
    );
    this.name = "UnresolvedContextPointer";
  }
}

/** A link every context map has to hold, as it is written into one. */
interface RequiredLink {
  readonly label: string;
  readonly target: string;
}

/** The course repository has no context pointer: no map, or one missing a link it needs. */
export class MissingContextPointer extends Error {
  constructor(refusal: string, missing: readonly RequiredLink[]) {
    const links = missing.map(({ label, target }) => `- [${label}](./${target})`);
    super(`Refusing to pass: ${refusal}\n${links.join("\n")}`);
    this.name = "MissingContextPointer";
  }
}

/** `./a/b/` and `a/b` are one link. */
function normaliseTarget(target: string): string {
  return posix.normalize(target).replace(/\/$/, "");
}

/** Inline links, `[text](target "title")`, and reference definitions, `[id]: target`. */
const LINK_TARGETS = [/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, /^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/gm];

/** Every link target `markdown` holds, anchors dropped, in the order written. */
function linkTargets(markdown: string): string[] {
  const found: { index: number; target: string }[] = [];
  for (const pattern of LINK_TARGETS) {
    for (const match of markdown.matchAll(pattern)) {
      found.push({ index: match.index, target: match[1] ?? "" });
    }
  }
  return found
    .sort((a, b) => a.index - b.index)
    .map(({ target }) => target.split("#")[0] ?? "")
    .filter((target) => target !== "");
}

/**
 * Throws {@link MissingContextPointer} when the course repository has no
 * `CONTEXT-MAP.md`, {@link UnresolvedContextPointer} for the first link in it
 * that goes into the installed publisher and names nothing there, and
 * {@link MissingContextPointer} again when it links to neither or only one of
 * the publisher's glossary and its ADRs. Writes nothing.
 */
export function assertContextPointer(repoRoot: string): void {
  const installed = installedPublisher();
  const required: readonly RequiredLink[] = [
    { label: "Publisher", target: `${installed}/CONTEXT.md` },
    { label: "ADRs", target: `${installed}/docs/adr/` },
  ];

  const path = join(repoRoot, CONTEXT_MAP);
  if (!existsSync(path)) {
    throw new MissingContextPointer(
      `${CONTEXT_MAP} is required at the root of the course repository, pointing into ` +
        `the installed publisher. Create it with these links:`,
      required
    );
  }

  const linked = new Set<string>();
  for (const target of linkTargets(readFileSync(path, "utf8"))) {
    const normalised = normaliseTarget(target);
    const intoPublisher = normalised === installed || normalised.startsWith(`${installed}/`);
    if (intoPublisher && !existsSync(join(repoRoot, normalised))) {
      throw new UnresolvedContextPointer(target, installed);
    }
    linked.add(normalised);
  }

  const missing = required.filter(({ target }) => !linked.has(normaliseTarget(target)));
  if (missing.length > 0) {
    const named = missing.map(({ target }) => target).join(" and ");
    throw new MissingContextPointer(
      `${CONTEXT_MAP} does not link to ${named}. ` +
        `Add ${missing.length === 1 ? "this link" : "these links"} to it:`,
      missing
    );
  }
}
