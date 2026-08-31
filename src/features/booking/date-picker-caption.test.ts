import { describe, expect, test } from 'bun:test';

/**
 * One date field, navigated one way.
 *
 * The appointment dialog's date and the new-client dialog's date of birth are
 * reachable from each other — booking a walk-in opens one and then the other —
 * and for a while they opened two different panels: the caption *ring* here (one
 * control naming the month and the year, opening onto months and then years) and
 * the month/year *dropdowns* there. `DatePicker` defaults to the ring, and the
 * appointment dialog simply never passed the prop, while its own comment
 * described dropdowns.
 *
 * These are source assertions for the same reason `dialog-responsive.test.ts`
 * is: the guarantee is a prop at a call site, and the failure it catches is one
 * of them being edited without the other.
 */

/** A source file's code, with its comments removed. */
async function codeOf(path: string): Promise<string> {
  const source = await Bun.file(`${import.meta.dir}/../../${path}`).text();
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/** The props of the first `<DatePicker …>` in a file. */
function datePickerProps(code: string): string {
  const at = code.indexOf('<DatePicker');
  expect(at).toBeGreaterThan(-1);
  return code.slice(at, code.indexOf('/>', at));
}

describe('the two date fields a booking crosses', () => {
  test('the appointment dialog opens the month and year dropdowns', async () => {
    /*
     * Measured before the fix: the panel's caption was a single button reading
     * "August 2026" with `aria-label="Choose a month"` and no combobox in it.
     * After: two comboboxes, "August" and "2026" — the same pair the date of
     * birth has always shown.
     */
    expect(datePickerProps(await codeOf('features/booking/components/appointment-dialog.tsx'))).toContain(
      'caption="dropdowns"',
    );
  });

  test('and marks the chosen day in the same colour', async () => {
    /*
     * Measured, on the same 2026-08-12 in both panels: the chosen cell is
     * `rgb(117, 207, 72)` — `--primary` — with white numerals. Before the fix
     * the appointment field's was `rgb(28, 27, 23)`, the neutral `--foreground`
     * that `selectedTone="neutral"` swaps `--primary` for.
     */
    expect(datePickerProps(await codeOf('features/booking/components/appointment-dialog.tsx'))).toContain(
      'selectedTone="primary"',
    );
  });

  test('the client card asks for the same, and is where both values come from', async () => {
    const code = await codeOf('features/clients/components/client-identity-fields.tsx');
    // `dobCaption` resolves to 'dropdowns' unless a surface overrides it.
    expect(code).toContain(`dateOfBirthCaption ?? 'dropdowns'`);
    expect(code).toContain('caption={dobCaption}');
    /*
     * The tone is derived from the caption rather than set beside it, which is
     * why the appointment field had to take both or neither: one panel marking
     * its day two ways is the failure this pairing exists to prevent.
     */
    expect(code).toContain(`const dobTone = dobCaption === 'dropdowns' ? 'primary' : 'neutral'`);
    expect(code).toContain('selectedTone={dobTone}');
  });

  test('`DatePicker` still defaults to the ring, so this stays a decision', async () => {
    /*
     * The default is right for a date near today, which is most of them. What
     * these two fields have in common is that the *year* is the question — a
     * birthday, and a booking that may be months out — and that is what the
     * dropdowns are for. Flipping the default would quietly change every other
     * date field in the app.
     */
    expect(await codeOf('components/ui/date-picker.tsx')).toContain(`caption = 'chooser'`);
  });
});
