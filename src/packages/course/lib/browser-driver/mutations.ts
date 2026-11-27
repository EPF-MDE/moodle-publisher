import { createRunRecorder } from "../run-recorder.ts";
import type { RunRecorder } from "../run-recorder.ts";
import { PLAIN_TEXT_EDITOR } from "../selectors.ts";
import type { DriverSession } from "./navigation.ts";
import { setEditorPreference } from "./sign-in.ts";

/** What one driver keeps about its mutating run, made on first mutation. */
export function createMutations(session: DriverSession) {
  const { page, options, watch } = session;

  // The run directory and the editor preference both belong to mutating runs.
  // A plan reads the course and writes nothing — not to the course, and not
  // to the instructor's own account — so neither is touched until a mutation is
  // actually about to happen. That also keeps a plan from aborting on an
  // editor control it never needs.
  let recorder: RunRecorder | undefined;
  let previousEditor: string | undefined;

  async function prepareToMutate(): Promise<RunRecorder> {
    if (recorder === undefined) {
      // The plain text editor, so that a Devoir's description is typed as
      // HTML source. What is restored at the end is what the instructor had.
      previousEditor = await setEditorPreference(
        page,
        options.baseUrl,
        PLAIN_TEXT_EDITOR,
        watch
      );
      recorder = createRunRecorder(
        options.runDir,
        page,
        `course ${options.courseId} at ${options.baseUrl}\nstarted ${new Date().toISOString()}\n`
      );
    }
    return recorder;
  }

  /**
   * Writes an abort into `run.txt`. The message is the first thing wanted when
   * a run is picked apart afterwards, and the terminal it was printed to is
   * usually gone by then.
   */
  function noteAbort(mutation: RunRecorder, error: unknown): void {
    mutation.note(
      `  ABORTED ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return {
    prepareToMutate,
    noteAbort,
    previousEditor: (): string | undefined => previousEditor,
  };
}

export type Mutations = ReturnType<typeof createMutations>;
