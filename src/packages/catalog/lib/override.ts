// Reading a catalog from a file, so the tests can point the command line at a
// temporary repository of fixture documents. A fixture may name what it
// publishes, to students or to examiners; what it cannot do is publish
// instructor material visibly, because that is decided by the filename and not
// by anything written here. What it must do is name its grid.
import { readFileSync } from "node:fs";

import type { PublishedEntry } from "./table.ts";

/**
 * A catalog file that does not say which document is the grid.
 *
 * No default: the grid is where the Deliverables and the probes are read from,
 * and a catalog that forgot to name it must not publish Devoirs out of
 * whichever file a default happened to point at.
 */
export class NoGrid extends Error {
  constructor(path: string) {
    super(
      `Refusing to start: the catalog file "${path}" names no grid. Set "grid" to the ` +
        `repository-relative path of the assessment grid, e.g. "assessment-grid.md".`
    );
    this.name = "NoGrid";
  }
}

interface FileCatalog {
  readonly grid?: unknown;
  readonly published?: readonly PublishedEntry[];
}

export function readCatalogFile(path: string): {
  grid: string;
  published: readonly PublishedEntry[];
} {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as FileCatalog;
  if (typeof parsed.grid !== "string" || parsed.grid.trim() === "") {
    throw new NoGrid(path);
  }
  return {
    grid: parsed.grid,
    published: parsed.published ?? [],
  };
}
