// What a reveal date is, and what it means to be past it.
//
// Both live here rather than at the two places that ask, because they are one
// decision seen from two sides: the guard rejects a date this file could not
// compare, and the audit asks this file whether the day has come. A format
// change touches this module and nothing else.

/** `YYYY-MM-DD`, naming a day of a month that exists. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().startsWith(`${value}T`)
  );
}

/**
 * Whether `revealedOn` has arrived as of `now`.
 *
 * The day turns at midnight UTC, which in Paris is two in the morning. Nothing
 * that asks this runs close enough to the boundary for that to decide
 * anything, and a program that carried a timezone for this one comparison
 * would have to be right about it everywhere else too.
 */
export function isRevealed(revealedOn: string, now: Date): boolean {
  return now.getTime() >= Date.parse(`${revealedOn}T00:00:00Z`);
}
