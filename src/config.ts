// Configuration comes from the environment, and its absence is an abort with a
// message naming the missing variable. There is no default course anywhere in
// this program: a stray run must never be able to edit a real course by
// falling back to something plausible.
//
// A `.env` file beside this package is read as a *lower* layer than the real
// environment: it is a convenience for not retyping the course id, never an
// authority. Whatever is exported in the shell wins, so a one-off run against
// a scratch course cannot be silently overridden by a file someone forgot was
// there.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
 * so to ask what the audit says on a particular day, and answering about today
 * instead would look exactly like an answer about that day.
 *
 * Only a fake-driver run can reach this. A real course ignores the variable
 * entirely, so a typo in it can never abort a publish.
 */
export class UnreadableDate extends Error {
  constructor(value: string) {
    super(
      `Aborting: PUBLISHER_NOW is set to "${value}", which is not a date. ` +
        `Set it to an ISO date or timestamp, e.g. 2026-09-11 or 2026-09-11T14:00:00Z, ` +
        `or unset it to use today's date.`
    );
    this.name = "UnreadableDate";
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
  /**
   * Where the generated Probe Sheets are written.
   *
   * A path and not a directory of dated files: the sheets are generated the
   * evening before the Orals and imported from the same file, and a second run
   * that produced a second file would leave the Instructor choosing between two
   * on the night. Re-running overwrites, which is what makes fixing a typo in a
   * probe and generating again boring.
   */
  readonly probeSheetPath: string;
  readonly runsRoot: string;
  readonly driver: DriverName;
  readonly fakeCoursePath: string | undefined;
  readonly catalogPath: string | undefined;
  /**
   * The date the audit's reveal gate is measured against, when the environment
   * names one; `undefined` means the clock.
   *
   * Honoured only for the fake driver, like {@link catalogPath} and for the
   * same reason: it is a test seam and must not be able to reach a live course
   * however the environment is set. It writes nothing, but a stale value left
   * in an `.env` would turn a real leak — the brief open a week early — into
   * "Audit passed", and the one guard that matters most is not the place to
   * accept that trade for the convenience of asking about a future date.
   */
  readonly now: Date | undefined;
}

const PUBLISHER_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

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
  const path = resolve(named ?? join(PUBLISHER_DIR, ".env"));
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
  const repoRoot = resolve(
    env["PUBLISHER_REPO_ROOT"] ?? dirname(PUBLISHER_DIR)
  );
  const driver: DriverName =
    env["PUBLISHER_DRIVER"] === "fake" ? "fake" : "browser";

  const fakeCoursePath = env["PUBLISHER_FAKE_COURSE"];
  if (driver === "fake" && fakeCoursePath === undefined) {
    throw new MissingConfiguration(
      "PUBLISHER_FAKE_COURSE",
      "The fake driver needs a file to keep its in-memory course in."
    );
  }

  return {
    baseUrl,
    courseId,
    repoRoot,
    driver,
    manifestPath: resolve(
      env["PUBLISHER_MANIFEST"] ?? join(PUBLISHER_DIR, "moodle-manifest.json")
    ),
    // Outside git, treated as a secret: it is a session cookie, revocable by
    // logging out of Office 365.
    sessionStatePath: resolve(
      env["MOODLE_SESSION_STATE"] ??
        join(homedir(), ".config", "epf-moodle-publisher", "session.json")
    ),
    probeSheetPath: resolve(
      env["PUBLISHER_PROBE_SHEETS"] ?? join(PUBLISHER_DIR, "probe-sheets.csv")
    ),
    runsRoot: resolve(env["MOODLE_RUN_DIR"] ?? join(PUBLISHER_DIR, "runs")),
    fakeCoursePath,
    // The publishable table is code, and a real run always uses the code. The
    // override is honoured only for the fake driver, so it is a test seam that
    // cannot reach a live course however the environment is set.
    catalogPath: driver === "fake" ? env["PUBLISHER_CATALOG"] : undefined,
    now: driver === "fake" ? readNow(env["PUBLISHER_NOW"]) : undefined,
  };
}

/** The overriding date, or undefined for the clock. Never a fallback. */
function readNow(raw: string | undefined): Date | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const parsed = new Date(raw.trim());
  if (Number.isNaN(parsed.getTime())) throw new UnreadableDate(raw.trim());
  return parsed;
}
