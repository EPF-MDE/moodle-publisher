// An entry point: installing the browser the browser driver launches. The
// browser is a per-machine download, not part of the install, so a course
// repository runs this once per machine and again when a new publisher tag
// moves Playwright to another Chromium revision.
import { installChromium } from "./lib/browser-install.ts";

/**
 * Installs Chromium, and nothing else, through the Playwright this package
 * depends on. Resolves to the installer's exit code. With `dryRun` it prints
 * what it would download, and where, and downloads nothing.
 */
export function installBrowser(options: { dryRun: boolean }): Promise<number> {
  return installChromium(options.dryRun);
}
