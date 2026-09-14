// Reading a catalog from a file, so the tests can point the command line at a
// temporary repository of fixture documents. A fixture may name what it
// publishes, to students or to examiners; what it cannot do is publish
// instructor material visibly, because that is decided by the filename and not
// by anything written here.
import { readFileSync } from "node:fs";

import type { PublishedEntry } from "./table.ts";

interface FileCatalog {
  readonly published?: readonly PublishedEntry[];
  readonly deliverableSources?: readonly string[];
  readonly probeSources?: readonly string[];
}

export function readCatalogFile(path: string): {
  published: readonly PublishedEntry[];
  deliverableSources: readonly string[];
  probeSources: readonly string[];
} {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as FileCatalog;
  return {
    published: parsed.published ?? [],
    // Empty unless the fixture names one: a fixture repository defines
    // Deliverables when it is about Deliverables, and a default here would make
    // every other fixture abort over front matter its documents have no reason
    // to carry.
    deliverableSources: parsed.deliverableSources ?? [],
    // Empty for the same reason, and asked for separately: a fixture about
    // Devoirs has no reason to carry probes, and one about the Oral has no
    // reason to abort over a `probes:` block it never wrote.
    probeSources: parsed.probeSources ?? [],
  };
}
