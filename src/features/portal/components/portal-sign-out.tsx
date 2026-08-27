'use client';

import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { Icon } from '@/components/ui/icon';
import { signOutAction } from '@/features/auth/actions';
import { type Locale } from '@/i18n/routing';

/**
 * Sign-out as a row in the client portal's drawer.
 *
 * A portal-local component rather than a reuse of
 * `@/components/layout/sign-out-button`: that one is styled for the
 * practitioner sidebar (`text-sidebar-foreground`, `hover:bg-sidebar-accent`)
 * and is rendered inside it, so restyling it to fit here would change the
 * dashboard's chrome. The behaviour — a real form posting to the same server
 * action — is deliberately identical; only the surface differs.
 *
 * **Red, in the `destructiveGhost` register.** Red label and glyph at rest,
 * a --red-tint fill on hover, and no box at any point — which is exactly what
 * §Buttons specifies for a destructive action that sits *among* other controls
 * rather than closing a decision, and exactly what the practitioner rail's own
 * sign-out already wears. It is a tint on a label, not a red block: signing out
 * is still an everyday, reversible act, and the row beneath it — deleting an
 * account — is the one that would earn an outlined `destructive`.
 *
 * --red is 6.24:1 on the card and 5.38:1 on its own hover fill, so the pair
 * holds in both states.
 *
 * **Centred, because it is the only thing in its card.** It used to be
 * `text-start` — correct when it was the first of two rows, with the deletion
 * request under it, because a list is read down one edge. That row is gone (see
 * `settings/page.tsx`), and a lone label pinned to the inline-start of an empty
 * surface reads as a list whose remaining rows failed to load. The glyph and
 * the word travel together to the middle; the button still fills the card, so
 * the target is the whole width either way.
 */
export function PortalSignOut({ locale }: { locale: Locale }) {
  return (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <PortalSignOutSubmit />
    </form>
  );
}

function PortalSignOutSubmit() {
  const t = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-3 rounded-md px-2 py-2.5 text-center text-sm font-medium text-destructive transition-colors hover:bg-destructive-subtle disabled:opacity-50"
    >
      {/* The glyph takes the label's colour rather than staying neutral —
          `destructiveGhost` is clay "throughout", and a grey icon beside a clay
          word reads as one of them having been missed. */}
      {/* No `rtl:-scale-x-100` here: `signOut` is on `Icon`'s DIRECTIONAL list
          and mirrors itself, so a second flip would cancel it out. */}
      <Icon name="signOut" className="size-5 shrink-0" />
      {pending ? t('loading') : t('signOut')}
    </button>
  );
}
