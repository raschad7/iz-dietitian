import {
  type NavHref,
  type NavLabelKey,
  type NavNode,
  type NavSection,
} from '@/components/layout/sidebar';
import { STAFF_NAV, STAFF_NAV_ICONS } from '@/components/layout/staff-nav';
import { type IconName } from '@/components/ui/icon';

/**
 * One address the palette can send the reader to.
 *
 * `parentLabelKey` is set only for a row whose own label does not stand alone —
 * a child of a category, drawn as `التقويم — أسبوع` so that one word like أسبوع
 * still answers "where does this go". In the rail such a row needs no help,
 * because it sits indented under the row that names it.
 *
 * **Nothing sets it today.** The calendar's three views were the only rows that
 * ever did, and they left the rail for the page's own toolbar; every staff
 * destination is now top-level and names itself. It stays for the next category.
 */
export type PaletteDestination = {
  href: NavHref;
  labelKey: NavLabelKey;
  parentLabelKey?: NavLabelKey;
  icon?: IconName;
};

function walk(nodes: readonly NavNode[], parent?: NavLabelKey): PaletteDestination[] {
  return nodes.flatMap((node) => {
    if (!('children' in node)) {
      return [
        {
          href: node.href,
          labelKey: node.labelKey,
          ...(parent ? { parentLabelKey: parent } : {}),
          icon: STAFF_NAV_ICONS[node.labelKey as keyof typeof STAFF_NAV_ICONS],
        },
      ];
    }

    /*
      A category contributes its children and not itself. التقويم as a palette
      row would be a fourth way to reach a screen three rows already reach, and
      the one it would land on — whichever view `collapsedHref` names — is
      already spelled out as one of those three.
    */
    return walk(node.children, node.labelKey);
  });
}

/**
 * Every screen in the rail, flat, in the order the rail lists them.
 *
 * **Derived, not written.** The rail's own `STAFF_NAV` is the single list, so a
 * destination added to the navigation appears in the palette without anybody
 * remembering to add it, and one removed cannot linger here as a row that
 * navigates somewhere the product no longer has.
 *
 * This is a *different* walk from `flatten` in `sidebar.tsx`, and deliberately.
 * That one answers "what does the 56px icon strip show", where a category folds
 * to a single glyph pointing at one address. This one answers "what can the
 * reader ask for by name", where every destination inside it is separately
 * askable. The staff rail has no category at present, so the two currently
 * agree — they are not the same question, and a category added tomorrow would
 * part them again.
 */
export function paletteDestinations(
  sections: readonly NavSection[] = STAFF_NAV,
): PaletteDestination[] {
  return sections.flatMap((section) => walk(section.children));
}

/**
 * A screen the rail deliberately does **not** carry.
 *
 * `labelPath` is a full message path rather than a `nav` key, because these
 * screens name themselves from their own namespaces — `settingsWorkspace`,
 * `notifications`, `requests` — and none of them has an entry under `nav`. The
 * component resolves it with a root `useTranslations()`.
 */
export type PaletteScreen = {
  href: `/app/settings${'' | `?section=${string}`}` | '/app/notifications' | '/app/requests';
  labelPath: string;
  icon: IconName;
};

/**
 * The screens and settings tabs with no row in the rail, reachable by name.
 *
 * **This is the part of the palette the navigation cannot replace.** Every
 * destination in `paletteDestinations` is already one click away in the column
 * on the left; none of these is there *by design* — see the note at the foot
 * of `STAFF_NAV`, which explains why Requests is reached from the dashboard
 * card that only appears when something is pending, and why settings and the
 * account live behind the profile menu at the rail's foot.
 *
 * A palette is exactly the right home for them: they are places you go
 * occasionally and by name, which is the case a permanent row serves worst and
 * a search field serves best. Nothing here is *only* reachable from the palette
 * — each still has its existing way in.
 */
export const PALETTE_SCREENS = [
  { href: '/app/notifications', labelPath: 'notifications.title', icon: 'notifications' },
  /* `chat`, the glyph the pending-requests card already wears. */
  { href: '/app/requests', labelPath: 'requests.title', icon: 'chat' },

  /*
    Each settings tab as its own row, not one row for the workspace.

    `/app/settings` reads `?section=` and hands it to `SettingsWorkspace` as
    `initialSection`, so these land *inside* the tab rather than on the index
    with the reader still to find it. That is the difference between a palette
    and a link: "واتساب" is a thing a dietitian wants, and it is two clicks deep
    behind a word — الإعدادات — that they have to think of first.

    ⚠ The keys must match `sections` in `app/settings/page.tsx`. A key that does
    not exist there falls back to `profile`, silently, which reads as the row
    going to the wrong place. The icons mirror that file's too, so a tab is the
    same glyph in both lists.
  */
  { href: '/app/settings?section=profile', labelPath: 'settingsWorkspace.tabs.profile', icon: 'profile' },
  { href: '/app/settings?section=clinic', labelPath: 'settingsWorkspace.tabs.clinic', icon: 'contact' },
  { href: '/app/settings?section=whatsapp', labelPath: 'settingsWorkspace.tabs.whatsapp', icon: 'whatsapp' },
  { href: '/app/settings?section=security', labelPath: 'settingsWorkspace.tabs.security', icon: 'security' },
  { href: '/app/settings?section=forms', labelPath: 'settingsWorkspace.tabs.forms', icon: 'forms' },
] as const satisfies readonly PaletteScreen[];
