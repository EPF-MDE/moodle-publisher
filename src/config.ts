// Configuration comes from the environment, and its absence is an abort with a
// message naming the missing variable. There is no default course anywhere in
// this program: a stray run must never be able to edit a real course by
// falling back to something plausible.
//
// The run happens in a course repository: the directory the command line is
// started in. The documents are read from there, and the course's run state —
// the manifest, the run captures and the `.env` — is kept
// there, never beside this package, which once installed is inside
// node_modules and goes with the next install.
//
// A `.env` file at the repository root is read as a *lower* layer than the real
// environment: it is a convenience for not retyping the course id, never an
// authority. Whatever is exported in the shell wins, so a one-off run against
// a scratch course cannot be silently overridden by a file someone forgot was
// there.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export class UnreadableEnvFile extends Error {
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`Aborting: cannot read the env file ${path}. ${reason}`);
    this.name = "UnreadableEnvFile";
    this.path = path;
  }
}

/**
 * `PUBLISHER_NOW` is set to something that is not a date.
 *
 * Falling back to the clock would be worse than stopping: whoever set it did
 * so to publish as of a particular day, and a footer dated today would look
 * exactly like one dated that day.
 *
 * Only a fake-driver run can reach this. A real course ignores the variable
 * entirely, so a typo in it can never abort a publish.
 */
export class UnreadableNow extends Error {
  constructor(value: string) {
    super(
      `Aborting: PUBLISHER_NOW is set to "${value}", which is not a date. ` +
        `Set it to an ISO date or timestamp, e.g. 2026-09-11 or 2026-09-11T14:00:00Z, ` +
        `or unset it to use the clock.`
    );
    this.name = "UnreadableNow";
  }
}

export class MissingConfiguration extends Error {
  readonly variable: string;

  constructor(variable: string, hint: string) {
    super(`Aborting: ${variable} is not set. ${hint}`);
    this.name = "MissingConfiguration";
    this.variable = variable;
  }
}

export type DriverName = "browser" | "fake";

export interface Config {
  readonly baseUrl: string;
  readonly courseId: string;
  readonly repoRoot: string;
  readonly manifestPath: string;
  readonly sessionStatePath: string;
  readonly runsRoot: string;
  readonly driver: DriverName;
  readonly fakeCoursePath: string | undefined;
  /**
   * The instant a run publishes as of, when the environment names one;
   * `undefined` means the clock. It dates the footer of every PDF.
   *
   * Honoured only for the fake driver: it is a test seam and must not reach a
   * live course however the environment is set. A stale value left in an
   * `.env` would otherwise print last month's date on this morning's PDFs, and
   * a Student comparing printouts would be told the wrong one is current.
   */
  readonly now: Date | undefined;
}

/**
 * The course repository a run is in: the directory it was started in, unless
 * `PUBLISHER_REPO_ROOT` names another.
 *
 * Read only from the real environment, like `PUBLISHER_ENV_FILE`: the env file
 * is found at this root, so a root named inside it would move the file that
 * named it.
 */
export function repositoryRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env["PUBLISHER_REPO_ROOT"] ?? process.cwd());
}

/** `KEY=value`, with an optional `export`. */
const ENV_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;

/**
 * Reads one value out of a `.env` line. Single quotes are literal; double
 * quotes take the usual escapes; an unquoted value stops at a ` #`, so a
 * trailing comment never becomes part of a course id.
 */
function parseValue(raw: string): string {
  const quote = raw[0];
  if (quote === '"' || quote === "'") {
    const end = raw.lastIndexOf(quote);
    if (end > 0) {
      const inner = raw.slice(1, end);
      return quote === "'"
        ? inner
        : inner
            .replaceAll("\\n", "\n")
            .replaceAll("\\t", "\t")
            .replaceAll('\\"', '"');
    }
  }
  const comment = raw.indexOf(" #");
  return (comment === -1 ? raw : raw.slice(0, comment)).trim();
}

/**
 * The variables set in `path`, or `{}` when there is no file there and none
 * was demanded.
 *
 * A file named explicitly and not found is an abort: a typo in
 * `PUBLISHER_ENV_FILE` must not quietly degrade into "no file", which would
 * either fail later complaining about a different variable or, worse, run on
 * whatever was left over in the shell.
 */
export function readEnvFile(
  path: string,
  optional: boolean
): Record<string, string> {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" && optional) return {};
    throw new UnreadableEnvFile(
      path,
      code === "ENOENT" ? "No such file." : String(code ?? error)
    );
  }

  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const match = ENV_LINE.exec(line);
    // A line that is not an assignment is skipped rather than aborting: .env
    // files collect stray notes, and a note cannot change which course is
    // written to.
    if (match === null) continue;
    const value = parseValue(match[2] ?? "");
    // `KEY=` means "not set", so an empty assignment neither masks the shell
    // nor satisfies a required variable with nothing.
    if (value !== "") values[match[1] as string] = value;
  }
  return values;
}

/**
 * The environment a run reads: the file underneath, the real environment on
 * top. `PUBLISHER_ENV_FILE` names the file and is read only from the real
 * environment — one env file cannot redirect to another.
 */
export function resolveEnv(
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const named = env["PUBLISHER_ENV_FILE"];
  const path = resolve(named ?? join(repositoryRoot(env), ".env"));
  return { ...readEnvFile(path, named === undefined), ...env };
}

function required(
  env: NodeJS.ProcessEnv,
  variable: string,
  hint: string
): string {
  const value = env[variable];
  if (value === undefined || value.trim() === "")
    throw new MissingConfiguration(variable, hint);
  return value.trim();
}

export function readConfig(rawEnv: NodeJS.ProcessEnv = process.env): Config {
  const env = resolveEnv(rawEnv);
  const baseUrl = required(
    env,
    "MOODLE_BASE_URL",
    "Set it to the Moodle site, e.g. https://moodle.epf.fr."
  );
  const courseId = required(
    env,
    "MOODLE_COURSE_ID",
    "Set it to the id of the course to publish into. There is no default course."
  );
  const printing = readRenderConfig(rawEnv);
  const { repoRoot, driver } = printing;

  const fakeCoursePath = env["PUBLISHER_FAKE_COURSE"];
  if (driver === "fake" && fakeCoursePath === undefined) {
    throw new MissingConfiguration(
      "PUBLISHER_FAKE_COURSE",
      "The fake driver needs a file to keep its in-memory course in."
    );
  }

  return {
    ...printing,
    baseUrl,
    courseId,
    manifestPath: resolve(
      env["PUBLISHER_MANIFEST"] ?? join(repoRoot, "moodle-manifest.json")
    ),
    // Outside git, treated as a secret: it is a session cookie, revocable by
    // logging out of Office 365.
    sessionStatePath: resolve(
      env["MOODLE_SESSION_STATE"] ??
        join(homedir(), ".config", "epf-moodle-publisher", "session.json")
    ),
    fakeCoursePath,
  };
}

/**
 * What `render` reads of the configuration, and the whole of it: which driver
 * prints, where the run captures go, and the day a PDF's footer states.
 *
 * No site, no course id and no session: a preview is made on any machine, and
 * a render that asked for a course id would be asking for one it never uses.
 */
export interface RenderConfig {
  readonly repoRoot: string;
  readonly runsRoot: string;
  readonly driver: DriverName;
  /** As {@link Config.now}: honoured for the fake driver only. */
  readonly now: Date | undefined;
}

export function readRenderConfig(
  rawEnv: NodeJS.ProcessEnv = process.env
): RenderConfig {
  const env = resolveEnv(rawEnv);
  const repoRoot = repositoryRoot(rawEnv);
  const driver: DriverName =
    env["PUBLISHER_DRIVER"] === "fake" ? "fake" : "browser";
  return {
    repoRoot,
    runsRoot: resolve(env["MOODLE_RUN_DIR"] ?? join(repoRoot, "runs")),
    driver,
    now: driver === "fake" ? readNow(env["PUBLISHER_NOW"]) : undefined,
  };
}

/** The overriding instant, or undefined for the clock. Never a fallback. */
function readNow(raw: string | undefined): Date | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const now = new Date(raw.trim());
  if (Number.isNaN(now.getTime())) throw new UnreadableNow(raw);
  return now;
}
