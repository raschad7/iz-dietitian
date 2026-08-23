'use client';

import { useLocale } from 'next-intl';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { SplashScreen } from '@/features/brand/splash-screen';

/**
 * The launch screen, on demand.
 *
 * A splash is the hardest surface in the app to look at twice: it plays once,
 * on a cold load, behind a session guard, and by the time you have decided
 * something about the third hop it is gone and the only way back is to restart
 * the app. This page replays it from a button.
 *
 * **The sound only works here.** Everywhere else the browser's autoplay policy
 * decides, and on a cold page load it decides no — `splash-sound.ts` documents
 * why, and why it does not fight about it. A click on Replay is a user gesture,
 * so this harness is the one place in the repository where the three blips are
 * guaranteed to be audible. Judge them here; expect silence in a browser tab.
 *
 * **Watch it ten times, not once.** The same rule the dialog-motion harness
 * next door is written around, and it bites harder here: this is the screen a
 * dietitian meets every single time they open the app, and the version that is
 * most charming on the first viewing is reliably the one that grates by the
 * end of the week. If the third hop starts to feel long on the tenth replay,
 * it is long.
 */
export function SplashHarness() {
  /*
    Remount, not a boolean. The whole timeline is CSS animations with delays on
    them, and an element that stays in the tree has already used them up — the
    only way to play them again is for the browser to meet a new element.
  */
  const [take, setTake] = React.useState(0);

  /*
    Read from context here, unlike the root layout's copy which is handed the
    locale as a prop — this harness is a page, so it sits inside
    `NextIntlClientProvider` and can simply ask. Switching the URL between
    `/en/dev/splash` and `/ar/dev/splash` is how the two wordmarks are compared.
  */
  const locale = useLocale();

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="space-y-2">
        <h1 className="font-heading text-heading-lg font-semibold">Splash screen</h1>
        <p className="text-body-md text-muted-foreground">
          Three hops to the middle, the name under the landing, then the tile leaves. It always
          plays out in full.
        </p>
      </div>

      <Button onClick={() => setTake((previous) => previous + 1)}>Replay</Button>

      <p className="text-body-sm text-muted-foreground">Take {take + 1}</p>

      {/*
        `replay` opts out of the once-per-document rule, which for a harness
        built to watch the tile ten times would mean watching it once. This
        mounts `SplashScreen` directly, so it never goes through
        `SplashLaunchGate` and is unaffected by which kind of reload got you
        here — Replay works even on a page the gate stayed quiet for.

        Nothing on take 0: when the gate does send a tile, it is already playing
        on this page's load, and two stacked copies of the same animation is not
        what anyone came here to judge.
      */}
      {take > 0 && <SplashScreen key={take} locale={locale} replay />}
    </main>
  );
}
