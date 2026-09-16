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
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

import { installedPublisher, SKILLS } from "../installed.ts";

/** What a course repository runs to link the skills. */
export const INSTALL_SKILLS_COMMAND = "npx moodle-publisher install-skills";

/** Repository-relative: where the installed publisher keeps its skills. */
const INSTALLED_SKILLS = `${installedPublisher()}/skills`;

/** One skill's link, as a course repository holds it. */
export interface SkillLink {
  /** Repository-relative: `.claude/skills/<name>`. */
  readonly path: string;
  /** What the symlink holds, relative to the `.claude/skills/` it sits in. */
  readonly target: string;
  /** Repository-relative: where the installed publisher keeps the skill. */
  readonly installed: string;
}

/** Every skill's link, in the order {@link SKILLS} lists them. */
export function skillLinks(): readonly SkillLink[] {
  return SKILLS.map((name) => ({
    path: `.claude/skills/${name}`,
    target: `../../${INSTALLED_SKILLS}/${name}`,
    installed: `${INSTALLED_SKILLS}/${name}`,
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
    return isOurTarget(repoRoot, path, link) ? "dangling" : "foreign";
  }
  const installed = join(repoRoot, link.installed);
  return existsSync(installed) && realpathSync(path) === realpathSync(installed)
    ? "linked"
    : "foreign";
}

/**
 * Whether the symlink at `path`, however its target is written (relative,
 * absolute, with `./` or `..` segments, through a symlinked directory), leads
 * into the publisher's skills.
 */
function isOurTarget(repoRoot: string, path: string, link: SkillLink): boolean {
  const skillsRoot = canonical(join(repoRoot, dirname(link.installed))) + sep;
  const target = canonical(resolve(dirname(path), readlinkSync(path)));
  return target.startsWith(skillsRoot);
}

/** `path` with its deepest existing ancestor resolved, the rest kept as written. */
function canonical(path: string): string {
  const parent = dirname(path);
  if (existsSync(path)) return realpathSync(path);
  return parent === path ? path : join(canonical(parent), basename(path));
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
