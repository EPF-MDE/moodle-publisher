// An entry point: the run directory. Every mutating action a driver takes is
// captured here — a screenshot before, and a screenshot, the page's HTML and
// the URL after — into one timestamped directory per run.
//
// It is its own entry point rather than a private detail of the browser driver
// because what a failed run leaves behind is a promise made to the instructor,
// not an implementation choice: the run directory is how a publish that went
// wrong against the live course is diagnosed once the terminal is gone.
export { createRunRecorder } from "./lib/run-recorder.ts";

export type { RunRecorder } from "./lib/run-recorder.ts";
