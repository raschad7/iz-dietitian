'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';

import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { SignOutButton } from '@/components/layout/sign-out-button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The rail's account control: who you are signed in as, and everything that is
 * about *you* rather than about a client.
 *
 * It replaced a language switcher and a sign-out button sitting bare at the
 * bottom of the rail. Those two were the only shell controls at the time; the
 * moment settings, notifications, WhatsApp and security joined them, six
 * permanent controls at the foot of a five-item rail outweighed the navigation
 * above them. Folding them behind one row spends that space on the name and
 * puts the rest one click away, which is the right price for things you touch
 * once a week.
 *
 * **It opens upward.** The panel is rendered *before* the trigger in the DOM,
 * so growing it pushes the trigger down onto its own stack rather than out of
 * the viewport — the rail's block-end is the floor, and a menu at the floor has
 * nowhere to go but up. That also keeps the trigger's position stable relative
 * to the pointer that just clicked it.
 *
 * The four destinations moved out of the rail proper rather than being copied
 * into it: the same link in two lists is two answers to "where does this live".
 */

/** Destinations, block-start to block-end. */
const LINKS = [
  { href: '/app/profile', labelKey: 'settings', icon: 'settings' },
  { href: '/app/notifications', labelKey: 'notifications', icon: 'notifications' },
  { href: '/app/settings/whatsapp', labelKey: 'whatsapp', icon: 'whatsapp' },
  { href: '/app/settings/security', labelKey: 'security', icon: 'security' },
] as const satisfies ReadonlyArray<{
  href: '/app/profile' | '/app/notifications' | '/app/settings/whatsapp' | '/app/settings/security';
  labelKey: 'settings' | 'notifications' | 'whatsapp' | 'security';
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
}: {
  name: string;
  /** Optional only because a session is not obliged to carry one; the row still works. */
  email?: string | null;
  locale: Locale;
}) {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  /*
   * Escape closes, and so does a click anywhere else. Neither is optional for a
   * menu that covers the thing it opened from: without them the only way out is
   * to find the trigger again, which is exactly what someone who opened it by
   * accident cannot do.
   *
   * `pointerdown` rather than `click`, so the menu is gone before whatever was
   * clicked underneath it acts.
   */
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="mt-auto border-t border-sidebar-border p-3">
      {/*
        `0fr` → `1fr` on a grid row animates to a height nobody has measured.
        The panel stays mounted so the locale switcher and the sign-out form
        keep their state; `inert` takes it out of the tab order while closed,
        which `display: none` would do at the cost of the animation.
      */}
      <div
        id={panelId}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div inert={!open} className="overflow-hidden">
          <ul className="flex flex-col gap-1 pb-2">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  // Client-side navigation keeps this component mounted, so an
                  // open menu would survive the page it just left.
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-start text-body-sm',
                    'transition-colors duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
                    'hover:bg-sidebar-hover',
                    'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
                  )}
                >
                  <Icon name={link.icon} className="size-4.5 text-sidebar-icon" />
                  <span className="min-w-0 truncate">{t(link.labelKey)}</span>
                </Link>
              </li>
            ))}

            {/*
              The two controls that are not destinations, fenced off from the
              four that are. Language is reversible and sign-out is not, so
              sign-out sits last — nearest the trigger, which is the one place
              in this list a mis-aimed click is most likely to land.
            */}
            <li className="mt-1 flex flex-col gap-2 border-t border-sidebar-border pt-3">
              <LocaleSwitcher className="w-full" />
              <SignOutButton locale={locale} className="w-full" />
            </li>
          </ul>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-start',
          'transition-colors duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
          'hover:bg-sidebar-hover',
          'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
          open && 'bg-sidebar-hover',
        )}
      >
        {/*
          Name over email, and nothing else — no avatar, no role chip. This row
          answers "who am I signed in as", which two lines of text answer
          completely; a coloured initial beside them would be decoration on the
          one control in the rail that has no destination of its own.

          `min-w-0` on the stack and `truncate` on both lines is what stops a
          long address from pushing the chevron off the rail.
        */}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body-sm font-medium" dir="auto">
            {name}
          </span>
          {email ? (
            <span className="truncate text-caption text-muted-foreground" dir="ltr">
              {email}
            </span>
          ) : null}
        </span>

        {/*
          Down when there is more to see, up when there is not — the glyph
          points at what the click will do. It swaps rather than rotating: these
          are two drawn arrows in the icon set, and a rotated one lands a half
          pixel off its own baseline at this size.

          `aria-expanded` on the button is what actually announces the state;
          this is the sighted half of the same fact.
        */}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} className="size-4 text-sidebar-icon" />
      </button>
    </div>
  );
}
