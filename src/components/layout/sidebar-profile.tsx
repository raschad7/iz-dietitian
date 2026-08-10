'use client';

import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon, type IconName } from '@/components/ui/icon';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { signOutAction } from '@/features/auth/actions';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

/**
 * The rail's account control: who you are signed in as, and everything that is
 * about *you* rather than about a client.
 *
 * It replaced a language switcher and a sign-out button sitting bare at the
 * bottom of the rail. Those two were the only shell controls at the time; the
 * moment settings, WhatsApp and security joined them, five permanent controls at
 * the foot of a five-item rail outweighed the navigation above them. Folding
 * them behind one row spends that space on the name and puts the rest one click
 * away, which is the right price for things you touch once a week.
 *
 * ## Why this is a real menu now
 *
 * It used to be a hand-rolled disclosure: a `0fr` → `1fr` grid row that grew
 * *inside* the rail, pushing the trigger down. That works until the rail is
 * 56px wide — collapsed, there is no room to grow into — and it never had what
 * a menu is expected to have: type-ahead, arrow keys, a focus trap, a return of
 * focus to the trigger on close. `DropdownMenu` is the same primitive the row
 * actions and the selects use, so the panel is positioned against the viewport
 * rather than against the rail: it opens to the **inline-end** on desktop, out
 * over the page and away from the sidebar in either script, and upward from the
 * bottom on a phone, where the rail is a sheet and there is no inline-end to
 * open into.
 *
 * Collapsed, the trigger is just the avatar — a person is the one thing in this
 * rail that still identifies itself at 40px without a label.
 *
 * The destinations moved out of the rail proper rather than being copied into
 * it: the same link in two lists is two answers to "where does this live".
 *
 * **Notifications are not among them.** They are a bell beside the date on the
 * dashboard — see `NotificationsBell`. A feed is something you check, and a menu
 * at the foot of a rail is the wrong place to keep something that has to be
 * *noticed*: nobody opens an account menu to find out whether anything has
 * happened. The full page still exists and the bell links to it.
 */

/** Destinations, block-start to block-end. */
const LINKS = [
  { href: '/app/profile', labelKey: 'settings', icon: 'settings' },
  { href: '/app/settings/whatsapp', labelKey: 'whatsapp', icon: 'whatsapp' },
  { href: '/app/settings/security', labelKey: 'security', icon: 'security' },
] as const satisfies ReadonlyArray<{
  href: '/app/profile' | '/app/settings/whatsapp' | '/app/settings/security';
  labelKey: 'settings' | 'whatsapp' | 'security';
  icon: IconName;
}>;

/*
 * `settings` is a gear rather than the person glyph the old rail's Profile item
 * used. It points at the same page, but it is reached from a control that is
 * already a person — name, email and all — and two people stacked read as two
 * different accounts.
 */

export function SidebarProfile({
  name,
  email,
  locale,
  onNavigate,
}: {
  name: string;
  /** Optional only because a session is not obliged to carry one; the row still works. */
  email?: string | null;
  locale: Locale;
  /** Closes a responsive navigation drawer after choosing a destination. */
  onNavigate?: () => void;
}) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const { isMobile } = useSidebar();

  /*
   * Signing out is a POST to a server action, not a client call: the session
   * cookie is httpOnly and cleared server-side. The form lives out here rather
   * than inside the popup because choosing a menu item closes the menu, and a
   * form that unmounts in the same tick as its own submit is a race. The item
   * asks this one — still mounted, outside the portal — to submit itself.
   */
  const signOutRef = useRef<HTMLFormElement>(null);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <form ref={signOutRef} action={signOutAction} className="hidden">
          <input type="hidden" name="locale" value={locale} />
        </form>

        <DropdownMenu>
          {/*
            No `tooltip` on this button, unlike the navigation rows above it.
            The tooltip wraps its button in a trigger of its own, and a button
            that is already a menu's trigger cannot also be a tooltip's — the
            hover label wins and the menu never opens. Collapsed, the menu names
            the account at its own head instead.
          */}
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" aria-label={name}>
                <Avatar
                  name={name}
                  /*
                    Fixed olive-100 rather than the per-client palette in
                    `avatar-color.ts`: this is always the same one account.
                    `text-foreground` overrides the shared component's white,
                    which assumes a dark, per-record colour.
                  */
                  color="var(--olive-100)"
                  size="sm"
                  className="size-8 text-foreground"
                />
                <ProfileIdentity name={name} email={email} />
                {/*
                  Both arrows, stacked: the row opens a menu that goes up on a
                  phone and sideways on a desktop, so a single chevron would be
                  pointing the wrong way half the time. Hidden while collapsed,
                  where the avatar is the whole control.
                */}
                <span className="ms-auto flex flex-col text-sidebar-icon group-data-[collapsible=icon]:hidden">
                  <Icon name="chevronUp" className="size-3" />
                  <Icon name="chevronDown" className="-mt-0.5 size-3" />
                </span>
              </SidebarMenuButton>
            }
          />

          <DropdownMenuContent
            className="min-w-60"
            // Away from the rail in either script on a desktop; upward from the
            // bottom of a phone, where the rail is a sheet with no side to open
            // into.
            side={isMobile ? 'top' : 'inline-end'}
            align="end"
            sideOffset={8}
          >
            {/*
              The identity again, at the head of the panel. On a phone the
              trigger is behind the sheet that spawned it, and collapsed it is
              an avatar with no name on it — either way the menu has to say
              whose account it is acting on before it offers to sign it out.
            */}
            <div className="flex items-center gap-2 px-1.5 py-1.5">
              <Avatar
                name={name}
                color="var(--olive-100)"
                size="sm"
                className="size-8 text-foreground"
              />
              <ProfileIdentity name={name} email={email} />
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              {LINKS.map((link) => (
                <DropdownMenuItem
                  key={link.href}
                  render={<Link href={link.href} onClick={onNavigate} />}
                >
                  <Icon name={link.icon} className="size-4.5 text-muted-foreground" />
                  {t(link.labelKey)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            {/*
              Not a destination — the one row here that changes the page you are
              already on rather than taking you to another, which is why it is
              fenced off from the three above it.
            */}
            <LocaleSwitcher variant="menu" />

            <DropdownMenuSeparator />

            {/*
              Last, and clay. Ending a session is reversible in the sense that
              you can sign back in, but it is the one row that throws away what
              you were doing, so it sits furthest from the ones you meant to
              click.
            */}
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => signOutRef.current?.requestSubmit()}
              >
                <Icon name="signOut" className="size-4.5" />
                {tCommon('signOut')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/**
 * Name over email. `min-w-0` on the stack and `truncate` on both lines is what
 * stops a long address from pushing the avatar off a 256px rail.
 *
 * The email is `dir="ltr"` under an Arabic name: an address is Latin text and a
 * bidi run would otherwise drag its dot-com to the wrong end.
 */
function ProfileIdentity({ name, email }: { name: string; email?: string | null }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col text-start leading-tight group-data-[collapsible=icon]:hidden">
      <span className="truncate text-body-sm font-medium" dir="auto">
        {name}
      </span>
      {email ? (
        <span className="truncate text-caption text-muted-foreground" dir="ltr">
          {email}
        </span>
      ) : null}
    </span>
  );
}
