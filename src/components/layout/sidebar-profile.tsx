'use client';

import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon, type IconName } from '@/components/ui/icon';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
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
 * ## Two widths, two appropriate disclosures
 *
 * At full width, the footer is an inline disclosure: the account row stays
 * anchored at the bottom and its actions unfold above it. The controls remain
 * part of the rail instead of covering the page, and the identity does not need
 * to be repeated a few pixels above itself. The mobile sheet has the same usable
 * width, so it follows this mode too.
 *
 * At 56px there is no useful inline layout to reveal, so the collapsed rail
 * keeps the positioned `DropdownMenu`. Its trigger is just the avatar — a
 * person is the one thing in this rail that still identifies itself at 40px
 * without a label. The popup reuses the same action-surface design as the
 * inline drawer, so changing widths does not introduce a second visual system.
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
  const { state: sidebarState, isMobile, openMobile } = useSidebar();
  const usesInlineDisclosure = isMobile || sidebarState === 'expanded';

  /*
   * Signing out is a POST to a server action, not a client call: the session
   * cookie is httpOnly and cleared server-side. The form lives out here rather
   * than inside the popup because choosing a menu item closes the menu, and a
   * form that unmounts in the same tick as its own submit is a race. The item
   * asks this one — still mounted, outside the portal — to submit itself.
   */
  const signOutRef = useRef<HTMLFormElement>(null);

  if (usesInlineDisclosure) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <form ref={signOutRef} action={signOutAction} className="hidden">
            <input type="hidden" name="locale" value={locale} />
          </form>

          {/*
            The trigger stays first in DOM order, so Tab enters newly revealed
            actions after it. Reversing only the visual column draws the panel
            above the bottom-anchored row without changing that keyboard
            sequence.
          */}
          <Collapsible
            // Remount after dismissing the mobile sheet, so it always reopens
            // with a folded footer. Switching to the icon rail unmounts this
            // whole branch and provides the same reset on desktop.
            key={isMobile ? `mobile-${openMobile ? 'open' : 'closed'}` : 'desktop'}
            className="flex flex-col-reverse gap-2"
          >
            <CollapsibleTrigger
              render={
                <SidebarMenuButton
                  type="button"
                  size="lg"
                  aria-label={name}
                  className="px-3 data-panel-open:bg-sidebar-hover"
                >
                  <AccountAvatar name={name} />
                  <ProfileIdentity name={name} email={email} />
                  <Icon
                    name="chevronUp"
                    className="ms-auto size-4 text-sidebar-icon transition-transform duration-(--duration-arc) ease-(--ease-sweep) group-data-[panel-open]/menu-button:rotate-180 motion-reduce:transition-none"
                  />
                </SidebarMenuButton>
              }
            />

            <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden opacity-100 transition-[height,opacity] duration-(--duration-arc) ease-(--ease-sweep) data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none [&[hidden]:not([hidden='until-found'])]:hidden">
              <div className="flex flex-col gap-1 rounded-md bg-card p-1 text-card-foreground">
                <SidebarMenu>
                  {LINKS.map((link) => (
                    <SidebarMenuItem key={link.href}>
                      <SidebarMenuButton
                        size="lg"
                        className="gap-2.5"
                        render={
                          <Link
                            href={link.href}
                            onClick={onNavigate}
                          />
                        }
                      >
                        <Icon name={link.icon} className="size-4.5" />
                        <span>{t(link.labelKey)}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>

                <LocaleSwitcher variant="menu" />

                <SidebarMenu className="mt-1">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      type="button"
                      size="lg"
                      className="gap-2.5 text-destructive hover:bg-destructive-subtle hover:text-destructive [&_svg]:text-destructive"
                      onClick={() => signOutRef.current?.requestSubmit()}
                    >
                      <Icon name="signOut" className="size-4.5" />
                      <span>{tCommon('signOut')}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

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
            hover label wins and the menu never opens. The trigger's accessible
            name still identifies the account without adding a second identity
            block to the popup.
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
            className="flex min-w-64 flex-col gap-1 rounded-md border border-border bg-card p-1 text-card-foreground shadow-none ring-0 duration-(--duration-arc) ease-(--ease-sweep) data-[side=top]:slide-in-from-bottom-3"
            // Always upward, out of the foot of the collapsed rail, where it
            // has the most available room.
            side="top"
            align="end"
            sideOffset={10}
          >
            {/*
              The popup uses the same 48px row rhythm, padding and hover fill as
              the inline drawer. Only the disclosure mechanism changes at the
              compact width; the action surface does not.
            */}
            <DropdownMenuGroup>
              {LINKS.map((link) => (
                <DropdownMenuItem
                  key={link.href}
                  className="h-12 gap-2.5 px-3 focus:bg-sidebar-hover"
                  render={<Link href={link.href} onClick={onNavigate} />}
                >
                  <Icon name={link.icon} className="size-4.5 text-muted-foreground" />
                  {t(link.labelKey)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>

            <LocaleSwitcher variant="menu" />

            {/*
              Last, and clay. Ending a session is reversible in the sense that
              you can sign back in, but it is the one row that throws away what
              you were doing, so it sits furthest from the ones you meant to
              click.
            */}
            <DropdownMenuGroup className="mt-1">
              <DropdownMenuItem
                variant="destructive"
                className="h-12 gap-2.5 px-3 focus:bg-destructive-subtle"
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
