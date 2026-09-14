#!/usr/bin/env node
// The command line, as a course repository that installed this package runs it.
//
// The publisher is TypeScript run by Node with no build step. From its own
// checkout `node src/cli.ts` is enough, but Node refuses to strip types from a
// file under node_modules, which is exactly where a git dependency lands. So
// this one file is JavaScript: it strips the types of this package's own
// sources as they load, and hands over to the CLI.
import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const PACKAGE_ROOT = new URL("../", import.meta.url).href;

// Stripping is still experimental in Node, and says so on stderr every run. A
// run's stderr is where its refusals are read, so that one line is dropped and
// every other warning goes through.
const emitWarning = process.emitWarning;
process.emitWarning = function (warning, ...rest) {
  const type = typeof rest[0] === "string" ? rest[0] : rest[0]?.type;
  if (
    type === "ExperimentalWarning" &&
    String(warning).includes("stripTypeScriptTypes")
  )
    return;
  return emitWarning.call(process, warning, ...rest);
};

registerHooks({
  load(url, context, nextLoad) {
    if (!url.startsWith(PACKAGE_ROOT) || !new URL(url).pathname.endsWith(".ts"))
      return nextLoad(url, context);
    const source = readFileSync(fileURLToPath(url), "utf8");
    return {
      format: "module",
      source: stripTypeScriptTypes(source),
      shortCircuit: true,
    };
  },
});

await import(
  pathToFileURL(fileURLToPath(new URL("../src/cli.ts", import.meta.url))).href
);
