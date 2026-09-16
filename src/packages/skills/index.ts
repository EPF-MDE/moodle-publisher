// The agent skills the publisher ships, and their links in a course repository.
//
// The skills live in this package, under `skills/`, and a course repository
// links each into its own `.claude/skills/` rather than copying it: upgrading
// the pinned tag is the sync, as it is for the glossary. Linking runs once and
// never touches Moodle; `check` then requires every link to lead to the
// installed skill.
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  INSTALL_SKILLS_COMMAND,
  linkState,
  makeLink,
  skillLinks,
} from "./lib/links.ts";

/**
 * `install-skills` will not link: the publisher is not installed where the
 * links would lead, or something it did not make is where a link goes.
 */
export class SkillLinkRefused extends Error {
  constructor(message: string) {
    super(`Aborting: ${message} Nothing was linked.`);
    this.name = "SkillLinkRefused";
  }
}

/** A course repository whose skill link is missing, dangling, or leads somewhere else. */
export class BrokenSkillLink extends Error {
  constructor(path: string, problem: string) {
    super(
      `Refusing to pass: ${path} ${problem}. The publisher's skills are linked ` +
        `into the course repository, not copied: run \`${INSTALL_SKILLS_COMMAND}\` ` +
        `(after npm install, if the publisher is not installed).`
    );
    this.name = "BrokenSkillLink";
  }
}

/**
 * Links every skill into `repoRoot`'s `.claude/skills/`, and reports each link
 * as it goes. A link already there is left alone, so a second run is a no-op.
 *
 * Every link is decided before any is made: a refusal about the second skill
 * leaves the first unlinked too, rather than a repository half-done. With
 * `dryRun`, it reports what it would link and makes nothing.
 */
export function installSkills(
  repoRoot: string,
  options: { readonly dryRun: boolean; readonly report: (line: string) => void }
): void {
  const links = skillLinks();

  const notInstalled = links.filter(
    (link) => !existsSync(join(repoRoot, link.installed, "SKILL.md"))
  );
  if (notInstalled.length > 0) {
    throw new SkillLinkRefused(
      `the publisher's skills are not installed in this course repository ` +
        `(there is no ${notInstalled.map((link) => link.installed).join(" or ")}). ` +
        `Run npm install, then run this again.`
    );
  }

  const states = links.map((link) => ({ link, state: linkState(repoRoot, link) }));
  const foreign = states.filter(({ state }) => state === "foreign").map(({ link }) => link);
  if (foreign.length > 0) {
    throw new SkillLinkRefused(
      `${foreign.map((link) => link.path).join(" and ")} already ` +
        `${foreign.length === 1 ? "exists and is" : "exist and are"} not the ` +
        `publisher's link. Move ${foreign.length === 1 ? "it" : "them"} aside ` +
        `if the publisher's skill should replace ${foreign.length === 1 ? "it" : "them"}.`
    );
  }

  for (const { link, state } of states) {
    if (state === "linked") {
      options.report(`${link.path} is already linked.`);
    } else if (options.dryRun) {
      options.report(`Would link ${link.path} → ${link.target}`);
    } else {
      makeLink(repoRoot, link);
      options.report(`Linked ${link.path} → ${link.target}`);
    }
  }
}

/**
 * Throws {@link BrokenSkillLink} for the first skill whose link in `repoRoot`
 * is missing, leads nowhere, or leads anywhere but the installed skill. Writes
 * nothing.
 */
export function assertSkillLinks(repoRoot: string): void {
  for (const link of skillLinks()) {
    switch (linkState(repoRoot, link)) {
      case "linked":
        continue;
      case "absent":
        throw new BrokenSkillLink(link.path, "is missing");
      case "dangling":
        throw new BrokenSkillLink(link.path, `leads nowhere, where it should lead to ${link.installed}`);
      case "foreign":
        throw new BrokenSkillLink(link.path, `is not a link to ${link.installed}`);
    }
  }
}
