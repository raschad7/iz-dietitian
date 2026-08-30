'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Avatar } from '@/components/ui/avatar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { Dialog } from '@/components/ui/dialog';
import { useDialogPresence } from '@/components/ui/dialog-motion';
import { Icon, type IconName } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { Kbd } from '@/components/ui/kbd';
import { patientToneStyle } from '@/features/booking/patient-color';
import { normalizeForSearch } from '@/features/clients/search';
import { useGuide } from '@/features/user-guide/guide-context';
import { useIsCoarsePointer } from '@/hooks/use-mobile';
import { usePathname, useRouter } from '@/i18n/navigation';
import { getLocaleDirection, locales, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { listClientsAction, searchClientsAction } from '../actions';
import { PALETTE_SCREENS, paletteDestinations } from '../destinations';
import { type PaletteClient } from '../types';

/**
 * How long the field waits after the last keystroke before asking the server.
 *
 * 180ms is under the ~200ms at which a pause stops reading as "instant" and
 * long enough that typing a five-letter name is one request rather than five.
 */
const SEARCH_DEBOUNCE_MS = 180;

/**
 * An action that needs a subscriber before it can happen.
 *
 * The key is what the palette carries while the picker is open, and the record
 * below turns it back into a label and a destination. A union rather than a
 * free string so a row pushing a page the palette cannot render is a compile
 * error rather than a dead second step.
 */
type ClientActionKey = 'weekly-plan';

/**
 * Where the palette is: its root list, or one action deep waiting for a person.
 *
 * A two-state union rather than a stack of arbitrary depth. Nothing in this app
 * needs three steps, and a stack would invite one — the value of this pattern is
 * that the second step is always the *same* step, a subscriber, so the reader
 * learns it once.
 */
type PalettePage = { kind: 'root' } | { kind: 'client'; action: ClientActionKey };

/**
 * Everything the palette can do, as one keyboard-driven list.
 *
 * ## The order of the groups is the whole design
 *
 * Do → who → where you cannot otherwise get → what you can ask of the app →
 * where you could have clicked anyway.
 *
 * 1. **Actions.** Things that happen here, without going anywhere. The palette
 *    is the only surface in the app that offers them from every screen.
 * 2. **Subscribers.** The register is most of a dietitian's day and a name is
 *    the fastest thing to type. The band appears only once something has been
 *    typed — there is no "recently opened" list, deliberately: it filled the
 *    surface with rows nobody had asked for and pushed the actions down under
 *    a guess about which three people mattered today.
 * 3. **Settings and more.** The three screens the rail deliberately has no row
 *    for — see `PALETTE_SCREENS`. This is the group that justifies the palette
 *    existing at all.
 * 4. **Commands.** Things that act on the app rather than on the data.
 * 5. **Navigation — last, deliberately.** Every row in it is already a click
 *    away in the column on the left. It stays because typing a screen's name is
 *    a legitimate way to reach it and it costs nothing to keep, but it is the
 *    group with the least to offer and it sits where that belongs.
 *
 * ## Why the filtering is ours and not `cmdk`'s
 *
 * `shouldFilter={false}`, and every group is filtered by hand against
 * `normalizeForSearch` — the same Arabic folding the register's search and the
 * `clients.search_name` column use.
 *
 * Two reasons, and either alone would be enough. `cmdk`'s scorer is built for
 * Latin text: it would not match `احمد` against a client stored as `أحمد`,
 * which is the single most common thing a reader will type here. And the
 * subscriber rows have *already* been filtered, by a server that ran the query
 * against the folded column — letting the client re-score them would drop rows
 * it never saw the query for.
 *
 * What `cmdk` is still doing is the part worth having: the roving highlight,
 * the `aria-activedescendant` wiring that lets one input drive a listbox it
 * does not contain, scroll-into-view, and `onSelect`. That is the hard half.
 */
type CommandPaletteProps = {
  locale: Locale;
  open: boolean;
  onClose: () => void;
  /** Opens the client card. Owned by the provider, so it outlives this dialog. */
  onNewClient: () => void;
  /** Opens the dish builder, for the same reason. */
  onNewDish: () => void;
};

export function CommandPalette({
  locale,
  open,
  onClose,
  onNewClient,
  onNewDish,
}: CommandPaletteProps) {
  const t = useTranslations('commandPalette');
  const tNav = useTranslations('nav');
  const tGuide = useTranslations('userGuide');
  const tDishes = useTranslations('dishes');
  /* Rootless, so `PALETTE_SCREENS` can name a key in any namespace. */
  const tAny = useTranslations();

  const router = useRouter();
  const pathname = usePathname();
  const guide = useGuide();

  /* Whether a drag across the list is a finger scrolling. See `Command` below. */
  const coarsePointer = useIsCoarsePointer();

  const [query, setQuery] = useState('');

  /**
   * The second step, when there is one.
   *
   * See `PalettePage`. `root` is every list the palette normally draws; a
   * `client` page replaces all of them with the register and remembers which
   * action asked.
   */
  const [page, setPage] = useState<PalettePage>({ kind: 'root' });

  /**
   * The last completed search, and the query it answers.
   *
   * One piece of state rather than three, and that is what keeps the results
   * honest. `rows` alone would still be on screen while a newer query was in
   * flight — a list of people matching something the reader has already typed
   * past. Holding the query beside them lets both "are these current" and "is
   * something running" be *derived* below rather than maintained by hand, so
   * there is no order of updates in which the two can disagree.
   *
   * **`null` is "nothing loaded for where we are now", and it is load-bearing.**
   * It was `{ q: '', rows: [] }` at rest, which cannot be told apart from a
   * finished request that matched nobody — so opening the picker, whose query
   * *is* the empty string, derived "not searching" and drew no spinner while
   * its list was on the wire. Absent and empty are different answers and the
   * type now says so.
   */
  const [result, setResult] = useState<{ q: string; rows: PaletteClient[] } | null>(null);

  const present = useDialogPresence(open);
  const needle = normalizeForSearch(query);

  const picking = page.kind === 'client';

  /*
   * The picker always wants people; the root only wants them once a name has
   * been typed. That difference is the whole of what the two steps change about
   * loading, which is why it is one boolean rather than two code paths.
   */
  const wantsClients = picking || needle !== '';

  const clients = wantsClients && result?.q === needle ? result.rows : [];
  const searching = wantsClients && result?.q !== needle;

  /*
   * The subscriber search.
   *
   * `seq` is what makes this safe to fire on every keystroke: a slow response
   * for `أح` that lands after a fast one for `أحمد` would otherwise overwrite
   * the newer list with the older one. Each request records the number it was
   * issued as, and a response whose number is no longer the current one is
   * dropped rather than rendered.
   */
  const seq = useRef(0);
  useEffect(() => {
    if (!wantsClients) return;

    const mine = ++seq.current;
    /*
      No wait on the picker's opening list. The debounce exists to collapse a
      burst of keystrokes into one request, and an empty field has had none —
      making the reader wait 180ms to see who they can choose is latency added
      for nothing.
    */
    const timer = window.setTimeout(
      () => {
        const load = needle ? searchClientsAction(locale, query) : listClientsAction(locale);
        void load.then((rows) => {
          if (seq.current === mine) setResult({ q: needle, rows });
        });
      },
      needle ? SEARCH_DEBOUNCE_MS : 0,
    );

    return () => window.clearTimeout(timer);
  }, [locale, needle, query, wantsClients]);

  /** Matches the way the server does: folded on both sides, substring. */
  const matches = useMemo(
    () => (label: string) => !needle || normalizeForSearch(label).includes(needle),
    [needle],
  );

  const destinations = useMemo(() => paletteDestinations(), []);

  /*
   * The other locale — there are two, and "switch language" is a single row
   * naming the one you are not in rather than a submenu of one choice. Written
   * against `locales` so a third would surface here as a type error rather than
   * as a row that silently picks the wrong one.
   */
  const otherLocale = locales.find((candidate) => candidate !== locale);

  /** Close first, then act: the action may open a dialog of its own. */
  function run(action: () => void) {
    onClose();
    action();
  }

  /*
   * Moving between steps clears the field and the rows in the same handler that
   * moves, rather than in an effect watching `page`.
   *
   * Not only to satisfy the lint rule against cascading `setState` — it is also
   * the correct place. Arriving at the picker with the word that summoned it
   * still in the field would search the register for "weekly plan"; going back
   * with the *name* still there would leave the root filtered by a person. And
   * `result` has to go with the query, or the root would briefly draw the
   * picker's list under a heading nobody asked for.
   */
  function goTo(next: PalettePage) {
    setPage(next);
    setQuery('');
    setResult(null);
  }

  /**
   * What each two-step action does once a person has been chosen.
   *
   * Keyed by `ClientActionKey`, so adding a second one is an entry here and a
   * row below — the picker itself never learns what it is picking for.
   */
  const clientActions: Record<ClientActionKey, { label: string; icon: IconName; run: (id: string) => void }> = {
    'weekly-plan': {
      label: t('newWeeklyPlan'),
      icon: 'weeklyPlans',
      /* The planner *is* the new-plan screen for a client — there is no
         separate create route to post to. */
      run: (id) => router.push(`/app/weekly-plans/${id}`),
    },
  };

  if (!present) return null;

  const actions: {
    key: string;
    label: string;
    icon: IconName;
    go: () => void;
    /** Opens the picker instead of doing something. The palette stays open. */
    twoStep?: boolean;
  }[] = [
    { key: 'new-client', label: tNav('newClient'), icon: 'addClient', go: onNewClient },
    /*
      `dishes` rather than a plus-variant of it: lucide has no "utensils plus",
      and the row's own word is already "add". `addClient` keeps its `UserPlus`
      because that glyph exists and is the register's established mark.
    */
    { key: 'new-dish', label: tDishes('addDish'), icon: 'dishes', go: onNewDish },
    /*
      The first two-step row. It does not `run` anything — it opens the picker,
      so the palette stays on screen and the reader's next keystroke is a name.
    */
    {
      key: 'weekly-plan',
      label: clientActions['weekly-plan'].label,
      icon: clientActions['weekly-plan'].icon,
      go: () => goTo({ kind: 'client', action: 'weekly-plan' }),
      twoStep: true,
    },
  ];

  const actionRows = actions.filter((action) => matches(action.label));
  const screens = PALETTE_SCREENS.filter((screen) => matches(tAny(screen.labelPath)));

  const destinationRows = destinations.filter((destination) =>
    matches(
      destination.parentLabelKey
        ? `${tNav(destination.parentLabelKey)} ${tNav(destination.labelKey)}`
        : tNav(destination.labelKey),
    ),
  );

  const guideLabel = tGuide('title');
  const showGuide = guide !== null && matches(guideLabel);

  const languageLabel = otherLocale
    ? t('switchLanguage', { language: t(`language.${otherLocale}`) })
    : '';
  const showLanguage = Boolean(otherLocale) && matches(languageLabel);


  /*
   * On the picker, the only rows that exist are people — so "nothing" there is
   * simply no people, not the root's six-way check. Written as two branches
   * rather than one expression because they are two different questions.
   */
  const nothing = picking
    ? clients.length === 0 && !searching
    : actionRows.length === 0 &&
      clients.length === 0 &&
      screens.length === 0 &&
      destinationRows.length === 0 &&
      !showGuide &&
      !showLanguage;

  return createPortal(
    <Dialog
      open={open}
      onClose={onClose}
      label={t('label')}
      dir={getLocaleDirection(locale)}
      placement="center"
      flat
      /*
        A ceiling rather than a height. The list is short when nothing has been
        typed and long when a common first name has been; a fixed height would
        be a panel of empty rows in the first case. `--q-dialog-max-block` is
        the responsive frame's own hook — see `globals.css`.

        36rem wide and 34rem tall. It was 32×26 and read as a dropdown that had
        escaped its menu: a palette is the surface you work the *whole app*
        from, and at that size a search for a common first name filled it before
        the second group. The extra width also buys the subscriber rows room for
        a disc, a name and a phone number without the number crowding the name.
      */
      className="sm:w-[min(36rem,calc(100vw-2rem))] [--q-dialog-max-block:34rem]"
    >
      <Command
        shouldFilter={false}
        /*
          `loop` makes ArrowDown at the foot of the list return to the top. In a
          list this short, wrapping is what the reader expects — and it means
          the last row is always one key from the first.
        */
        loop
        /*
          On a touch screen, a drag across the list is somebody scrolling — not
          somebody choosing.

          `cmdk` puts `onPointerMove` on every row and selects whatever the
          pointer crosses. That is right for a mouse and wrong for a finger, and
          the cost is not just a moving highlight: changing the selected value
          makes `cmdk` call `.focus()` on its input (it re-points
          `aria-activedescendant`, and the input is what owns it). A programmatic
          focus outside a gesture does not raise the soft keyboard — which is why
          `autoFocus` on open does not — but that same call *inside* the touch
          gesture does. So the keyboard shot up the instant a finger landed on
          the list, over the rows the reader was trying to scroll.

          Off for a finger, on for a mouse: a pointer that hovers has somewhere
          to hover, and a pointer that scrolls does not. Tapping a row is
          unaffected either way — that is `onClick`, which `cmdk` keeps.
        */
        disablePointerSelection={coarsePointer}
        /*
          A **fixed** height, not a ceiling — the one thing that made the old
          surface feel cheap.

          Sized to its content, the dialog grew and shrank on almost every
          keystroke: type a letter and it stretched as matches arrived, type
          another and it snapped shorter as they were filtered away. The rows
          under the caret moved while the reader was aiming at them, and the
          whole panel jittered around its own centre because a centred dialog
          re-centres itself every time its height changes.

          Fixed, the frame is still and only its contents change. The cost is
          empty space below a short list, which is the correct trade: a steady
          surface you can aim at beats a snug one you cannot.

          `100dvh` rather than `vh` for the mobile URL bar, and `-6rem` leaves
          the frame's own block gutter. `--q-dialog-max-block` above stays as
          the frame's independent ceiling.
        */
        className="h-[min(34rem,calc(100dvh-6rem))]"
        /*
          The two ways back out of the picker.

          **Backspace on an empty field** is the convention this pattern
          carries everywhere, and it is the one a reader finds by accident:
          deleting the last character of a name they mistyped should not strand
          them. It fires only when the field is already empty, so it never eats
          a character.

          **Escape** pops one step instead of closing the whole dialog. That
          needs `preventDefault` on the *keydown*: closing on Escape is the
          native `<dialog>`'s default action for this key, so without it the
          browser dismisses the surface underneath us and the reader loses the
          action as well as the step. At the root there is nothing to pop, the
          handler returns, and the native behaviour closes the dialog as usual.
        */
        onKeyDown={(event) => {
          if (page.kind === 'root') return;
          if (event.key !== 'Escape' && !(event.key === 'Backspace' && query === '')) return;

          event.preventDefault();
          goTo({ kind: 'root' });
        }}
      >
        <div className="flex h-14 flex-none items-center gap-3 border-b border-border px-4">
          <Icon name="search" className="size-5 shrink-0 text-muted-foreground" />

          {/*
            The step, named, in the field itself.

            A palette that silently swaps its list for a register is a palette
            that looks broken. The chip is the only thing on screen that says
            *why* the reader is being shown people, and it sits inside the field
            rather than above it because that is where their eyes already are —
            a banner over the input is a line nobody reads while typing.

            It is a `<button>`, not a label: the chip is also the pointer's way
            back out, since Backspace and Escape are keyboard-only affordances
            and a reader who reached the picker by clicking needs one too.
          */}
          {page.kind === 'client' ? (
            <button
              type="button"
              onClick={() => goTo({ kind: 'root' })}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-2 py-1',
                'text-caption text-accent-foreground transition-colors hover:bg-muted',
                'ring-ring outline-hidden focus-visible:ring-2',
              )}
            >
              <RowGlyph name={clientActions[page.action].icon} className="size-3.5" />
              {clientActions[page.action].label}
              <Icon name="close" className="size-3.5" />
            </button>
          ) : null}

          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={picking ? t('pickClient') : t('placeholder')}
            className="text-body-lg"
            /*
              The dialog has just been shown and the field is what the reader
              opened it for. `<dialog>` autofocuses its first focusable child,
              which is this input either way — stating it keeps that true if a
              control is ever added ahead of it.
            */
            autoFocus
          />
          {/*
            A spinner, not the word "Searching…".

            The label sat at the end of the field and changed its width as it
            came and went, which nudged the caret's line every time the reader
            paused. A 16px glyph occupies the same box whether it is spinning or
            absent, and `Spinner` keeps its `role="status"` so the state is still
            announced — the message was only ever redundant to the eye.
          */}
          <span className="flex size-4 shrink-0 items-center justify-center">
            {searching ? <Spinner className="text-muted-foreground" /> : null}
          </span>
        </div>

        <CommandList className="min-h-0 flex-1 p-2">
          {nothing ? <CommandEmpty>{t('empty')}</CommandEmpty> : null}

          {!picking && actionRows.length > 0 ? (
            <CommandGroup heading={t('groupActions')}>
              {actionRows.map((action) => (
                <CommandItem
                  key={action.key}
                  value={`action:${action.key}`}
                  /*
                    A two-step row must NOT go through `run`, which closes the
                    dialog first. It is moving the reader to the next step, not
                    finishing.
                  */
                  onSelect={() => (action.twoStep ? action.go() : run(action.go))}
                >
                  <RowGlyph name={action.icon} />
                  {action.label}
                  {action.twoStep ? (
                    /* Says the row leads somewhere rather than doing something,
                       so the palette staying open is expected rather than a
                       press that did not take. */
                    <Icon
                      name="chevronEnd"
                      className="ms-auto size-4 shrink-0 text-muted-foreground"
                    />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {clients.length > 0 ? (
            <CommandGroup heading={t('groupClients')}>
              {clients.map((client) => (
                <CommandItem
                  key={client.id}
                  value={`client:${client.id}`}
                  onSelect={() =>
                    run(() =>
                      page.kind === 'client'
                        ? clientActions[page.action].run(client.id)
                        : router.push(`/app/clients/${client.id}`),
                    )
                  }
                >
                  {/*
                    The register's own disc, not a grey circle with initials.

                    `.patient-tone` builds the ramp from the one hue
                    `patientToneStyle` sets, and `contents` keeps the wrapper out
                    of the row's flex layout so the span is a scope for the
                    variables and nothing else. The point is that a person is one
                    colour everywhere in this app — this row, their register row
                    and their appointment blocks are the same hue, so a reader
                    who has learned a client by colour does not re-learn them
                    here.
                  */}
                  <span className="patient-tone contents" style={patientToneStyle(client.seq)}>
                    <Avatar name={client.fullName} color="var(--tone-mark)" size="sm" />
                  </span>
                  <span className="truncate">{client.fullName}</span>
                  {client.phone ? <CommandShortcut dir="ltr">{client.phone}</CommandShortcut> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {!picking && screens.length > 0 ? (
            <CommandGroup heading={t('groupSettings')}>
              {screens.map((screen) => (
                <CommandItem
                  key={screen.href}
                  value={`screen:${screen.href}`}
                  onSelect={() => run(() => router.push(screen.href))}
                >
                  <RowGlyph name={screen.icon} />
                  {tAny(screen.labelPath)}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {!picking && (showGuide || showLanguage) ? (
            <CommandGroup heading={t('groupCommands')}>
              {showGuide ? (
                <CommandItem value="cmd:guide" onSelect={() => run(() => guide?.start())}>
                  <RowGlyph name="guide" />
                  {guideLabel}
                </CommandItem>
              ) : null}
              {showLanguage && otherLocale ? (
                <CommandItem
                  value="cmd:language"
                  onSelect={() =>
                    /*
                      `pathname` from `@/i18n/navigation` is locale-agnostic and
                      the router re-adds the prefix — the same move
                      `LocaleSwitcher` makes, so the two cannot disagree about
                      where switching language leaves you.
                    */
                    run(() => router.replace(pathname, { locale: otherLocale }))
                  }
                >
                  <RowGlyph name="language" />
                  {languageLabel}
                </CommandItem>
              ) : null}
            </CommandGroup>
          ) : null}

          {!picking && destinationRows.length > 0 ? (
            <CommandGroup heading={t('groupNavigation')}>
              {destinationRows.map((destination) => (
                <CommandItem
                  key={destination.href}
                  value={`go:${destination.href}`}
                  onSelect={() => run(() => router.push(destination.href))}
                >
                  <RowGlyph name={destination.icon ?? 'calendar'} />
                  <span className="truncate">
                    {destination.parentLabelKey
                      ? `${tNav(destination.parentLabelKey)} — ${tNav(destination.labelKey)}`
                      : tNav(destination.labelKey)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>

        {/*
          The keyboard legend. It is not decoration: the palette is the one
          surface in the app that is faster by keyboard than by pointer, and a
          reader who does not know that arrows and Enter work here will use it
          as a search box and click.

          ↑ and ↓ are two patches, because they are two keys. Printed as `↑↓` in
          one they read as a single glyph nobody has on their keyboard.
        */}
        <div className="flex flex-none items-center gap-5 border-t border-border px-4 py-2.5 text-caption text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Kbd size="sm">↑</Kbd>
            <Kbd size="sm">↓</Kbd>
            {t('hintNavigate')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd size="sm">↵</Kbd>
            {t('hintOpen')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd size="sm">esc</Kbd>
            {picking ? t('hintBack') : t('hintClose')}
          </span>
          {picking ? (
            <span className="flex items-center gap-1.5">
              <Kbd size="sm">⌫</Kbd>
              {t('hintBack')}
            </span>
          ) : null}
        </div>
      </Command>
    </Dialog>,
    document.body,
  );
}

/**
 * A row's leading glyph, at one size and one weight for every group.
 *
 * The rows are scanned down a single 20px column, so a glyph 4px larger in one
 * group than another reads as a mistake rather than as emphasis. Its own
 * component so that column is stated once instead of at every call site.
 */
function RowGlyph({ name, className }: { name: IconName; className?: string }) {
  return <Icon name={name} className={cn('size-5 text-muted-foreground', className)} />;
}
