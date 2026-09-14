// Implementation: private to the publishing package.
//
// Writing a CSV, to the one rule that matters here — the file has to be read
// twice. Moodle's gradebook import reads it, and so does the Instructor, before
// anything of it enters the gradebook. So it is RFC 4180 and nothing clever:
// no separator that depends on a locale, no encoding of newlines into escapes
// a spreadsheet would show as text, and no BOM.

/**
 * One field, quoted when it has to be.
 *
 * Quoted for a comma, a quote, a newline or edge whitespace, and left alone
 * otherwise, so that a file a human opens is mostly unquoted and readable. A
 * quote inside a quoted field is doubled, which is the whole of the escaping
 * rule.
 */
function field(value: string): string {
  const needsQuotes = /[",\n\r]/.test(value) || value.trim() !== value;
  return needsQuotes ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * `rows` as a CSV, the first row being the header, ending in a newline.
 *
 * Records are separated by `\n` and not `\r\n`: Moodle's CSV import reads
 * either, and a file with one kind of line ending is one whose embedded
 * newlines — a Probe Sheet is several lines inside one field — cannot be
 * confused with the ends of records by anything reading it by eye.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return `${rows.map((row) => row.map(field).join(",")).join("\n")}\n`;
}

/**
 * How many records `csv` holds, the header among them.
 *
 * Counting and not parsing, because the one thing that has to be read out of a
 * generated file before it is imported is how many Students are in it, and
 * splitting every field of it into memory to learn that would be reading a file
 * whose whole point is to travel to Moodle untouched.
 */
export function countRecords(csv: string): number {
  return scan(csv).records;
}

/**
 * The value of column `at` in every record, the header's among them, in the
 * order the file writes them.
 *
 * One column and not the file: what has to be read out of the generated file
 * before it is imported is the identity column, so that the Students it carries
 * can be checked against the Students the course holds. Every other cell of it
 * is a Probe Sheet, and a run that had read those into memory would be a run
 * that could believe it knew better than the file it is about to hand over.
 *
 * A record short of `at` columns yields the empty string, as a missing cell
 * does: what to make of a malformed file belongs to the caller checking it.
 */
export function columnValues(csv: string, at: number): readonly string[] {
  return scan(csv, at).values;
}

/**
 * One pass over the file: how many records, and — where a column is named — its
 * cell in each of them.
 *
 * One scanner and not two, because the subtlety is the same for both and it is
 * the kind that is only found once: newlines inside a quoted field are not
 * record endings. A Probe Sheet is several lines in one cell, so counting the
 * `\n`s of this file would report thirty Students as two hundred, and reading
 * its second column by splitting on commas would report a line of a sheet as an
 * email address.
 */
function scan(
  csv: string,
  wanted?: number
): { readonly records: number; readonly values: readonly string[] } {
  const values: string[] = [];
  let records = 0;
  let column = 0;
  let wantedValue = "";
  let quoted = false;
  let started = false;

  const endRecord = (): void => {
    records += 1;
    if (wanted !== undefined) values.push(wantedValue);
    column = 0;
    wantedValue = "";
    started = false;
  };

  for (let at = 0; at < csv.length; at += 1) {
    const character = csv[at] as string;
    if (character === '"') {
      // A doubled quote inside a quoted field is a quote, not the end of one.
      if (quoted && csv[at + 1] === '"') {
        at += 1;
        if (column === wanted) wantedValue += '"';
        started = true;
        continue;
      }
      quoted = !quoted;
      started = true;
      continue;
    }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && csv[at + 1] === "\n") at += 1;
      endRecord();
      continue;
    }
    if (!quoted && character === ",") {
      column += 1;
      started = true;
      continue;
    }
    if (column === wanted) wantedValue += character;
    started = true;
  }
  // A file that does not end in a newline still ends in a record.
  if (started) endRecord();
  return { records, values };
}
