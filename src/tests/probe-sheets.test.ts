// Generating the Probe Sheets: one per Student per Competency, written to a
// CSV and nowhere else.
//
// Two of these tests are the ones the command exists for. Nothing in the
// generated file suggests a Band — that is the whole content of ADR-0002, and
// it is a property checked here rather than a thing the generator is trusted
// about. And a Submission from somebody the enrolment does not have stops the
// run: the alternative is a sheet silently missing from the set, found out at
// that Student's Oral with nothing prepared.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BOTH_DELIVERABLES,
  GRID_TITLE,
  cellFor,
  enrol,
  gridDefining,
  handInTo,
  probeSheets,
  probeSheetsText,
  writeGrid,
} from "./harness.ts";
import type { Workspace } from "./harness.ts";

const BANDS = ["Resit", "Needs Work", "Basic", "Solid", "Outstanding"];

const C1_ITEM = "C1 — Framing and decomposing work";
const C2_ITEM = "C2 — Extending and constraining an agent";
const C3_ITEM = "C3 — Recovering from failure";
const C1_SHEET = `Feedback: ${C1_ITEM}`;
const C2_SHEET = `Feedback: ${C2_ITEM}`;
const C3_SHEET = `Feedback: ${C3_ITEM}`;

const C1_TITLE = "Your repository — C1 and C2";
const C3_TITLE = "Your C3 branch — recovering from failure";

/**
 * The probes as the grid's front matter defines them: one list per Competency,
 * each item a question the Instructor answers yes or no at the Oral.
 */
const PROBES = `probes:
  C1:
    - Does the specification resolve an ambiguity the request left open?
    - Three or more units of work, each executable on its own?
  C2:
    - An instruction document the agent reached unprompted, with evidence?
    - A deterministic enforcement, with evidence it fired?
  C3:
    - One command, run live, that goes red on the bug?`;

const AMINA = { email: "amina@epf.fr", name: "Amina Diallo" };
// A second domain, deliberately. Both are in use on this course and neither
// means anything: a Student on either is matched the same way, by their whole
// address, and nothing anywhere reads the part after the @.
const BRUNO = { email: "bruno@epfedu.fr", name: "Bruno Meyer" };

/** A fixture grid defining the two Deliverables and the probes. */
function grid(probes: string = PROBES): string {
  return `${BOTH_DELIVERABLES}\n${probes}`;
}

/** A repository whose grid defines both, and a catalog that says where each is. */
function repository(probes: string = PROBES): Workspace {
  const workspace = gridDefining(grid(probes));
  workspace.writeCatalog({
    published: [
      {
        source: "assessment-grid.md",
        title: GRID_TITLE,
        section: "Assessment",
      },
    ],
  });
  return workspace;
}

/**
 * A course as it stands the evening before the Orals: the Devoirs published,
 * two Students enrolled, and work handed into both Deliverables.
 */
async function courseBeforeTheOrals(
  probes: string = PROBES
): Promise<Workspace> {
  const workspace = repository(probes);
  const published = await workspace.publisher(["publish", "--apply"]);
  assert.equal(published.code, 0, published.stderr);
  enrol(workspace, [AMINA, BRUNO]);
  handInTo(workspace, C1_TITLE, {
    email: AMINA.email,
    url: "https://github.com/amina/agents-c1",
  });
  handInTo(workspace, C3_TITLE, {
    email: AMINA.email,
    url: "https://github.com/amina/agents-c1/tree/c3",
  });
  handInTo(workspace, C1_TITLE, {
    email: BRUNO.email,
    url: "https://github.com/bruno/agents-c1",
  });
  return workspace;
}

test("generation writes a CSV and changes nothing in the course", async () => {
  const workspace = await courseBeforeTheOrals();
  const before = workspace.readCourse();

  const result = await workspace.publisher(["probes"]);

  assert.equal(result.code, 0, result.stderr);
  // The course, the Devoirs, the gradebook and the Submissions, all as they
  // were. Reporting is the default here as it is everywhere else in this
  // program: the file is there to be read before anything enters the gradebook.
  assert.deepEqual(workspace.readCourse(), before);
  assert.equal(workspace.readCourse().scales, undefined);
  assert.match(
    result.stdout,
    /Nothing in the course or the gradebook has been changed/
  );
  assert.ok(probeSheetsText(workspace) !== undefined);
});

test("one Probe Sheet per enrolled Student per Competency, covering C1, C2 and C3", async () => {
  const workspace = await courseBeforeTheOrals();

  const result = await workspace.publisher(["probes"]);

  assert.equal(result.code, 0, result.stderr);
  const { header, rows } = probeSheets(workspace);
  assert.deepEqual(header, [
    "name",
    "email",
    C1_ITEM,
    C1_SHEET,
    C2_ITEM,
    C2_SHEET,
    C3_ITEM,
    C3_SHEET,
  ]);
  // One row per Student, three sheets on each: the shape one gradebook import
  // reads, so that even C3 has its field waiting rather than being made
  // mid-slot.
  assert.deepEqual(
    rows.map((row) => row[1]),
    [AMINA.email, BRUNO.email]
  );
  for (const email of [AMINA.email, BRUNO.email]) {
    for (const column of [C1_SHEET, C2_SHEET, C3_SHEET]) {
      assert.ok(
        (cellFor(workspace, email, column) ?? "").length > 0,
        `${email} has no sheet in "${column}"`
      );
    }
  }
});

test("each sheet carries the yes/no probes for its Competency, and no others", async () => {
  const workspace = await courseBeforeTheOrals();

  await workspace.publisher(["probes"]);

  const c1 = cellFor(workspace, AMINA.email, C1_SHEET) ?? "";
  const c3 = cellFor(workspace, AMINA.email, C3_SHEET) ?? "";
  assert.match(
    c1,
    /Does the specification resolve an ambiguity the request left open\?\s+Y \/ N/
  );
  assert.match(
    c1,
    /Three or more units of work, each executable on its own\?\s+Y \/ N/
  );
  // What is asked at the Oral is what the grid told Students they would be
  // asked — including that the C1 sheet does not carry C3's question.
  assert.doesNotMatch(c1, /goes red on the bug/);
  assert.match(
    c3,
    /One command, run live, that goes red on the bug\?\s+Y \/ N/
  );
  assert.doesNotMatch(c3, /resolve an ambiguity/);
});

test("each sheet carries that Student's submitted URL, per Deliverable", async () => {
  const workspace = await courseBeforeTheOrals();

  await workspace.publisher(["probes"]);

  // C1 and C2 are served by one Deliverable, so both sheets carry the
  // repository; C3 is served by the branch Deliverable and carries the branch.
  for (const column of [C1_SHEET, C2_SHEET]) {
    assert.match(
      cellFor(workspace, AMINA.email, column) ?? "",
      /^Submitted: https:\/\/github\.com\/amina\/agents-c1$/m
    );
  }
  assert.match(
    cellFor(workspace, AMINA.email, C3_SHEET) ?? "",
    /^Submitted: https:\/\/github\.com\/amina\/agents-c1\/tree\/c3$/m
  );
});

test("a Student who handed nothing in still gets every sheet, saying so", async () => {
  const workspace = await courseBeforeTheOrals();

  await workspace.publisher(["probes"]);

  // Bruno handed in the repository and never made the C3 branch. He still sits
  // an Oral and is still given a verdict, so the sheet exists and says what is
  // true rather than being left out of the set.
  assert.match(
    cellFor(workspace, BRUNO.email, C1_SHEET) ?? "",
    /^Submitted: https:\/\/github\.com\/bruno\/agents-c1$/m
  );
  assert.match(
    cellFor(workspace, BRUNO.email, C3_SHEET) ?? "",
    /^Submitted: nothing handed in$/m
  );
  assert.match(cellFor(workspace, BRUNO.email, C3_SHEET) ?? "", /Y \/ N/);
});

test("every provisional band and every weakest point is empty", async () => {
  const workspace = await courseBeforeTheOrals();

  await workspace.publisher(["probes"]);

  for (const email of [AMINA.email, BRUNO.email]) {
    for (const item of [C1_ITEM, C2_ITEM, C3_ITEM]) {
      assert.equal(
        cellFor(workspace, email, item),
        "",
        `${email}'s ${item} carries a provisional band`
      );
    }
    for (const column of [C1_SHEET, C2_SHEET, C3_SHEET]) {
      // The label, and nothing after it: the tooling prepares the sheet and the
      // Instructor writes on it.
      assert.match(
        cellFor(workspace, email, column) ?? "",
        /\nWeakest point to probe:$/
      );
    }
  }
});

/**
 * The file with the URLs Students handed in taken out: everything this program
 * wrote, and nothing a Student did.
 *
 * A sheet is one quoted, multi-line CSV cell, so a `Submitted:` line is not at
 * the start of a line of the *file* — it sits behind that row's own commas and
 * an opening quote. Matched wherever it falls for that reason, and the caller
 * checks this took something out: a lay-out change that stopped it matching
 * would otherwise turn the check below back into a scan of the whole file
 * without failing, which is how it read before.
 */
function withoutSubmittedUrls(csv: string): string {
  return csv.replace(/Submitted: [^\n"]*/g, "Submitted:");
}

test("the generated CSV contains no band value anywhere", async () => {
  const workspace = await courseBeforeTheOrals();

  await workspace.publisher(["probes"]);

  // The property, over the whole file rather than over the columns this test
  // happens to know about: ADR-0002 says nothing here suggests a verdict, and
  // a check that only looked where a band was expected would miss the day
  // somebody puts one in a heading.
  //
  // Over the whole of what this program *authored*, which is the file with the
  // URLs Students handed in taken out. A repository somebody called
  // `solid-state` is a fact about their work and not this program having an
  // opinion, and the test that says otherwise is a test that fails the day a
  // Student names a branch unluckily. That exclusion is the guard's too, and
  // the test below is what pins it.
  const csv = withoutSubmittedUrls(probeSheetsText(workspace) ?? "");
  assert.ok(
    !csv.includes("github.com"),
    "the URLs Students handed in were not taken out, so this is scanning them too"
  );
  for (const band of BANDS) {
    assert.doesNotMatch(
      csv,
      new RegExp(`(^|\\W)${band.replace(/\s+/g, "\\s+")}(\\W|$)`, "i"),
      `the generated sheets name the band "${band}"`
    );
  }
});

test("a Student whose repository is named after a band still gets a sheet", async () => {
  // The other side of the guard, and the reason it reads what this program
  // authored rather than the whole file: a repository somebody called
  // `solid-state` is their data. Refusing over it would be ADR-0002 blocking an
  // Oral for a word in a URL, and the Student it blocked would be the one with
  // nothing prepared.
  const workspace = await courseBeforeTheOrals();
  handInTo(workspace, C1_TITLE, {
    email: BRUNO.email,
    url: "https://github.com/bruno/solid-state",
  });

  const result = await workspace.publisher(["probes"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(probeSheetsText(workspace) ?? "", /solid-state/);
});

test("a probe that names a band aborts, and writes nothing", async () => {
  const workspace = await courseBeforeTheOrals();
  writeGrid(
    workspace,
    grid(`probes:
  C1:
    - Is the decomposition Solid?
  C2:
    - A deterministic enforcement, with evidence it fired?
  C3:
    - One command, run live, that goes red on the bug?`)
  );

  const result = await workspace.publisher(["probes"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /names the band "Solid"/);
  assert.match(result.stderr, /assessment-grid\.md/);
  assert.equal(probeSheetsText(workspace), undefined);
});

test("the enrolment is read at generation time, so a late enrolment appears", async () => {
  const workspace = await courseBeforeTheOrals();
  const first = await workspace.publisher(["probes"]);
  assert.equal(first.code, 0, first.stderr);
  assert.equal(cellFor(workspace, "chloe@epf.fr", C1_SHEET), undefined);

  enrol(workspace, [{ email: "chloe@epf.fr", name: "Chloé Bertrand" }]);
  const second = await workspace.publisher(["probes"]);

  assert.equal(second.code, 0, second.stderr);
  // Enrolled after the last run and in the set, with all three sheets: nothing
  // here is cached, and the participants page is read at the moment the sheets
  // are made.
  for (const column of [C1_SHEET, C2_SHEET, C3_SHEET]) {
    assert.ok((cellFor(workspace, "chloe@epf.fr", column) ?? "").length > 0);
  }
  assert.match(second.stdout, /3 enrolled Students/);
});

test("Students on either email domain are matched the same way", async () => {
  const workspace = await courseBeforeTheOrals();

  const result = await workspace.publisher(["probes"]);

  assert.equal(result.code, 0, result.stderr);
  // One `@epf.fr` and one `@epfedu.fr`, both matched to their own Submission.
  // The domains are data: nothing branches on them, and the only way to tell
  // is that neither Student is treated differently from the other.
  assert.match(
    cellFor(workspace, AMINA.email, C1_SHEET) ?? "",
    /github\.com\/amina\/agents-c1/
  );
  assert.match(
    cellFor(workspace, BRUNO.email, C1_SHEET) ?? "",
    /github\.com\/bruno\/agents-c1/
  );
});

test("a Submission from someone not enrolled aborts, naming the email", async () => {
  const workspace = await courseBeforeTheOrals();
  handInTo(workspace, C1_TITLE, {
    email: "chloe@epfedu.fr",
    url: "https://github.com/chloe/agents-c1",
  });

  const result = await workspace.publisher(["probes"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /chloe@epfedu\.fr/);
  assert.match(result.stderr, new RegExp(C1_TITLE));
  // Not a sheet quietly missing from the set: nothing at all is written, so
  // whatever the last good run produced is still on disk to be read.
  assert.equal(probeSheetsText(workspace), undefined);
});

test("nobody enrolled aborts rather than writing a file that grades nobody", async () => {
  const workspace = repository();
  const published = await workspace.publisher(["publish", "--apply"]);
  assert.equal(published.code, 0, published.stderr);

  const result = await workspace.publisher(["probes"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /nobody is enrolled in course 4242/);
  assert.equal(probeSheetsText(workspace), undefined);
});

test("a Competency with no probes aborts, naming it", async () => {
  const workspace = await courseBeforeTheOrals();
  writeGrid(
    workspace,
    grid(`probes:
  C1:
    - Three or more units of work, each executable on its own?
  C2:
    - A deterministic enforcement, with evidence it fired?`)
  );

  const result = await workspace.publisher(["probes"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /defines no probes for C3/);
  assert.equal(probeSheetsText(workspace), undefined);
});

test("generating before the Devoirs are published aborts, naming the Deliverable", async () => {
  const workspace = repository();
  enrol(workspace, [AMINA]);

  const result = await workspace.publisher(["probes"]);

  assert.equal(result.code, 1);
  assert.match(
    result.stderr,
    /nothing is recorded as published for Deliverable "c1-1"/
  );
  assert.equal(probeSheetsText(workspace), undefined);
});

test("re-running overwrites the one file rather than leaving two", async () => {
  const workspace = await courseBeforeTheOrals();
  await workspace.publisher(["probes"]);
  handInTo(workspace, C3_TITLE, {
    email: BRUNO.email,
    url: "https://github.com/bruno/agents-c1/tree/c3",
  });

  const second = await workspace.publisher(["probes"]);

  assert.equal(second.code, 0, second.stderr);
  // The evening before the Orals is not the moment to be choosing between two
  // generated files: a URL handed in late shows up by re-running, in place.
  assert.match(
    cellFor(workspace, BRUNO.email, C3_SHEET) ?? "",
    /^Submitted: https:\/\/github\.com\/bruno\/agents-c1\/tree\/c3$/m
  );
  assert.equal(probeSheets(workspace).rows.length, 2);
});
