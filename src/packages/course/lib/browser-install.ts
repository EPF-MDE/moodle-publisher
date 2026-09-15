// Chromium, installed through the Playwright this package depends on.
//
// Playwright keeps its browsers in a per-machine cache keyed by revision, not
// beside the package, and each Playwright release may move the revision. Its
// own hint when the browser is missing is `npx playwright install`, which
// downloads Firefox and WebKit too, and assumes the course repository knows it
// depends on Playwright at all. It should not have to: the publisher runs its
// own Playwright's command line, for Chromium alone.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** What a course repository runs to install the browser the publisher launches. */
const INSTALL_BROWSER_COMMAND = "npx moodle-publisher install-browser";

/**
 * The abort to say instead of Playwright's own box, when a launch failed
 * because the browser is not installed; undefined for any other failure. The
 * path Playwright looked at is kept: it names the revision it wanted.
 */
export function browserMissing(error: unknown): Error | undefined {
  if (!(error instanceof Error)) return undefined;
  const missing = /Executable doesn't exist at (\S+)/.exec(error.message);
  if (missing === null) return undefined;
  return new Error(
    "Aborting: the browser this publisher launches is not installed on this machine " +
      `(Playwright looked for ${missing[1]}). ` +
      `Install it with \`${INSTALL_BROWSER_COMMAND}\` (\`npm run browser\` if the course repository names it so), then run again.`
  );
}

/**
 * Runs `playwright install chromium` with this package's own Playwright, its
 * output straight to the terminal, and resolves to its exit code. `dryRun`
 * prints what would be downloaded, and where, without downloading it.
 */
export function installChromium(dryRun: boolean): Promise<number> {
  // The command line is not among the package's exports; its package.json is,
  // and the command line sits beside it.
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve("playwright/package.json")), "cli.js");
  const args = [cli, "install", ...(dryRun ? ["--dry-run"] : []), "chromium"];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}
