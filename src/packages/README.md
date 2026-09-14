# Packages

Every package here is a **deep module**: a lot of behaviour behind a small
interface. A package's public surface is its **entry points** — the files at the
package root. Everything in a subfolder is private.

```
src/packages/
  <name>/
    index.ts        ← an entry point (public). Import this from outside.
    client.ts       ← another entry point. A package may expose SEVERAL.
    lib/            ← implementation: hidden, free to import itself
    lib/nested/     ← still implementation: ANY subfolder is private
```

Tests live centrally, in `src/tests/`, outside every package — see the third
rule below.

Packages are flat: one tier of immediate children under `src/packages/`. A
package's internals may nest as deep as you like, but a package never contains
another package.

## The four rules

**Entry points only, from outside.** Code outside a package — the CLI, or
another package — may import that package's root files and nothing else. Reaching
into `some-package/lib/anything.ts` is an error. This is what keeps the interface
small enough to be worth learning.

**Freedom inside.** A package's own files import each other however they like.
The rule constrains what crosses the seam at the package root, not how the
implementation is organised behind it.

**Tests go through the entry points too.** Every test lives in `src/tests/`,
outside the packages, and imports packages exactly the way the CLI does: entry
points only, never internals. The interface is the test surface — if you need to
test past it, the module is the wrong shape. Integration tests spanning several
packages are the normal case, and need no special permission: from `src/tests/`
every package looks the same. Fixtures and harnesses are peers in `src/tests/`
(see `harness.ts`).

**No cycles.** No dependency cycles anywhere.

## No barrel files

Because the public surface is _every_ root file, expose several small entry
points (`index.ts`, `client.ts`, `server.ts`) rather than funnelling everything
through one `index.ts` that re-exports a whole subtree. A barrel makes the
interface look small while hiding an unbounded surface behind it, and it drags
unrelated code into every importer. Adding an entry point is just adding a root
file — no config change, no barrel.

Adding a subfolder never needs a config change either: the rules are depth-based,
so _any_ subfolder is private. `lib/` and `tests/` are conventions, not
hardcoded names.

## Running the check

```bash
npm run lint:boundaries        # from the repository root
npm run check                  # typecheck + boundaries + tests
```

The rules live in `.dependency-cruiser.cjs`. The only thing you should
ever need to edit there is `PACKAGES_ROOT`, plus the commented layering stub if
this project ever needs to constrain _which_ packages may depend on which.
`lint:boundaries` runs in `npm run check` alongside the typecheck.
