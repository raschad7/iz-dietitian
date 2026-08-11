import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Icon, type IconName } from '@/components/ui/icon';
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
 * `غير مسجل` in a dashed amber chip — `Badge variant="unrecorded"`, which keeps
 * the dashed edge that says "absence rather than event" and takes §Status's
 * "needs follow-up" fill for the colour. It is the same dashed language the
 * unrecorded stat tiles above it use, so one glance down the screen says which
 * parts of the record are still blank — and now says it warmly enough to be
 * seen. The value is never invented to fill the space. See the variant's own
 * note for why this is amber and deliberately not clay.
 *
 * **Three shapes, chosen by the content rather than by the caller's taste.**
 * A short value sits at the inline-end of its own label's line; prose — an
 * allergy list, a note from the dietitian — drops to a panel on the line below,
 * because a paragraph squeezed into the end of a phone row is four words wide;
 * and an empty field takes the chip, on one line, whichever of the two it was
 * declared as.
 */
export function InfoRow({
  label,
  value,
  icon,
  ltr = false,
  block = false,
}: {
  label: string;
  /** `null` and `''` both render as "not recorded". */
  value: string | null;
  /**
   * The glyph for this field, drawn on a disc before the label. A row is then
   * findable by its mark rather than only by reading it — which is the whole
   * job on a screen that is fifteen labelled facts.
   */
  icon?: IconName;
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

  /*
    **An empty `block` row is not a block.** `block` exists to give a paragraph
    room; "not recorded" is two words, and stacking it under its own label spent
    a two-line row saying nothing. A health section whose four prose fields are
    all unfilled — the ordinary case for a new client — was eight lines of empty
    scaffolding before the section had said anything at all.

    So the shape follows the content it actually has, not the shape the caller
    expected it to have. Nothing is hidden: the row is still there and still
    reads `غير مسجل`, on one line.
  */
  const stacked = block && !empty;

  const content = empty ? (
    <Badge variant="unrecorded">{t('notRecorded')}</Badge>
  ) : ltr ? (
    /*
      `<bdi>` and not `dir` on the `dd`. Both set the internal order, but `dir`
      on the row would also flip what `text-end` resolves to, and the value would
      jump to the wrong side of an Arabic screen. `bdi` isolates the string and
      leaves the row's own alignment alone.
    */
    <bdi dir="ltr">{value}</bdi>
  ) : (
    value
  );

  return (
    /*
      `flex-wrap` with a full-width `dd` is what lets the value drop to its own
      line without a wrapper around the label — `<dl>` grouping allows a `div`
      holding a `dt`/`dd` pair, but only as their *direct* parent, so nesting one
      around the label alone would be invalid markup.

      **It wraps only when it is meant to.** `flex-wrap` was on every row, so an
      inline value that outgrew the space left beside its label dropped onto a
      line of its own — the working hours did exactly that, and the row then
      read as a label with an orphaned string under it instead of as a pair.
      Wrapping belongs to the `stacked` shape, which asks for it; an inline row
      keeps its two parts on one line and lets a long value wrap *inside* the
      value column, against the row's own inline-end edge.
    */
    <div
      className={cn(
        'flex items-center justify-between gap-x-3 gap-y-2 py-3',
        stacked && 'flex-wrap',
      )}
    >
      {/*
        `shrink-0` on an inline row: the label is the shorter, fixed half of the
        pair, so when something has to give it should be the value wrapping
        inside its own column, not the label breaking across two lines beside a
        value that fits on one. A `stacked` row keeps the label shrinkable — the
        value is on its own line there and is not competing for the space.
      */}
      <dt
        className={cn(
          'flex items-center gap-2.5 text-sm text-muted-foreground',
          stacked ? 'min-w-0' : 'shrink-0',
        )}
      >
        {icon ? (
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-primary"
          >
            <Icon name={icon} className="size-4.5" />
          </span>
        ) : null}
        {label}
      </dt>

      <dd
        // `whitespace-pre-line` so a dietitian's line breaks survive; `min-w-0`
        // so a long unbroken value wraps inside the row instead of pushing the
        // label off the screen.
        className={cn(
          'min-w-0 whitespace-pre-line text-sm',
          stacked
            ? /*
                Prose sits on the sunken fill rather than loose under its label.
                An allergy list and a note from the dietitian are the only things
                on this screen that are *written* rather than recorded, and a
                paragraph with nothing around it reads as another table cell that
                happened to run long. The panel is the same nested-surface
                language `Card variant="tile"` speaks — plain radius, no ring, no
                shadow (§Cards).
              */
              'w-full rounded-lg bg-muted px-4 py-3 leading-relaxed text-foreground'
            : 'text-end font-medium',
        )}
      >
        {content}
      </dd>
    </div>
  );
}
