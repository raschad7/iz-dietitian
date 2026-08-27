'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ExportBillsDialog } from '@/features/billing/components/export-bills-dialog';
import { ClientFilterMenu } from '@/features/clients/components/client-filter';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { type ListClientsInput } from '@/features/clients/schema';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/** How long to let someone keep typing before the register re-queries. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The register's toolbar: search, filter, the archive, new client.
 *
 * **The field searches names.** Nothing else — it used to match phone and email
 * along with them, which made one box mean three things and gave a reader no
 * way to say which. Those are columns you filter on now, in the control beside
 * it (`ClientFilterMenu`), and the field answers the question it is actually
 * used for: which of these people is Ahmad.
 *
 * Typing here re-queries the register live — no Enter, no submit button. The
 * term still round-trips through the URL (`router.replace`, so a keystroke
 * never adds a history entry of its own), which is what keeps a search
 * shareable and is what the page reads to run the query.
 *
 * Every other parameter already in the address bar — sort, direction, the
 * filter — rides along untouched: a search only ever adds or clears `q`.
 *
 * ## The phone gets four icons and a sheet
 *
 * From `sm` up this row is what it has always been: a field taking the width,
 * and three labelled controls at the inline-end giving up only their own.
 *
 * Below `sm` there is not the width for either half. The field alone wanted
 * 256px of a ~271px content column, and the three labelled buttons — "Archived",
 * "Filter", "New client" — wrapped onto a second and third row, so the register
 * opened with three rows of chrome above the first client. So on a phone:
 *
 * - **The labels go and the glyphs stay.** `sr-only sm:not-sr-only` rather than
 *   `hidden sm:inline`, so every control keeps its accessible name — an icon
 *   button with no name is a button that says nothing to a screen reader, which
 *   is a worse trade than the one being made here. Four 48px targets and three
 *   gaps come to 216px and fit one row with room over.
 * - **The field becomes the fourth glyph**, and opens a sheet from the foot of
 *   the screen carrying the field full-width and a Search button under it.
 *   A sheet rather than a field that expands in place because the keyboard is
 *   the real constraint: on a phone it takes half the screen, and a field at the
 *   top of the page ends up with the register hidden behind the keyboard and no
 *   visible way to commit. The sheet sits directly above the keyboard with its
 *   own submit.
 *
 * **The sheet submits rather than searching as you type.** The inline field
 * debounces every keystroke into `router.replace`, which is right when you can
 * see the list changing under it and wrong when a sheet is covering the list —
 * it would re-query the register four times for "Ahmad" and show none of it. One
 * press, one query, sheet closes onto the result.
 *
 * Both are rendered and one is hidden in CSS, the way the rest of this app
 * splits by width: the page is server-rendered, and reading the viewport on the
 * client would flash the wrong toolbar on first paint.
 */
/**
 * Which register this toolbar is standing over.
 *
 * The two screens list the same people and want different things done to
 * them. On the register you reach for the archive and for a new patient; on
 * Bills you reach for the money, and neither of those belongs in that row — an
 * archive toggle on a billing screen swaps the table under a reader who came
 * to export it, and "New patient" is the register's own action, offered there.
 *
 * A prop rather than a pathname read, so the screens are told apart by the one
 * that knows which it is.
 */
export type ClientSearchVariant = 'register' | 'bills';

export function ClientSearch({
  input,
  locale,
  variant = 'register',
}: {
  input: ListClientsInput;
  locale: Locale;
  variant?: ClientSearchVariant;
}) {
  const t = useTranslations('clients');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  /** Which half of the register is on screen — the archive toggle's state. */
  const archived = input.status === 'archived';

  const [q, setQ] = useState(input.q ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /*
    The sheet's own draft, separate from `q`.

    `q` is what the inline field shows and what the debounce is walking toward;
    this is what someone is typing into a sheet that has not been submitted yet.
    Keeping them apart is what lets the sheet be abandoned — dismissed without
    pressing Search — and leave the register exactly as it was.
  */
  const [searchOpen, setSearchOpen] = useState(false);
  const [draft, setDraft] = useState('');

  /*
   * The URL can change from outside this field too — "clear filters", the
   * back button — and the field has to follow it back rather than keep
   * showing a term that no longer matches what's on screen. Adjusted here
   * during render rather than in an effect (React's documented pattern for
   * mirroring a prop into state) so the field never paints the stale value
   * even for one frame.
   */
  const [lastSyncedQ, setLastSyncedQ] = useState(input.q ?? '');
  if ((input.q ?? '') !== lastSyncedQ) {
    setLastSyncedQ(input.q ?? '');
    setQ(input.q ?? '');
  }

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  /**
   * Writes the term to the URL, which is what the page reads to run the query.
   *
   * Shared by the inline field's debounce and the sheet's submit, so the two
   * cannot drift on what a search does to the rest of the address bar.
   */
  function commit(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('q', value);
    else next.delete('q');
    // A new search always starts back at page 1 — page 3 of a differently
    // filtered list is not the page the reader meant.
    next.delete('page');

    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  /**
   * The archive toggle's destination.
   *
   * The archive is a view of this page rather than a page of its own — see the
   * register's own note — so the control adds or removes one parameter and
   * leaves everything else in the address bar exactly where it was: the term
   * you have typed, the filter you have set and the column you are sorted by
   * all survive the switch, which is the point of the two lists sharing a
   * screen.
   *
   * `page` is dropped, because page 3 of the register is not page 3 of the
   * archive.
   */
  function statusHref(next: 'active' | 'archived') {
    const params = new URLSearchParams(searchParams);
    if (next === 'archived') params.set('status', 'archived');
    else params.delete('status');
    params.delete('page');

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function handleChange(value: string) {
    setQ(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commit(value), SEARCH_DEBOUNCE_MS);
  }

  function submitSheet() {
    /*
      Cancel the inline field's pending write before making our own. The two
      fields hold the same parameter, and a debounce armed by an earlier
      keystroke would land *after* this one and put the register back.
    */
    clearTimeout(debounceRef.current);
    setQ(draft);
    commit(draft);
    setSearchOpen(false);
  }

  return (
    // `shrink-0`: this row is chrome the register scrolls under, never something
    // the list squeezes to make room for itself. See the page component.
    <div
      data-guide="clients-search"
      className="flex shrink-0 flex-wrap items-center justify-between gap-3"
    >
      {/*
        The glyph is inside the field's box rather than beside it. `relative` on
        the wrapper and `start-4` on the icon keep it on the reading edge in
        both scripts; `ps-12` is what stops the caret from starting underneath
        it — 20px of field padding, a 20px glyph, then the text.

        Full width below `lg`, back to sharing the row from `lg` up.

        `min-w-64 flex-1` at every width meant the field and the three buttons
        divided one row wherever they both fitted — on a tablet that is 256px of
        field against ~330px of button in a ~672px column, the two groups meeting
        somewhere in the middle with neither reading as having a place. A
        `width: 100%` basis cannot share a flex line, so the field takes the
        first row outright and the buttons take the second, where they have the
        whole width to divide between them.
      */}
      <div className="relative hidden w-full sm:block lg:w-auto lg:min-w-64 lg:flex-1">
        <Icon
          name="search"
          aria-hidden
          className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          name="q"
          type="search"
          value={q}
          onChange={(event) => handleChange(event.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="ps-12"
          lang={locale}
          unclippedText={locale === 'ar'}
          unclippedTextClassName={
            q
              ? 'ps-12 pe-12 text-body-md text-foreground'
              : 'ps-12 pe-12 text-body-sm text-placeholder'
          }
          unclippedTextDirection="rtl"
        />
      </div>

      {/*
        **The three controls divide a row of their own below `lg`**, and go back
        to costing only their own width from `lg` up.

        The order runs from the widest change to the narrowest. Archived swaps
        which register you are reading; Filter narrows the one you are on; New
        client has nothing to do with either and goes last, the only olive
        control in the row. Archived leads because a filter applies to whichever
        register it lands on, so the register comes first and the filter reads as
        qualifying it.

        They were three labelled controls sharing one row with the field, and
        they did not fit anywhere but a desktop. The group was an unwrappable
        `shrink-0` row at one point and "New client" — the single action on the
        screen — was clipped off the side of it; `flex-wrap` fixed the clipping
        by stacking them two and three rows deep, which is a register that opens
        below the fold.

        With the field taking the row above (see the note on it), this row has
        the full width and nothing to negotiate with, so each button takes a
        third of it: `flex-1` here, `lg:flex-none` where the row is shared again.
        Three equal thirds read as one set of three choices, which is what they
        are — where three content-width buttons huddled at the inline-end read as
        whatever was left over after the field.

        On a phone the same three thirds carry glyphs instead of labels; the
        width is the same either way, so nothing about the row changes shape at
        `sm` except what is written inside it.

        `flex-wrap` stays as the guard for a narrower viewport or a larger text
        size.
      */}
      <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:justify-end">
        {/*
          The phone's way in: a search glyph beside the other three, opening the
          field in a sheet from the foot of the screen. Phone only — from `sm`
          the field above is on the row, and a second way in would be a second
          place the same term could live.

          It is the fourth member of this group rather than a bar of its own, so
          the phone's toolbar is one row of four equal quarters: four controls
          that all belong to the register, drawn the same way and reached with
          the same reach. `flex-1` like its neighbours — the row divides evenly
          however many are in it.

          `Sheet` renders nothing of its own and the content is portalled out,
          which is why `sm:hidden` on the trigger does not take the sheet with
          it.
        */}
        <Sheet
          open={searchOpen}
          onOpenChange={(open) => {
            // Opening loads the draft from the term the register is actually
            // filtered by, so the sheet opens on what you can see rather than on
            // whatever was abandoned in it last time.
            if (open) setDraft(q);
            setSearchOpen(open);
          }}
        >
          <SheetTrigger
            render={
              <Button
                type="button"
                variant="neutral"
                /*
                  No label beside the glyph, so the button needs its own
                  accessible name — an icon control with neither is a button that
                  says nothing at all to a screen reader.
                */
                aria-label={t('searchAction')}
                className="flex-1 px-0 sm:hidden"
              />
            }
          >
            <Icon name="search" />
          </SheetTrigger>

          {/*
            Up from the foot of the screen, which is the edge a thumb is nearest
            and the edge the keyboard arrives at. `h-auto` is the sheet's own
            behaviour on this side, so the panel is exactly the field and the
            button tall and the register stays visible above it.
          */}
          <SheetContent
            side="bottom"
            // Pushable back down to the edge it rose from — see `onDismiss`.
            onDismiss={() => setSearchOpen(false)}
            className="gap-0 rounded-t-lg p-4"
          >
            <SheetTitle className="font-heading text-body-md font-semibold">
              {t('searchAction')}
            </SheetTitle>

            {/*
              A real `form`, so the keyboard's own Go/Search key submits it — on a
              phone that is the key under the thumb, and a sheet that can only be
              committed by reaching back up past the keyboard would be worse than
              the field it replaced.
            */}
            <form
              className="mt-3 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                submitSheet();
              }}
            >
              <div className="relative">
                <Icon
                  name="search"
                  aria-hidden
                  className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  // `autoFocus` is right here and wrong almost everywhere else:
                  // the sheet exists for no other purpose, it was opened by a
                  // deliberate press, and without it the reader's next action is
                  // always to tap the one field on screen.
                  autoFocus
                  name="q"
                  type="search"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t('searchPlaceholder')}
                  aria-label={t('searchPlaceholder')}
                  className="ps-12"
                  lang={locale}
                  // The same Arabic treatment the inline field gets — one field
                  // clipping its descenders and the other not would be the kind of
                  // difference nobody can name but everybody sees.
                  unclippedText={locale === 'ar'}
                  unclippedTextClassName={
                    draft
                      ? 'ps-12 pe-12 text-body-md text-foreground'
                      : 'ps-12 pe-12 text-body-sm text-placeholder'
                  }
                  unclippedTextDirection="rtl"
                />
              </div>

              {/*
                `max-w-none` beside the `w-full`, because `Button` carries
                `max-w-80` in its base — a 320px ceiling that exists so a label
                needing two lines gets rewritten instead of wrapping. That is
                right for a button sitting in a row and wrong for the one control
                closing a sheet: the panel is the viewport less its 32px of
                padding, so on any phone wider than 352px the submit stopped
                short of the field above it and read as a button that had failed
                to fill rather than as the sheet's action.
              */}
              <Button type="submit" className="w-full max-w-none">
                <Icon name="search" />
                {t('searchAction')}
              </Button>
            </form>
          </SheetContent>
        </Sheet>

        {/*
          The way into the archive, and the only one.

          It has moved twice. It sat beside the page title until the shared
          header took that row — the date and the bell own the far end of it, and
          a third control crowded in beside them read as chrome rather than as a
          way somewhere. It then spent a release on a row of its own between the
          header and this toolbar, which cost the register a full row of height
          to say one word, and put the control that changes *which* register you
          are reading above the controls that search and filter the one you are
          on.

          Here it is beside the filter, which is the company it keeps: both
          answer "which records am I looking at". The row it used to own is gone
          and the register is that much taller.

          **`neutral` at the default size, which is the filter's own shape.** It
          was `neutralGhost` at `sm` — no box and 40px against its neighbours'
          48px, so it sat visibly short in a row of three and read as a caption
          that happened to be clickable rather than as one of the controls. This
          variant is a light `border-border` hairline on `bg-card`, which is the
          quietest box this system draws and carries no shadow — no button here
          does; the base `cva` sets none and the only mention of one in
          `button.tsx` is the rule that removes it when disabled.

          Still not olive: "New client" beside it is this screen's action, and
          two emphasised labels in one row leave neither of them looking like the
          decision.
        */}
        {/*
          `sr-only sm:not-sr-only` on the label rather than `hidden sm:inline`:
          the word leaves the screen on a phone and stays in the accessible
          name, so the control is still "Archived" to a screen reader and not
          an unnamed glyph. Same pattern on the two beside it and on the filter
          in `ClientFilterMenu`.

          `max-sm:size-12 max-sm:px-0` squares the box off once the label has
          gone — the default size is `h-12 px-5`, which without text is a 48px
          control with 40px of empty padding in it.
        */}
        {/* Bills takes the export in the archive's place: same slot, same
            width, and the one control on that screen acting on every
            subscriber at once rather than on the row under the pointer. */}
        {variant === 'bills' ? (
          <ExportBillsDialog locale={locale} />
        ) : (
        <Link
          href={statusHref(archived ? 'active' : 'archived')}
          /*
            A toggle, not a way somewhere else. It used to link to
            `/app/clients/archived`, which took the reader off the register to a
            second screen listing the same people — and took their search and
            their filter with it. It now swaps which half of the register the
            table below is showing, and pressing it again swaps back.

            `aria-pressed` is what says so to a screen reader: this is one
            control with two states, and the state it is in is the list on
            screen. The state is drawn with `soft` — the quiet olive fill — so
            the toggle looks held down while the archive is up without becoming
            a second solid button beside "New client".
          */
          aria-pressed={archived}
          className={cn(
            buttonVariants({ variant: archived ? 'soft' : 'neutral' }),
            'flex-1 max-sm:px-0 lg:flex-none',
          )}
        >
          <Icon name="archive" />
          <span className="sr-only sm:not-sr-only">{t('archive.title')}</span>
        </Link>
        )}

        <ClientFilterMenu input={input} variant={variant} />

        {/* Opens the client card over the list, matching the empty state's copy
            of this button. */}
        {/* Register only: adding a patient is not what a billing screen is
            for, and the register is one press away. */}
        {variant === 'register' && (
        <ClientFormTrigger
          locale={locale}
          /* The guided tour's "how to add a new client" step points here. */
          data-guide="clients-new"
          className={cn(
            buttonVariants({ variant: 'default' }),
            'flex-1 max-sm:px-0 lg:flex-none',
          )}
        >
          <Icon name="addClient" />
          <span className="sr-only sm:not-sr-only">{t('new')}</span>
        </ClientFormTrigger>
        )}
      </div>
    </div>
  );
}
