'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import type { CatalogEntry } from '../queries';
import { PLANNER_THEME } from '../theme';
import type { RecentUse } from '../usage';

import { DishCatalog } from './dish-catalog';

/**
 * A non-modal catalog: the board remains a live drop surface while a dish is
 * lifted. It is pinned to the physical left by choosing the matching logical
 * edge for the current document direction, so the component keeps the app's
 * RTL contract without a physical inset utility.
 */
export function DishCatalogDrawer({
  open,
  onOpenChange,
  catalog,
  usage,
  slot,
  editable,
  locale,
  onCreateWeek,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: readonly CatalogEntry[];
  usage: Record<string, RecentUse>;
  slot: { slotKey: string; budgetKcal: number } | null;
  editable: boolean;
  locale: Locale;
  /**
   * Given, this client has no plan yet — so the catalog is a list of things
   * with nowhere to go, and the panel says so over a blurred copy of it and
   * offers the week that would fix it. Absent, the catalog behaves normally.
   */
  onCreateWeek?: () => void;
}) {
  const t = useTranslations('weeklyPlans');
  const direction = getLocaleDirection(locale);

  return (
    <Sheet
      open={open}
      modal={false}
      disablePointerDismissal
      onOpenChange={(nextOpen) => onOpenChange(nextOpen)}
    >
      <SheetContent
        dir={direction}
        side={direction === 'rtl' ? 'inline-end' : 'inline-start'}
        showOverlay={false}
        showCloseButton={false}
        /*
          The width, prefixed with the same variant the sheet states its own in.

          A bare `w-[min(28rem,…)] sm:max-w-none` looked like it was overriding
          the sheet and was not: the base sizes itself as
          `data-[side=inline-end]:w-3/4` and `data-[side=inline-end]:sm:max-w-sm`,
          and tailwind-merge only collapses two classes when their variants
          match as well as their property. Different variant, no collapse — so
          both survived into the class list and the sheet's own rule, later in
          the stylesheet, won. The catalog asked for 28rem and got three
          quarters of a phone or 24rem of a desktop, which is a column of
          truncated dish names.

          Both sides are spelled out because the side is chosen at runtime from
          the document direction, and a class Tailwind never sees in the source
          is a class that is never generated.
        */
        className={cn(
          PLANNER_THEME,
          'data-[side=inline-start]:w-[min(28rem,calc(100vw-0.75rem))] data-[side=inline-end]:w-[min(28rem,calc(100vw-0.75rem))]',
          'data-[side=inline-start]:sm:max-w-none data-[side=inline-end]:sm:max-w-none',
        )}
      >
        {/*
          One line, and the hint is not on it.

          This header was 84px of a panel whose whole job is a list: a 40px
          badge, a 24px title and a two-line sentence about dragging, above a
          search field and a filter row — four bands of chrome before the first
          dish. The badge said "dishes" to a panel already titled "dish
          catalog", and the sentence taught a gesture that teaches itself the
          first time a card is picked up, then went on repeating itself forever.

          What is left is a title and a close button on one 52px row. The hint
          stays in the accessible description, where the dialog announces it
          once on open and never takes a pixel for it.
        */}
        <header className="flex h-13 shrink-0 items-center gap-2 border-b border-border bg-muted/45 px-4">
            <Icon name="dishes" className="size-5 shrink-0 text-primary" />
            <SheetTitle className="min-w-0 flex-1 truncate font-heading text-heading-sm font-medium">
              {t('dishCatalog')}
            </SheetTitle>
            <SheetDescription className="sr-only">{t('dishCatalogHint')}</SheetDescription>
            <SheetClose
              render={<Button type="button" variant="neutralGhost" size="icon-sm" />}
              aria-label={t('close')}
            >
              <Icon name="close" />
            </SheetClose>
        </header>

        {/*
          ── With no plan, the list is behind glass ──

          The dishes are still drawn, blurred and unreachable, rather than
          replaced by an empty state. Which sounds like decoration and is not:
          this drawer opens from a screen that has nothing on it, and a dietitian
          pressing "dishes" there is asking *what is in the catalog* as often as
          they are trying to place something. An empty state answers neither
          question and reads as "there are no dishes" — which is the opposite of
          true, and exactly the wrong thing to tell someone deciding whether this
          product has their food in it. The blur says: all of this is here, and
          one thing is missing before you can use it.

          `pointer-events-none` and `aria-hidden` on the veiled copy, so it is
          out of reach of the mouse, the keyboard and the screen reader alike —
          a blurred list you can still tab into is a trap. The panel over it is
          the only thing in the region that answers.
        */}
        <div className="relative min-h-0 flex-1 px-4 pb-4 pt-3">
          <div
            aria-hidden={onCreateWeek ? true : undefined}
            className={cn(
              'h-full',
              onCreateWeek && 'pointer-events-none select-none blur-[3px] saturate-50',
            )}
          >
            <DishCatalog catalog={catalog} usage={usage} slot={slot} editable={editable} />
          </div>

          {onCreateWeek && <NeedsPlan onCreateWeek={onCreateWeek} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Why the catalog cannot be used yet, and the one control that changes it.
 *
 * Centred over the blurred list rather than pinned to the top of it: the panel
 * is the only thing in this region that can be acted on, so it goes where the
 * eye lands, and the veiled list stays legible as *context* above and below it.
 *
 * `bg-card` and a real shadow — not a translucent scrim. A frosted panel over a
 * blurred list is two blurs stacked, and the words come out of it soft.
 */
function NeedsPlan({ onCreateWeek }: { onCreateWeek: () => void }) {
  const t = useTranslations('weeklyPlans');

  return (
    <div className="absolute inset-0 grid place-items-center px-6">
      <div className="max-w-72 rounded-lg border border-border bg-card p-5 text-center shadow-overlay">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-primary-subtle text-primary">
          <Icon name="weeklyPlans" className="size-5" />
        </span>

        <h3 className="mt-3 font-heading text-heading-sm font-medium">{t('catalogNeedsPlan')}</h3>
        <p className="mt-1.5 text-body-sm leading-relaxed text-muted-foreground">
          {t('catalogNeedsPlanHint')}
        </p>

        <Button type="button" size="sm" className="mt-4 w-full max-w-none" onClick={onCreateWeek}>
          <Icon name="add" />
          {t('createWeek')}
        </Button>
      </div>
    </div>
  );
}
