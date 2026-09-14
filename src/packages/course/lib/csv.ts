// Implementation: private to the course package.
//
// Reading a CSV, because the fake course has to read one. Moodle's gradebook
// import is handed a file and works out what is in it; a fake that was handed
// the rows instead would be a fake of a different thing, and the one property
// the import has to have — that what enters the gradebook is what is in the
// file on disk — would be tested nowhere.
//
// RFC 4180, which is what the publisher writes: quoted fields, doubled quotes
// inside them, and newlines inside a field, of which every Probe Sheet has
// several.

/**
 * `text` as records of fields, the first record being the header.
 *
 * A trailing newline ends the last record rather than starting an empty one,
 * which is how every file this reads is written. Anything else — a stray blank
 * line in the middle, a row short of the header — is left as it is found: what
 * to make of a malformed file is the caller's, and this reports what is there.
 */
export function readCsv(text: string): readonly (readonly string[])[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let at = 0;
  while (at < text.length) {
    const character = text[at] as string;
    if (quoted) {
      if (character === '"') {
        // A doubled quote is one quote; a single one ends the field.
        if (text[at + 1] === '"') {
          field += '"';
          at += 2;
          continue;
        }
        quoted = false;
        at += 1;
        continue;
      }
      field += character;
      at += 1;
      continue;
    }
    if (character === '"') {
      quoted = true;
      at += 1;
      continue;
    }
    if (character === ",") {
      record.push(field);
      field = "";
      at += 1;
      continue;
    }
    // `\r\n` and `\n` alike: a file that travelled through a spreadsheet comes
    // back with the other one, and it is the same file.
    if (character === "\n" || character === "\r") {
      if (character === "\r" && text[at + 1] === "\n") at += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      at += 1;
      continue;
    }
    field += character;
    at += 1;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}
