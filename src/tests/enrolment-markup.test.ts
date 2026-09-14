// What a row of the participants table and a row of the grading table mean.
//
// The counterpart to `activity-markup.test.ts`, over the seam
// `course/enrolment.ts` opens: the browser reads cells, hrefs and text off a
// page and judges nothing, and every judgement about what those readings mean
// is made by a pure function reached from here, without a browser.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  emailIn,
  enrolsAsStudent,
  submittedUrl,
} from "../packages/course/enrolment.ts";

const MOODLE = "https://moodle.epf.fr";

test("the cell that is an email is the email", () => {
  assert.equal(
    emailIn(["", "Camille Roy", "camille.roy@epf.fr", "Student"]),
    "camille.roy@epf.fr"
  );
});

test("the other domain in use is read the same way, being only data", () => {
  assert.equal(emailIn(["Sam Ngo", "sam.ngo@epfedu.fr"]), "sam.ngo@epfedu.fr");
});

test("a cell of prose mentioning an address is not read as one", () => {
  // Anchored on purpose: the cell that *is* the email is wanted, and a looser
  // match would take the first plausible thing on the row.
  assert.equal(emailIn(["write to camille.roy@epf.fr about it"]), undefined);
});

test("a row showing two addresses is refused rather than picked from", () => {
  // An email and an alternate email give no way to tell which one the Student
  // is enrolled under, and picking the first would address a Probe Sheet to an
  // identity nothing else in the course uses.
  assert.equal(
    emailIn(["Camille Roy", "camille.roy@epf.fr", "c.roy@epfedu.fr"]),
    undefined
  );
});

test("a row with no address at all reads as none", () => {
  assert.equal(emailIn(["Camille Roy", "Student", "Active"]), undefined);
});

test("the role that sits an Oral is a Student", () => {
  assert.equal(enrolsAsStudent("Student"), true);
});

test("the same role in the language the course's Moodle renders", () => {
  assert.equal(enrolsAsStudent("Étudiant"), true);
  assert.equal(enrolsAsStudent("Etudiant"), true);
});

test("whitespace and case are the table's, not a meaning", () => {
  assert.equal(enrolsAsStudent("  student  "), true);
});

test("the people who run the course are not given Probe Sheets", () => {
  // The row this filter exists for: the participants table lists the
  // Instructor and every observer, and three sheets each pads the file the
  // Instructor reads with people who will never be examined.
  assert.equal(enrolsAsStudent("Teacher"), false);
  assert.equal(enrolsAsStudent("Non-editing teacher"), false);
  assert.equal(enrolsAsStudent("Enseignant"), false);
  assert.equal(enrolsAsStudent("Manager"), false);
});

test("a Student who also helps teach still sits the Oral", () => {
  assert.equal(enrolsAsStudent("Non-editing teacher, Student"), true);
});

test("a role merely named like a Student's is not one", () => {
  assert.equal(enrolsAsStudent("Student mentor"), false);
});

test("a row Moodle gives no role is nobody this prepares a sheet for", () => {
  assert.equal(enrolsAsStudent(""), false);
  assert.equal(enrolsAsStudent("No roles"), false);
});

test("the submitted URL is the link that leaves this Moodle", () => {
  assert.equal(
    submittedUrl(
      [
        "https://moodle.epf.fr/user/view.php?id=42",
        "https://github.com/camille/agents-lab",
      ],
      "https://github.com/camille/agents-lab",
      MOODLE
    ),
    "https://github.com/camille/agents-lab"
  );
});

test("the row's own furniture is not what a Student handed in", () => {
  assert.equal(
    submittedUrl(
      [
        "https://moodle.epf.fr/mod/assign/view.php?id=7&action=grader",
        "/user/view.php?id=42",
      ],
      "Camille Roy",
      MOODLE
    ),
    undefined
  );
});

test("a Moodle that did not auto-link is read from the row's text", () => {
  assert.equal(
    submittedUrl([], "https://github.com/camille/agents-lab", MOODLE),
    "https://github.com/camille/agents-lab"
  );
});

test("a summary Moodle shortened is refused, not handed over cut", () => {
  // A repository URL cut at 140 characters is a link that leads nowhere, which
  // is worse than no link at all, because it looks like one. The caller has an
  // abort for undefined; it has none for a URL that is subtly wrong.
  assert.equal(
    submittedUrl([], "https://github.com/camille/agents-la…", MOODLE),
    undefined
  );
  assert.equal(
    submittedUrl([], "https://github.com/camille/agents-la...", MOODLE),
    undefined
  );
});
