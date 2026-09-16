// What a reveal date is. The guard rejects a date this file cannot read, and a
// format change touches this module and nothing else.

/** `YYYY-MM-DD`, naming a day of a month that exists. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().startsWith(`${value}T`)
  );
}
