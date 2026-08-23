'use client';

import { useLocale } from 'next-intl';

import { type Locale } from '@/i18n/routing';

import { TodayEnergyMascot } from '@/features/portal/components/today-energy-mascot';

/** Temporary diagnostic harness — not for keeping. */
export function MascotHarness() {
  const locale = useLocale() as Locale;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center gap-6 p-6">
      {[0, 0.2, 0.4, 0.6, 0.8, 1].map((fraction) => (
        <div
          key={fraction}
          className="flex min-h-[150px] w-full flex-col items-center justify-center gap-3 rounded-[30px] bg-card px-4 py-4"
        >
          <TodayEnergyMascot
            fraction={fraction}
            completed={Math.round(fraction * 5)}
            total={5}
            locale={locale}
            countOnMount
          />
        </div>
      ))}
    </main>
  );
}
