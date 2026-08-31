'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';

import { Icon } from '@/components/ui/icon';
import { Kbd } from '@/components/ui/kbd';
import { useIsCompact } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

import { useCommandPalette } from './command-palette-provider';

/**
 * The rail's search control.
 *
 * ## What it replaced, and why
 *
 * A solid green "New client" button stood here. It was the only filled thing in
 * the rail and it was carrying that emphasis badly: a white label on
 * `--primary` measures about 1.95:1, the weakest pairing in the app by some
 * distance (see the note on `--primary-foreground-white` in `globals.css`), and
 * the shape — full width, 40px tall, `rounded-md`, glyph in the rows' own 12px
 * column — was the shape of a navigation row. It read as a menu item that had
 * been highlighted rather than as an action.
 *
 * ## One word, and only one
 *
 * It said "Search or command" once, which was a sentence where a label
 * belonged, and then nothing at all, which left a bordered box holding a
 * magnifier and two grey keys — legible, but reading as a control somebody had
 * forgotten to finish. One verb is the balance: enough that the box is
 * obviously *about* something, not so much that it reads as the placeholder of
 * a text input it is not.
 *
 * **The visible word is also the accessible name**, rather than a fuller
 * `aria-label` sitting behind a shorter label. A voice-control user says what
 * they see, so a name that does not contain the visible text is a control they
 * cannot ask for (WCAG 2.5.3). The longer description lives where there is room
 * for it: the field's own placeholder, once the dialog is open.
 *
 * ## Folded
 *
 * The word and the chord collapse with `.q-rail-collapse`, and the box narrows
 * to a 40px square with the glyph in the strip's one column.
 *
 * ⚠ **The glyph is placed by padding, never by centring.** `justify-center` in
 * the folded state is what made the magnifier jump: the switch to centring is
 * instant, so the glyph reached its folded position in a single frame while
 * every destination glyph beneath it was still gliding the same two pixels over
 * `--duration-fold`. One icon landing early in a column of icons still moving
 * is exactly the twitch it looked like. Held against the start edge instead,
 * its only movement is the padding's, on their clock — see the rule for
 * `[data-slot='rail-search']` in `globals.css`.
 *
 * ⚠ **The border is why the padding is 11 and 9 rather than 12 and 10.** Every
 * other row in the folded strip is a borderless box, so its glyph stands at the
 * row's padding exactly. This one's border is already a pixel of that offset —
 * `box-sizing` is `border-box` throughout — so its padding is a pixel under
 * theirs at both ends, and the ink lines up in both states instead of the
 * search glyph sitting a pixel inside a column of five.
 */
export function CommandPaletteTrigger() {
  const t = useTranslations('commandPalette');
  const palette = useCommandPalette();
  const label = t('trigger');

  if (palette === null) return null;

  return (
    <button
      type="button"
      onClick={palette.open}
      /*
        Named for the folded rail, where the word is clipped to nothing. Kept
        identical to the visible label so the two never disagree — see above.
      */
      aria-label={label}
      aria-keyshortcuts="Meta+K Control+K"
      /*
        Named so the fold can reach it. Width and padding are transitioned from
        `globals.css`, beside the destination rows' own, because both are the
        same event — the column closing — and written together is the only way
        they stay on one clock. `transition-colors` is deliberately *not* here:
        it would be overridden by that rule and read as if it still applied.
      */
      data-slot="rail-search"
      className={cn(
        'flex h-10 w-full items-center rounded-md border border-border bg-background',
        /*
          ⚠ **`text-start`, because a `<button>` centres its text.** That is the
          user agent's own rule and nothing this file set, and it is why the
          word sat marooned in the middle of the box with a void on either side
          rather than beside the glyph it belongs to. The destination rows carry
          the same class for the same reason. `start` and not `left`, so the
          Arabic rail reads from its own edge without a second rule.
        */
        'text-start text-muted-foreground',
        'hover:border-input hover:text-foreground',
        'ring-sidebar-ring outline-hidden focus-visible:ring-2',
        /*
          The glyph's column, in both states: a pixel under the rows' own `px-3`
          and `px-2.5`, because the border makes up the difference. See the note
          on the border above.
        */
        'px-[11px] group-data-[collapsible=icon]:w-10',
        'group-data-[collapsible=icon]:px-[9px]',
      )}
    >
      <Icon name="search" className="size-5 shrink-0" />

      {/*
        The word and the chord narrow to nothing rather than being dropped —
        `.q-rail-collapse` in `globals.css`, the same track the wordmark in the
        rail's head uses, so the two things at the top of the column fold on one
        clock.

        `flex-1 min-w-0` because the track is a grid whose column is `1fr` but
        whose *container* is a flex item: left at its default `flex: 0 1 auto`
        it sizes to its own content, and the chord ends up floating mid-control
        instead of sitting at its end. Folded, the same `min-w-0` lets the track
        shrink to nothing, which is all the 40px square has left to give it once
        the glyph has taken its twenty.

        The 12px gap is `ms-3` **inside** the track rather than the button's own
        `gap-3`: a gap outside it survives the fold as 12px of nothing beside
        the glyph, which is a glyph pushed clean off the folded strip's column.
      */}
      <span className="q-rail-collapse min-w-0 flex-1">
        <span>
          <span className="ms-3 flex items-center gap-2">
            {/*
              The word takes the slack, which is what puts the chord at the
              control's end. A margin on the `Kbd` cannot do it: that element
              sets `dir="ltr"` so the chord does not reorder in Arabic, and
              `margin-inline-start` resolves against an element's *own*
              direction — `ms-auto` there is `margin-left`, which in an RTL row
              pushes it back toward the start. Growing the label is
              direction-agnostic.
            */}
            <span className="min-w-0 flex-1 truncate text-body-sm">{label}</span>
            <Shortcut />
          </span>
        </span>
      </span>
    </button>
  );
}

/**
 * Nothing ever changes, so nothing ever needs to be told.
 *
 * `useSyncExternalStore` wants a subscribe function; the platform a browser is
 * running on is fixed for the life of the page. Hoisted to module scope so its
 * identity is stable across renders — an inline arrow would re-subscribe on
 * every one.
 */
const subscribeToNothing = () => () => {};

const readPlatform = () =>
  /mac|iphone|ipad|ipod/i.test(window.navigator.platform || window.navigator.userAgent)
    ? 'mac'
    : 'other';

/** The server has no `navigator`, and says so rather than guessing. */
const readPlatformOnServer = () => 'unknown' as const;

/**
 * `⌘K` or `Ctrl K`, whichever this machine uses.
 *
 * **The server cannot know, and must not guess.** Which chord the reader has
 * depends on `navigator`, so rendering it during the server pass would make the
 * server's markup and the browser's first render disagree and React would throw
 * a hydration mismatch for the sake of two characters.
 *
 * `useSyncExternalStore` is the shape that expresses this exactly: the server
 * snapshot is `unknown`, hydration renders that same `unknown` so the two
 * agree, and the browser's real answer arrives on the render immediately after.
 * An effect that set state on mount would do the same thing a frame later and
 * cost a cascading render to do it.
 *
 * The gap it leaves for that first frame is at the end of a control nobody is
 * looking at yet, and the button is fully usable without it. The shortcut is
 * also announced by `aria-keyshortcuts` on the button itself, which does not
 * depend on this rendering at all.
 *
 * ## Not on a phone or a tablet
 *
 * A chord is an instruction, and printing one for a key the reader has not got
 * is an instruction they cannot follow — on the narrowest control in the app,
 * where the space it takes is the space the label wanted. So the whole thing
 * stands down on a touch device, and the rail's search control there is a
 * glyph, a word, and nothing else.
 *
 * **The band is `useIsCompact`** — the same one the rail itself folds on, so
 * the chord disappears with the face it belongs to rather than on a line of its
 * own. It asks both dimensions, which is what it takes to name a tablet: under
 * `64rem` wide catches every phone and a tablet held upright, and the second
 * clause catches the same tablet turned on its side, where it is 1024–1366px
 * wide and would otherwise read as a desktop. A short desktop window is not
 * caught by either, because that clause also asks for a finger.
 *
 * `aria-keyshortcuts` on the button stays either way. It describes what the
 * control *supports*, which does not change with the pointer in the reader's
 * hand — and a screen reader user on a tablet may well have a keyboard.
 */
function Shortcut() {
  const platform = useSyncExternalStore(subscribeToNothing, readPlatform, readPlatformOnServer);
  const compact = useIsCompact();

  if (platform === 'unknown') return null;
  if (compact) return null;

  /*
    `⌘K` as one key, `Ctrl` + `K` as two.

    The Mac chord is a single glyph and a letter and reads as one token; the
    Windows one is a modifier *and* a key, and printing "Ctrl K" inside a single
    patch made a wide grey slab at the end of a 40px control. Two small patches
    with a hairline between them say the same thing in less ink.
  */
  if (platform === 'mac') return <Kbd size="sm">⌘K</Kbd>;

  return (
    <span className="flex items-center gap-0.5">
      <Kbd size="sm">Ctrl</Kbd>
      <Kbd size="sm">K</Kbd>
    </span>
  );
}
