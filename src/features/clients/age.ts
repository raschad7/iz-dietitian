/**
 * Age from a `YYYY-MM-DD` calendar date.
 *
 * Deliberately does not construct a Date from the input: `new Date('1990-06-15')`
 * parses as UTC midnight and can render as the previous day in Asia/Hebron. The
 * stored value is a calendar date, so it is compared as one.
 */
export function calculateAge(dateOfBirth: string, today: Date = new Date()): number | null {
  const parts = dateOfBirth.split('-');
  if (parts.length !== 3) return null;

  const [yearPart, monthPart, dayPart] = parts;
  if (!yearPart || !monthPart || !dayPart) return null;

  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const currentMonth = today.getMonth() + 1;
  const hadBirthdayThisYear =
    currentMonth > month || (currentMonth === month && today.getDate() >= day);

  const age = today.getFullYear() - year - (hadBirthdayThisYear ? 0 : 1);

  return age >= 0 && age < 130 ? age : null;
}
