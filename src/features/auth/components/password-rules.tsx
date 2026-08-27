'use client';

import { useTranslations } from 'next-intl';

import { CLIENT_MIN_PASSWORD_LENGTH, clientPasswordChecks } from '@/features/auth/password-policy';
import { cn } from '@/lib/utils';

/**
 * The three password rules, as three bars across one row that go green as they
 * are met.
 *
 * Drawn on the portal's forced set-password screen and on staff sign-up. It was
 * the client's control alone until staff took the client rule — see the note on
 * `staffPasswordSchema` — which is what made one checklist able to serve both:
 * three independent rules can be three bars, where the staff rule it replaced
 * ("any two of three classes") could not.
 *
 * ## Why this is here at all
 *
 * The hint under the box used to be one sentence carrying three rules at once —
 * "eight characters, with letters and numbers" — and a sentence cannot tell you
 * *which* of the three you have already satisfied. So a client who typed seven
 * letters read the same grey line as a client who had typed nothing, pressed
 * the button, and only then learned what was missing. Three bars answer that
 * without being read: two green and one grey is a shape, not a sentence.
 *
 * ## One bar per rule, and nothing joining them
 *
 * The three rules are independent, not sequential. They sit side by side
 * because that is a row of three answers, not a track with a start and an end —
 * a client who has typed `2024` fills the *number* bar and leaves the other two
 * grey, wherever it happens to sit in the row. Anything drawn as a single bar
 * filling across the three would have to invent a sequence they are not in.
 *
 * ## Why this is not "validating while typing"
 *
 * §Fields and forms is explicit that validation runs on blur or submit, and
 * this does not break that rule — it is its opposite. Nothing here ever turns
 * red, says a value is wrong, or marks the field invalid. A bar is either not
 * filled yet or filled, which is progress rather than judgement, and empty is
 * the state an empty box is honestly in. The red `FieldError` still waits for
 * the submit, where it belongs.
 *
 * ## Why the rules come from `password-policy.ts`
 *
 * Because a bar a value can fill while the server still rejects it is worse
 * than no bar. {@link clientPasswordChecks} is the same function
 * `isStrongClientPassword` is built from, so these three columns are the rule
 * rather than a description of it.
 *
 * The two durations are in `globals.css` under §The password rule track.
 */
export function PasswordRules({
  value,
  id,
  className,
}: {
  value: string;
  /** So the field can point `aria-describedby` at the whole list. */
  id?: string;
  className?: string;
}) {
  const t = useTranslations('login');
  const checks = clientPasswordChecks(value);

  /*
    ⚠ **Letter, then number, then length — and the order is the design's, not
    the policy's.**

    It reads outward from where the writing starts, so in Arabic that is حرف
    واحد على الأقل on the right, then رقم واحد على الأقل, then ٨ أحرف على الأقل
    at the far left; in English the same three left to right. It is also the
    order the rules are satisfied in — a person types a letter, adds a number,
    and keeps going until the box is long enough — so length sits at the end of
    the row, which is where it is reached in practice.

    `clientPasswordChecks` has no opinion about any of this; it answers three
    independent questions and this is only the order they are drawn in.
  */
  const rules = [
    { key: 'letter', met: checks.letter, label: t('ruleLetter') },
    { key: 'digit', met: checks.digit, label: t('ruleDigit') },
    {
      key: 'length',
      met: checks.length,
      label: t('ruleLength', { count: CLIENT_MIN_PASSWORD_LENGTH }),
    },
  ] as const;

  return (
    <ul
      id={id}
      aria-label={t('ruleChecklistLabel')}
      /*
        `q-rule-track` carries the two motion durations — see §The password rule
        track in `globals.css`. They are inherited from here by every column.

        Three equal columns, so the bars are the same length and can be compared
        at a glance — which is the whole reason they are bars rather than words.

        No panel behind it. The rules were in a tinted box once, which made them
        a second surface inside the card and read as something separate pinned
        under the field — §Cards is explicit about not nesting one surface in
        another.
      */
      className={cn('q-rule-track grid grid-cols-3 gap-2 pt-1', className)}
    >
      {rules.map((rule) => (
        /*
          `content-start` so the three bars stay on one line whatever their
          labels do. The sentences wrap to different numbers of lines, and
          without this the shorter column would centre its contents in the
          taller one's height and lift its bar off the row.
        */
        <li key={rule.key} className="grid content-start gap-1.5">
          {/* The unfilled bar, the full width of its column. */}
          <span aria-hidden className="h-1 overflow-hidden rounded-full bg-border">
            {/*
              Filling by width rather than by `scaleX`: a transform is physical,
              so it would sweep left-to-right in Arabic too, and the bar would
              fill from the wrong end. A block in normal flow needs no anchoring
              of its own — it already begins at the inline-start, which is the
              right edge in Arabic and the left in English.
            */}
            <span
              className={cn(
                'block h-full rounded-full bg-primary',
                'transition-[width] duration-(--q-rule-sweep) ease-sweep motion-reduce:transition-none',
                rule.met ? 'w-full' : 'w-0',
              )}
            />
          </span>

          <span
            className={cn(
              /*
                `text-balance` earns its place here more than anywhere else on
                the screen: these are four-word sentences in a column about 75px
                wide on a 320px phone, so every one of them wraps, and balancing
                the lines is what stops a column ending on a single orphaned
                word.
              */
              'text-center text-caption leading-tight text-balance',
              'transition-colors duration-(--q-rule-fade) ease-sweep motion-reduce:transition-none',
              /*
                The label takes full strength as its rule is met, which is the
                second carrier the accessibility floor asks for — the bar's
                colour must not be the only thing separating done from not done.
                Colour only, never weight: a bolder label re-measures and would
                re-wrap a sentence that is already wrapping, which is a layout
                shift on a keystroke.
              */
              rule.met ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {rule.label}
          </span>

          {/*
            Whether it is met, in words. Neither the fill nor the colour reaches
            a screen reader. Read when the list is navigated rather than
            announced on every keystroke: a live region here would narrate three
            rules per character typed.
          */}
          <span className="sr-only">{rule.met ? t('ruleMet') : t('ruleUnmet')}</span>
        </li>
      ))}
    </ul>
  );
}
