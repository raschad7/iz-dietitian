import type { ReactNode } from 'react';

import { Icon, type IconName } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * A settings surface is a document, not a stack of cards.
 *
 * ## Why the cards went
 *
 * Every group used to be a `Card`: a ring, a shadow, 20px of padding on four
 * sides, a header block and a full-width muted footer band holding one button.
 * On a page that is *nothing but* groups, that framing says nothing — a card's
 * edge exists to separate a surface from things that are not it, and here
 * everything is the same kind of thing. What it did do was cost roughly 90px of
 * chrome per group and force the content into a narrow measure inside its own
 * padding.
 *
 * ## And why there is no rule *between* sections
 *
 * There was one, and it was noise. A section already ends where its last row
 * ends and begins at its own heading; a rule in the gap draws a line between
 * two things that were never in danger of being read as one. Space and a
 * heading separate them, which is how every document does it.
 *
 * The hairlines that remain are all *inside* a section, between its rows, where
 * they genuinely divide peers.
 */
export function SettingsSection({
  title,
  description,
  icon,
  action,
  flush,
  children,
  className,
}: {
  title: string;
  description?: string;
  /** One glyph beside the heading, so a section is findable without reading it. */
  icon?: IconName;
  /** An action belonging to the whole section rather than to one row. */
  action?: ReactNode;
  /**
   * Drops the rules for a child that draws its own frame.
   *
   * The hairlines below exist to divide `SettingsRow`s from each other and from
   * the heading. A section holding a *table* instead has its own header strip
   * and its own row rules, and the section's top border landed directly on that
   * strip's rounded corners — two edges saying the same thing, one of them
   * clipped.
   */
  flush?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    /*
      The block-start margin is the separation, and it collapses to nothing on
      the first section — `first:mt-0` rather than a gap on the parent, so a
      page can put something else between two sections without inheriting a gap
      that belongs to neither.
    */
    <section className={cn('mt-10 flex flex-col gap-1 first:mt-0', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="flex items-center gap-2 font-heading text-heading-sm font-semibold tracking-tight">
            {icon ? <Icon name={icon} className="size-5 shrink-0 text-muted-foreground" /> : null}
            {title}
          </h2>
          {description ? (
            <p className="max-w-2xl text-body-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div
        className={cn(
          'mt-3 flex flex-col',
          !flush && 'divide-y divide-border border-t border-border',
        )}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * One fact, and the control that changes it.
 *
 * Label above, value below, action at the inline-end — the three answer three
 * questions in reading order: what is this, what is it set to, and what can I
 * do about it.
 *
 * ## The type sizes
 *
 * The label was `text-caption`: 12px at weight 400 in the muted colour, which
 * `docs/design-system.md` names as the floor and reserves for timestamps and
 * helper text — *"never for essential information"*. A field's name is the most
 * essential thing in its row. It is `text-label` now (13px/600), which is the
 * step the scale defines for exactly this, and the pairing reads as a label
 * beside a value rather than as a caption someone forgot to promote.
 *
 * **The value is the emphasised line, not the label.** You already know what
 * you came to change; the value is what you are checking. Reversing that — a
 * bold label with the value trailing in grey — is the most common way this row
 * is drawn wrong.
 *
 * ## No `full` escape hatch
 *
 * A value that needs the section's whole inline size is not this row. The
 * working-hours table is the one such value in settings, and it renders
 * directly inside its `SettingsSection` with the Change control in the
 * section's own `action` slot — see `settings-forms.tsx`. Widening this row for
 * it would have made every other row's geometry conditional on a case it does
 * not have.
 */
export function SettingsRow({
  label,
  value,
  description,
  action,
  /**
   * Isolates the value's own script without re-resolving the row.
   *
   * ⚠ This is an **inline** `dir`, never a block one. Putting `dir="ltr"` on
   * the value's container also re-resolves `text-start` against that container,
   * so in Arabic an email flushed to the *left* of a full-width box while its
   * own label sat at the right — the two ends of one row, which is what the
   * account email looked like. Isolating the run instead keeps the value at the
   * inline-start edge under its label and still renders its characters
   * left-to-right. `docs/design-system.md` records the same rule for the
   * register's phone and email columns.
   */
  isolate,
  className,
}: {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  isolate?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4', className)}>
      {/*
        `wrap-anywhere` beside the `min-w-0`, and it takes both.

        `min-w-0` lets this column shrink past its content; it does not make the
        content *break*. Most settings values are a word or two and wrap at their
        spaces anyway — but the ones that matter here are exactly the ones that
        have no spaces to wrap at: an account email, a WhatsApp number, a clinic
        URL. `mohammad.qannam.clinic@verylongdomainname.example.com` measured
        461px inside a 296px row on a 320px phone, ran 165px past the end of it,
        and took the *document* to 474px wide — so the whole settings page
        scrolled sideways because of one address.

        `anywhere` rather than `break-word`: it also lowers the element's
        min-content contribution, which is what lets the flex column agree to be
        narrow in the first place instead of breaking only after it has already
        won the space. It costs nothing where a value fits — it breaks a line
        only where one would otherwise overflow.
      */}
      <div className="flex min-w-0 flex-col gap-1.5 wrap-anywhere">
        <p className="text-label text-muted-foreground">{label}</p>
        <div className="text-body-md text-foreground">
          {isolate ? <span dir="ltr" className="tabular">{value}</span> : value}
        </div>
        {description ? <div className="text-caption text-muted-foreground">{description}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * The stand-in for a value that has never been set.
 *
 * An em dash in muted type, not an empty line: a row with nothing after its
 * label reads as a rendering failure, and "not set" in words reads as a
 * sentence someone has to parse. The dash is the convention and costs one
 * glyph — the label it carries is what a screen reader gets instead.
 */
export function SettingsEmptyValue({ label }: { label: string }) {
  return (
    <span className="text-muted-foreground" aria-label={label}>
      —
    </span>
  );
}
