/**
 * Initials for the generated avatar.
 *
 * Takes the first character of the first two words. Works for Arabic and Latin
 * alike; `Array.from` rather than `charAt` so an astral-plane character is not
 * split into half a surrogate pair.
 *
 * Lives in `lib` rather than in a feature: the calendar's client picker, the
 * dashboard agenda and the top-clients list all draw the same avatar, and a
 * shared UI component may not reach into a feature folder for it.
 */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('');
}
