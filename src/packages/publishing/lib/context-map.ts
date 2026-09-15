// Implementation: private to the publishing package.
//
// A course repository's context pointer: the `CONTEXT-MAP.md` at its root,
// naming its own glossary and ADRs beside the installed publisher's. The
// publisher's glossary and ADRs ship in its package and are never copied, so
// upgrading the pinned tag is the sync, and the pointer is the one thing left
// that can go stale: a typo, a folder renamed by an upgrade, a publisher that
// was never installed. Each leaves an agent following a path to nothing.
//
// A repository with no `CONTEXT-MAP.md` has no pointer to go stale, and a link
// that does not go into the installed publisher is the course's own business.
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

/** Where a course repository keeps its context pointer. */
const CONTEXT_MAP = "CONTEXT-MAP.md";

/**
 * The name this package is installed under, read from its own `package.json`
 * so that the pointer is checked against what `npm install` actually creates.
 */
function packageName(): string {
  const manifest = new URL("../../../../package.json", import.meta.url);
  const { name } = JSON.parse(readFileSync(manifest, "utf8")) as { name: string };
  return name;
}

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
 * Throws {@link UnresolvedContextPointer} for the first link in the course
 * repository's `CONTEXT-MAP.md` that goes into the installed publisher and
 * names nothing there. Writes nothing.
 */
export function assertContextPointerResolves(repoRoot: string): void {
  const path = join(repoRoot, CONTEXT_MAP);
  if (!existsSync(path)) return;

  const installed = `node_modules/${packageName()}`;
  for (const target of linkTargets(readFileSync(path, "utf8"))) {
    const normalised = posix.normalize(target);
    const intoPublisher = normalised === installed || normalised.startsWith(`${installed}/`);
    if (intoPublisher && !existsSync(join(repoRoot, normalised))) {
      throw new UnresolvedContextPointer(target, installed);
    }
  }
}
