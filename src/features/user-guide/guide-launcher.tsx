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
 * So it sits in its own group, separated by the space `mt-auto` leaves rather
 * than by a rule. It is the last thing before the account row, which is the
 * other control down there that is about the app rather than about a patient.
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
      `mt-auto` pushes the group to the bottom of the rail's content area,
      against the account footer. `SidebarContent` is a flex column, so this is
      the whole of what separates the tour from the destinations — no rule, no
      heading. A hairline here would read as a second section of navigation.
    */
    <SidebarGroup className="mt-auto">
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
              tooltip={label}
              isActive={guide.active}
              onClick={guide.start}
            >
              {/* 20px, explicitly — see the note on the nav rows in `sidebar.tsx`. */}
              <Icon name="guide" className="size-5" />
              <span>{label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
