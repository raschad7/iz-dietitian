import { notFound } from 'next/navigation';

import { AppShell } from '@/components/layout/sidebar';
import { STAFF_NAV, STAFF_NAV_ICONS } from '@/components/layout/staff-nav';
import { CommandPaletteProvider } from '@/features/command-palette/components/command-palette-provider';
import { CommandPaletteTrigger } from '@/features/command-palette/components/command-palette-trigger';
import { GuideLauncher } from '@/features/user-guide/guide-launcher';
import { GuideProvider } from '@/features/user-guide/guide-provider';
import { resolveLocale } from '@/i18n/params';

type DevShellPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * The application shell, without a session.
 *
 * The sidebar only appears behind `requireStaffClinic`, so the one surface that
 * every authenticated page depends on could not be looked at without logging in
 * — which is exactly the kind of thing that gets changed and checked by
 * clicking around production. This renders it against the real navigation with
 * a stub user, so its collapsed rail, its tooltips and its behaviour in Arabic
 * can be verified the same way every other component is.
 *
 * Dev-only, like the gallery beside it: 404 in production, no data access and
 * no session guard.
 */
export default async function DevShellPage({ params }: DevShellPageProps) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const locale = await resolveLocale(params);

  return (
    /*
      The guided tour is part of the shell's foot now, so the harness carries it
      for the same reason it carries everything else here: it is the only way to
      look at the rail without a session.

      `routed={false}` because every step names a screen under `/app`, and this
      page is not one: left on, starting the tour would push straight into the
      authenticated area and bounce to sign-in before a single card had been
      looked at. Off, all sixteen steps can be walked here against the harness's
      own rail. Only the navigation is suppressed — the cards, the spotlight and
      the docking are the real ones.

      Anchors that live on the app's own screens are not here, so those steps
      draw centred with their text intact. That is the same fallback a real
      clinic gets when a step points at something its data does not have.
    */
    <GuideProvider routed={false}>
      <CommandPaletteProvider locale={locale}>
        <AppShell
          /* The real navigation, not a copy of it. Both sides of the merge were
             reaching for this: `dev` kept a hand-written list here and called it
             "the staff rail's own list", which is a second list to keep in step
             with the first — exactly the drift a harness exists to catch. */
          items={STAFF_NAV}
          title="Enzyme"
          /* The staff configuration, which is the one that has a brand — without it
             the head falls back to the plain title and the product logo never
             renders, so the harness could not show the thing it exists to show. */
          brand={{ logoUrl: null, name: 'عيادة مهيب' }}
          user={{ name: 'Rani Shweiki', email: 'rani@example.com', locale }}
          icons={STAFF_NAV_ICONS}
          primary={<CommandPaletteTrigger />}
          secondary={<GuideLauncher />}
        >
          {/* `shell-scroll` for the same reason the staff layout carries it: the
              shell is a bounded frame, so a child that does not claim the scroll
              is clipped rather than scrolled. See `globals.css`. */}
          <main data-slot="shell-scroll" className="min-w-0 p-5">
            <h1 className="text-heading-lg font-semibold">Shell</h1>
            <p className="mt-2 text-body-sm text-muted-foreground">
              Collapse the rail with the trigger above this text — it stands on the page, not in the
              rail — or with the rail on its edge. Collapsed, the leaf mark stays and the sections
              flatten to one row per destination, each showing its label as a tooltip. Expanded, إدارة,
              المواعيد and الخطط الغذائية are printed headings with nothing to press; التقويم is the
              one row that still opens. Narrow the window past <code>lg</code> and the rail should
              arrive folded and still open on request. Check all of it against{' '}
              <code>/ar/dev/shell</code>.
            </p>
          </main>
        </AppShell>
      </CommandPaletteProvider>
    </GuideProvider>
  );
}
