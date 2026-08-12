'use client';

import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon, type IconName } from '@/components/ui/icon';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { signOutAction } from '@/features/auth/actions';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

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
  { href: '/app/settings/profile', labelKey: 'settings', icon: 'settings' },
] as const satisfies ReadonlyArray<{
  href: '/app/settings/profile';
  labelKey: 'settings';
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

        {/*
          `modal={false}` because this menu hosts a nested Select (the language
          switcher). A modal menu makes everything outside its own popup inert,
          which would swallow every click on the Select's own popup — it is
          portalled to the body, outside this menu. Non-modal, the two popups
          coexist and the account menu still closes on an outside press.
        */}
        <DropdownMenu modal={false}>
          {/*
            No `tooltip` on this button, unlike the navigation rows above it.
            The tooltip wraps its button in a trigger of its own, and a button
            that is already a menu's trigger cannot also be a tooltip's — the
            hover label wins and the menu never opens. Collapsed, the menu names
            the account at its own head instead.
          */}
          <DropdownMenuTrigger
            render={
              // Collapsed, the button is a 40px square and the disc is 36px, so
              // the default `px-1` left it nothing to sit in. `px-0.5` is the
              // 2px a side that lets the circle read as a circle on the rail.
              <SidebarMenuButton
                size="lg"
                aria-label={name}
                className="group-data-[collapsible=icon]:px-0.5!"
              >
                <AccountAvatar name={name} />
                <ProfileIdentity name={name} email={email} />
                {/*
                  A single up caret: the menu always opens upward now, out of
                  the foot of the rail, so one arrow points where it appears.
                  Hidden while collapsed, where the avatar is the whole control.
                */}
                <Icon
                  name="chevronUp"
                  className="ms-auto size-4 text-sidebar-icon group-data-[collapsible=icon]:hidden"
                />
              </SidebarMenuButton>
            }
          />

          <DropdownMenuContent
            /*
              The menu's own motion, over the registry's 100ms fade.
              `--ease-sweep` is the system's own curve and `--duration-arc`
              (220ms) its standard travel, so the panel rises out of the rail on
              the same timing as every other moving part in the app rather than
              snapping into place. `slide-in-from-bottom-3` gives it enough
              distance for the rise to register as a direction.
            */
            className="min-w-64 rounded-xl p-1.5 shadow-elevated duration-(--duration-arc) ease-(--ease-sweep) data-[side=top]:slide-in-from-bottom-3"
            // Always upward, out of the foot of the rail — the account row sits
            // at the very bottom of the sidebar (and of the phone sheet), so up
            // is the one direction with room.
            side="top"
            align="end"
            sideOffset={10}
          >
            {/*
              The identity again, at the head of the panel. On a phone the
              trigger is behind the sheet that spawned it, and collapsed it is
              an avatar with no name on it — either way the menu has to say
              whose account it is acting on before it offers to sign it out.
            */}
            <div className="flex items-center gap-2.5 px-1.5 py-2">
              <AccountAvatar name={name} />
              <ProfileIdentity name={name} email={email} />
            </div>

            <DropdownMenuSeparator />

            {/*
              `h-9` and `gap-2.5`, against the registry's `py-1`. These are the
              only rows in the panel, read one at a time and clicked rarely; at
              the default density they sat tighter than the account header above
              them and the panel read as a list of settings rather than as a
              menu of places to go.
            */}
            <DropdownMenuGroup>
              {LINKS.map((link) => (
                <DropdownMenuItem
                  key={link.href}
                  className="h-9 gap-2.5 px-2"
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
                className="h-9 gap-2.5 px-2"
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
 * The account's mark: one initial on a solid olive disc.
 *
 * **Deliberately not the generated glyph `Avatar` draws**, and the difference is
 * what each one is for. A DiceBear mark exists to tell a hundred clients apart
 * in a register; there is only ever one signed-in account, so it has nothing to
 * disambiguate. What it does have to do is read as a person at 36px in the
 * corner of a rail — and the glyph, drawn edge to edge on a square viewport,
 * filled the disc corner to corner and came out looking like a square with a
 * circle clipped around it. Worse, its ground was transparent, so the same mark
 * picked up the olive rail behind it in one place and the white menu card in
 * another and read as two different colours.
 *
 * A letter on an opaque ground is what every account menu worth copying uses,
 * for exactly that reason: the glyph is centred and inset, so the *disc* is the
 * shape you see, and the ground is its own colour rather than whatever happens
 * to be behind it. The olive-500 → olive-700 sweep gives it depth at a size too
 * small for anything more; the inset hairline keeps its edge from dissolving
 * into the pale rail.
 *
 * Both the trigger and the menu's head render this one component, so the two
 * can no longer drift apart.
 */
function AccountAvatar({ name, className }: { name: string; className?: string }) {
  /*
   * `Array.from`, not `name[0]` — an Arabic name is multi-byte, and indexing a
   * string by code unit can split a character in half. Upper-casing is a no-op
   * in Arabic and correct in Latin, so it needs no branch on the script.
   */
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '?';

  return (
    <span
      // Decorative: the name it stands for is rendered right beside it in both
      // places this appears, and announcing both says the person twice.
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 select-none items-center justify-center rounded-full',
        'bg-linear-to-br from-[var(--olive-500)] to-[var(--olive-700)]',
        'font-heading text-body-sm font-semibold text-white',
        'ring-1 ring-white/20 ring-inset',
        className,
      )}
    >
      {initial}
    </span>
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
