The EPF Moodle publisher: publishes a course from its own repository into Moodle, one way and repeatably. A course repository installs it as a git dependency pinned to a tag and runs the `moodle-publisher` binary.

Run `npm run check` (typecheck + import boundaries + tests + grade import selectors) before calling a code change done.

## No build step

The publisher is TypeScript run by Node directly. `bin/moodle-publisher.js` is the one JavaScript file: Node will not strip types from a file under `node_modules`, so the binary does it for this package's own sources as they load. Write only erasable TypeScript (`erasableSyntaxOnly` is on) and import with `.ts` extensions.

## Packages are deep modules

The source is under `src/`. Its packages are deep modules: import a package only through its entry points (its root files), never into its subfolders. No barrels, no cycles. `npm run lint:boundaries` enforces this with `.dependency-cruiser.cjs`. See [src/packages/README.md](./src/packages/README.md) before adding or importing a package.

## Tests

Tests live centrally in `src/tests/` and run on fixtures alone; none reads a real course's files. The one seam is `src/tests/harness.ts`: it runs the command line as a subprocess, with the fake driver, against a temporary repository. The command it runs is the **packaged** publisher: the suite's global setup (`src/tests/packaged.ts`) runs `npm pack`, installs the tarball into a scratch course repository and hands the harness its binary. So run the suite through `npm test`, or `node --test --test-global-setup=src/tests/packaged.ts <file>` for one file, and remember a file missing from `files` in `package.json` fails every test.

## Never unattended

The browser driver refuses to run when `CI` is set, and no workflow here touches Moodle. Do not add one.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for EPF-MDE/moodle-publisher, through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
