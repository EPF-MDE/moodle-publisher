// The suite's global setup: the publisher packed and installed the way a
// course repository gets it, once per run of the suite.
//
// `npm pack` is what decides which files a git dependency installs, so a file
// the package forgets to ship, or a source Node will not run from under
// node_modules, fails every test rather than the first course that installs a
// tag. The harness starts the installed binary and never this checkout's CLI.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The package root: two directories up from this file, under src/tests. */
const PACKAGE_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const npm = "npm";

let installRoot: string | undefined;

export async function globalSetup(): Promise<void> {
  installRoot = mkdtempSync(join(tmpdir(), "publisher-packaged-"));

  execFileSync(npm, ["pack", "--silent", "--pack-destination", installRoot], {
    cwd: PACKAGE_ROOT,
    stdio: ["ignore", "ignore", "inherit"],
  });
  const tarball = readdirSync(installRoot).find((file) =>
    file.endsWith(".tgz")
  );
  if (tarball === undefined)
    throw new Error(`npm pack left no tarball in ${installRoot}.`);

  // A course repository in miniature: nothing but the dependency.
  writeFileSync(join(installRoot, "package.json"), '{ "private": true }\n');
  execFileSync(
    npm,
    [
      "install",
      "--prefer-offline",
      "--no-audit",
      "--no-fund",
      "--ignore-scripts",
      join(installRoot, tarball),
    ],
    { cwd: installRoot, stdio: ["ignore", "ignore", "inherit"] }
  );

  process.env["PUBLISHER_PACKAGED_BIN"] = join(
    installRoot,
    "node_modules",
    ".bin",
    "moodle-publisher"
  );
}

export async function globalTeardown(): Promise<void> {
  if (installRoot !== undefined)
    rmSync(installRoot, { recursive: true, force: true });
}
