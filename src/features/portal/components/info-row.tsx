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
 * allergy list, a note from the dietitian — drops to the line below under a
 * semibold label, because a paragraph squeezed into the end of a phone row is
 * four words wide; and an empty field takes the chip, on one line, whichever of
 * the two it was declared as.
 *
 * The stacked value used to sit on a sunken fill. It does not any more — the
 * label's weight draws the boundary instead. See the `dt` and `dd` below for
 * why the fill was the wrong tool on a screen of flat cards.
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
          /*
            **Semibold on a stacked row, regular on an inline one**, and the two
            shapes want opposite things here.

            Stacked, the label is a heading over a block of prose and it is now
            the only thing separating one field from the next — the fill that
            used to draw that boundary is gone (see the `dd` below). Weight is
            what replaces it.

            Inline, the label is the quiet half of a pair whose *value* carries
            the emphasis (`font-medium`, at the row's inline-end). Bolding it
            there would put two competing weights on one line and make
            "الاسم الكامل" louder than the name beside it. The contact settings
            screen is six of those rows, so this is not hypothetical.
          */
          /*
            ⚠ **An unrecorded row is the one inline case where the label gives
            way instead of the value.**

            `shrink-0` says the value should wrap inside its own column rather
            than break the label across two lines, and for a *string* that is
            right — a string can wrap. The unrecorded chip cannot: `Badge` is
            `w-fit shrink-0 whitespace-nowrap`, so it is 100px or it is nothing.
            With the label refusing to shrink too, there was no flexible item
            left in the row, and the chip simply ran out of the card — at 320px
            in English, `Medications and supplements` left the `dd` 22px wide
            and pushed the chip 78px past the screen edge, off the side of the
            page with no scrollbar to reach it.

            So when the value is the chip, the label is the half that gives.
            `min-w-0` lets it wrap to the two or three lines a long English
            field name needs at that width, the chip keeps the size it has to
            keep, and the row stays one row.
          */
          stacked ? 'min-w-0 font-semibold' : empty ? 'min-w-0' : 'shrink-0',
        )}
      >
        {icon ? (
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-icon-chip text-icon-chip-foreground"
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
          /*
            The other half of the fix above: `min-w-0` lets a text value shrink
            and wrap, which is what it is for, but the chip has nothing to wrap
            *to*. `shrink-0` makes the column reserve the chip's width so the
            flexbox takes the space out of the label instead of out of the
            chip's own box.
          */
          empty && 'shrink-0',
          stacked
            ? /*
                **Prose sits loose under its label — no fill, no radius, no
                inset.**

                It used to sit on a sunken `bg-muted` panel, on the argument that
                a paragraph with nothing around it reads as a table cell that
                happened to run long. That argument was answered by the screen
                rather than by the panel: the profile page draws every card flat
                (`**:data-[slot=card]:shadow-none`), so a grey slab inside a
                flat white card was the only filled surface on the screen, and
                three of them stacked read as three disabled fields — the same
                mistake the update-request card made when its notice left and it
                became a grey box around one button.

                The label above it now carries the boundary in weight instead,
                which costs no ink. The `gap-y-2` on the row is what keeps the
                two apart; the panel's own `px-4 py-3` went with the fill,
                because padding with nothing behind it is an indent nobody asked
                for and it left the value hanging inside an invisible box.
              */
              'w-full leading-relaxed text-foreground'
            : 'text-end font-medium',
          /*
            **The value starts where the label's text starts, not where the row
            does.**

            The glyph disc owns a gutter at the row's inline-start, so the label
            begins 46px in while a `w-full` value below it began at 0 — the two
            halves of one field starting from two different edges, which on three
            stacked rows reads as the text having slipped out from under its own
            heading. Everything in the row now measures from the same line and
            the disc is the only thing outside it.

            46px is the disc and its gap, and it is written as `ps-11.5` for the
            arithmetic to stay visible: `size-9` is 2.25rem, `gap-2.5` is
            0.625rem, and 11.5 × 0.25rem is their sum. ⚠ Change either and this
            has to change with it — they are three numbers describing one gutter.

            `ps-` is `padding-inline-start`, so the indent is on the right in
            Arabic and the left in English, following the disc. Only applied when
            there *is* a disc: a stacked row without one has no gutter to clear,
            and indenting it would be inventing one.
          */
          stacked && icon ? 'ps-11.5' : '',
        )}
      >
        {content}
      </dd>
    </div>
  );
}
