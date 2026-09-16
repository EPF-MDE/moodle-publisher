// Implementation: private to the skills package.
//
// A skill link is `.claude/skills/<name>` in the course repository, a relative
// symlink to `node_modules/<package>/skills/<name>`. Relative, so the link
// survives the repository being cloned anywhere; into `node_modules`, so the
// skill is whatever the pinned tag installed and nothing is copied.
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { dirname, join, posix } from "node:path";

/** The skills this package ships, in the order they are linked. */
export const SKILLS: readonly string[] = ["feedback-letter", "banding-anchors"];

/** What a course repository runs to link the skills. */
export const INSTALL_SKILLS_COMMAND = "npx moodle-publisher install-skills";

/**
 * The name this package is installed under, read from its own `package.json`
 * so that a link is made to where `npm install` actually puts it.
 */
function packageName(): string {
  const manifest = new URL("../../../../package.json", import.meta.url);
  const { name } = JSON.parse(readFileSync(manifest, "utf8")) as { name: string };
  return name;
}

/** One skill's link, as a course repository holds it. */
export interface SkillLink {
  readonly name: string;
  /** Repository-relative: `.claude/skills/<name>`. */
  readonly path: string;
  /** What the symlink holds, relative to the directory it sits in. */
  readonly target: string;
  /** Repository-relative: where the installed publisher keeps the skill. */
  readonly installed: string;
  /** What every link into the installed publisher's skills starts with. */
  readonly targetRoot: string;
}

export function skillLinks(): readonly SkillLink[] {
  const installed = `node_modules/${packageName()}/skills`;
  return SKILLS.map((name) => ({
    name,
    path: `.claude/skills/${name}`,
    target: `../../${installed}/${name}`,
    installed: `${installed}/${name}`,
    targetRoot: `../../${installed}/`,
  }));
}

/** What a course repository holds where a skill's link goes. */
export type LinkState = "absent" | "linked" | "dangling" | "foreign";

/**
 * `linked` only for a symlink that resolves to the installed skill. A symlink
 * into the publisher's skills that leads nowhere is `dangling`: ours, left by a
 * tag that named the skill otherwise or by a publisher not installed yet, and
 * replacing it loses nothing. Anything else there is `foreign`.
 */
export function linkState(repoRoot: string, link: SkillLink): LinkState {
  const path = join(repoRoot, link.path);
  let symlink: boolean;
  try {
    symlink = lstatSync(path).isSymbolicLink();
  } catch {
    return "absent";
  }
  if (!symlink) return "foreign";
  if (!existsSync(path)) {
    return isOurTarget(readlinkSync(path), link) ? "dangling" : "foreign";
  }
  const installed = join(repoRoot, link.installed);
  return existsSync(installed) && realpathSync(path) === realpathSync(installed)
    ? "linked"
    : "foreign";
}

/** Whether `target`, however it is written, leads into the publisher's skills. */
function isOurTarget(target: string, link: SkillLink): boolean {
  return posix.normalize(target).startsWith(link.targetRoot);
}

/**
 * Makes the link, and the `.claude/skills` directory it sits in, replacing a
 * dangling link of ours. Only ever called on an absent or dangling link.
 */
export function makeLink(repoRoot: string, link: SkillLink): void {
  const path = join(repoRoot, link.path);
  mkdirSync(dirname(path), { recursive: true });
  rmSync(path, { force: true });
  symlinkSync(link.target, path, "dir");
}
