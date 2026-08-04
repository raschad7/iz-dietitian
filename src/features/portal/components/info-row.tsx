import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

/**
 * One fact from the client's record: what it is called, and what it says.
 *
 * **There is no edit affordance, and its absence is the design.** Every value
 * this row can hold is something a dietitian recorded and builds a plan
 * against — a height, an allergy, a goal that was agreed out loud. A pencil
 * beside each one would promise an edit the client cannot make and should not
 * want to; asking the clinic to correct a mistake is a different action, it
 * happens once for the whole record, and it lives at the bottom of the screen.
 *
 * **Not provided is a state, not an empty string.** An unfilled field reads
 * `غير مسجل` in the muted weight, which says "nobody has written this down"
 * rather than leaving a gap the client has to interpret. The value is never
 * invented to fill the space.
 *
 * Two shapes, chosen by the content rather than by the caller's taste: short
 * values sit on the same line as their label, and prose — an allergy list, a
 * note from the dietitian — stacks underneath it, because a paragraph squeezed
 * into the right half of a phone screen is four words wide.
 */
export function InfoRow({
  label,
  value,
  ltr = false,
  block = false,
}: {
  label: string;
  /** `null` and `''` both render as "not recorded". */
  value: string | null;
  /**
   * Keeps the value in left-to-right order inside Arabic text. For a phone
   * number, an email or a date — strings whose internal order is Latin no
   * matter which language the page is in.
   */
  ltr?: boolean;
  /** Stacks the value under the label. For anything that runs past a few words. */
  block?: boolean;
}) {
  const t = useTranslations('portal.profile');

  const empty = value === null || value.trim() === '';

  return (
    <div
      className={cn(
        'flex gap-3 py-2.5 text-sm',
        block ? 'flex-col gap-1' : 'flex-wrap items-baseline justify-between',
      )}
    >
      <dt className="shrink-0 text-muted-foreground">{label}</dt>

      <dd
        // `whitespace-pre-line` so a dietitian's line breaks survive; `min-w-0`
        // so a long unbroken value wraps inside the row instead of pushing the
        // label off the screen.
        className={cn(
          'min-w-0 whitespace-pre-line',
          block ? 'leading-relaxed text-foreground' : 'text-end font-medium',
          empty && 'font-normal text-muted-foreground',
        )}
      >
        {empty ? (
          t('notRecorded')
        ) : ltr ? (
          /*
            `<bdi>` and not `dir` on the `dd`. Both set the internal order, but
            `dir` on the row would also flip what `text-end` resolves to, and
            the value would jump to the wrong side of an Arabic screen. `bdi`
            isolates the string and leaves the row's own alignment alone.
          */
          <bdi dir="ltr">{value}</bdi>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
