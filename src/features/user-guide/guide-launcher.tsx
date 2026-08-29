'use client';

import { useTranslations } from 'next-intl';

import { Icon } from '@/components/ui/icon';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

import { useGuide } from './guide-context';

/**
 * The row that starts the tour, at the foot of the rail's navigation.
 *
 * ## Why it is not one of the nav items
 *
 * The five rows above it are destinations: each is a `Link`, each lights up when
 * you are on it, and the list is documented in `app/layout.tsx` as "the five
 * places a dietitian works". This is a button that does something to the screen
 * you are already on. Adding it to `NAV_ITEMS` would have made that list six
 * things, one of which goes nowhere — and would have put an action in the one
 * list where every entry answers "where am I".
 *
 * So it sits in its own group, directly under the destinations, drawn one step
 * quieter than them — `size="sm"` and `--sidebar-label`, the heading ink — so
 * that the column reads as six places and then a piece of help, rather than as
 * seven equal rows one of which goes nowhere.
 *
 * ## Why it is no longer pinned to the foot
 *
 * It was `mt-auto`, against the account row. Six destinations end about a third
 * of the way down a laptop's rail, so that left ~400px of empty column with one
 * row floating at the bottom of it — a gap that reads as content that failed to
 * load, and an orphan with nothing to belong to. Under the list it belongs to
 * the list's foot, and the empty space collects where empty space is meant to,
 * which is above the account row and below everything.
 *
 * ## Why it renders nothing without a provider
 *
 * `AppShell` is shared with the client portal, and the portal has no tour. The
 * launcher is handed to the shell as a slot by the staff layout only — but a
 * component that would crash if it ever appeared elsewhere is a trap for whoever
 * next reaches for that slot, so it asks instead. See `guide-context.ts`.
 */
export function GuideLauncher() {
  const guide = useGuide();
  const t = useTranslations('userGuide');

  if (guide === null) return null;

  const label = t('title');

  return (
    /*
      No `mt-auto` and no rule. `SidebarGroup`'s own padding is the whole of what
      separates the tour from the destinations above it — a hairline here would
      read as a second section of navigation, and a heading would name a group
      of one.
    */
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            {/*
              `tooltip` for the collapsed rail — which is every width below
              `lg`, phones and tablets included, where this row is a 40px glyph
              and nothing else. The registry hides the tooltip once the rail
              expands, so the name is never announced twice.

              `isActive` while the tour runs. The rail is inert then and cannot
              be pressed, but the row is still visible through the dim on the
              steps that spotlight the navigation, and an unmarked row there
              would leave the reader looking at the control they just used with
              no sign that it is what they are inside of.
            */}
            <SidebarMenuButton
              type="button"
              /* Where focus returns when the tour closes — see `GuideOverlay`. */
              data-guide-launcher=""
              /*
                One step under a destination, in both axes that carry rank here:
                32px instead of 40, and the headings' `--sidebar-label` instead
                of the rows' `--sidebar-icon`. Dressed identically to the six
                links above it, this read as a seventh place to go — the one
                thing in a column of addresses that has no address.
              */
              size="sm"
              className="text-sidebar-label"
              tooltip={label}
              isActive={guide.active}
              onClick={guide.start}
            >
              {/* 20px even at `sm`, because folded this is a glyph in the same
                  56px column as the destinations and has to line up with them. */}
              <Icon name="guide" className="size-5" />
              <span>{label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
