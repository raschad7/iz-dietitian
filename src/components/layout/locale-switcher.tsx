'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useTransition } from 'react';

import { Icon } from '@/components/ui/icon';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePathname, useRouter } from '@/i18n/navigation';
import { locales, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Three shapes, one control.
 *
 * `group` is the portal bar's: both locales visible at once, in 40px of width.
 * `dropdown` is the auth screens', where the switcher sits alone in the corner
 * of a wide, otherwise empty page — there is room for the endonyms there, and a
 * page with one card on it should not carry a second segmented control above
 * the one that picks who is signing in. `menu` is the rail account surface's:
 * it returns one compact labelled Select row that works in either the inline
 * drawer or the collapsed-sidebar popup.
 *
 * The rail used to take `group` — a segmented control wedged into a panel of
 * menu rows, the one thing in it that was neither a destination nor an action.
 * As two radio items it is the same choice in the shape everything around it
 * already has, and the check mark says which one is live without a filled chip
 * having to out-shout the row above it.
 */
type LocaleSwitcherProps = {
  className?: string;
  variant?: 'group' | 'dropdown' | 'menu';
  /**
   * Which side of the trigger the `dropdown` list opens on.
   *
   * Down by default, which is right in the corner of an auth screen with the
   * whole page below it. In settings the switcher sits in the last row of the
   * last section, where down is the page's own end — so that instance asks for
   * `top` and the list opens into the space it actually has.
   */
  side?: 'top' | 'bottom';
};

export function LocaleSwitcher({ className, variant = 'group', side = 'bottom' }: LocaleSwitcherProps) {
  const t = useTranslations('localeSwitcher');
  const activeLocale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function switchTo(nextLocale: Locale) {
    if (nextLocale === activeLocale) return;
    startTransition(() => {
      // `pathname` here is locale-agnostic; the router re-adds the prefix.
      router.replace(pathname, { locale: nextLocale });
    });
  }

  if (variant === 'menu') {
    return (
      <LocaleSelect
        className={className}
        activeLocale={activeLocale}
        disabled={isPending}
        label={t('label')}
        name={(locale) => t(`${locale}Name`)}
        onSelect={switchTo}
      />
    );
  }

  if (variant === 'dropdown') {
    return (
      <LocaleDropdown
        className={className}
        activeLocale={activeLocale}
        disabled={isPending}
        side={side}
        onSelect={switchTo}
      />
    );
  }

  return (
    // `h-10` matches the sign-out button beside it in the portal's bar — both
    // are the 40px compact size, and a switcher two thirds that height made the
    // pair read as ragged.
    <div
      className={cn('inline-flex h-10 items-center gap-1 rounded-md border border-border p-1', className)}
      role="group"
      aria-label={t('label')}
    >
      {locales.map((locale) => (
        /*
          The visible label is the ISO code — `AR` / `EN` — because the switcher
          is 40px of a rail's width and two endonyms in two scripts never fit it
          without one of them truncating. The code is the same two characters in
          both locales, so the control stops changing width when the language
          does.

          `aria-label` carries the endonym instead, so a screen reader still
          announces "العربية" rather than spelling out two letters. There is no
          `lang` on the button any more: it was there to give "العربية" the
          Arabic face, and tagging Latin `AR` as Arabic tells a screen reader to
          pronounce it in the wrong language.
        */
        <button
          key={locale}
          type="button"
          disabled={isPending}
          aria-pressed={locale === activeLocale}
          aria-label={t(`${locale}Name`)}
          onClick={() => switchTo(locale)}
          className={cn(
            // `flex-1` only bites when the group is given a width — in the rail
            // it is `w-full`, so the two locales split it evenly.
            'flex h-full flex-1 items-center justify-center rounded-sm px-2.5 text-xs font-medium transition-colors disabled:opacity-50',
            /*
              Neutral, not olive. Olive marks what you can act on, and inside
              the profile menu this chip sat directly above a sign-out and
              below four destinations — the one brand-coloured thing in the
              panel, drawing the eye to the least consequential control in it.
              The selected locale is a *state*, so it takes the ambient
              highlight fill (n-100) and full-strength text: 15.9:1, and no
              claim on the pointer.
            */
            locale === activeLocale
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground',
          )}
        >
          {t(locale)}
        </button>
      ))}
    </div>
  );
}

/**
 * The rail's account menu, as a Select.
 *
 * A `Select`, not the two radio rows this used to be: the account menu already
 * carries a stack of destinations and a sign-out, and a second bare list of
 * choices inside it read as more navigation. Its trigger is the whole menu row
 * — icon, label, current value and chevron — so Language has the same target
 * size and hover response as Settings rather than a small field nested inside
 * a passive row.
 *
 * The parts are composed by hand rather than through `SelectField` for one
 * reason: each endonym carries `lang`, so a screen reader gives "العربية" its
 * Arabic voice and "English" its English one. `SelectField` takes plain string
 * labels and has nowhere to hang that attribute.
 *
 * In the collapsed sidebar, the host menu is `modal={false}` (see
 * `SidebarProfile`) so this Select's popup — portalled to the body, outside the
 * menu — stays live. The same component also sits directly in the inline
 * drawer when the sidebar is expanded.
 */
function LocaleSelect({
  className,
  activeLocale,
  disabled,
  label,
  name,
  onSelect,
}: {
  className?: string;
  activeLocale: Locale;
  disabled: boolean;
  label: string;
  name: (locale: Locale) => string;
  onSelect: (locale: Locale) => void;
}) {
  const labelId = useId();

  return (
    <Select
      value={activeLocale}
      onValueChange={(next) => onSelect(next as Locale)}
      disabled={disabled}
    >
      {/*
        `.q-field` normally draws a form-control edge. This instance is a menu
        row, so its full 48px surface uses the same quiet hover and focus fill
        as the Settings row instead of placing a second outlined control inside
        it.
      */}
      <SelectTrigger
        size="sm"
        aria-labelledby={labelId}
        className={cn(
          'h-12! w-full gap-2.5 rounded-md border-transparent px-3 text-body-sm',
          'hover:bg-sidebar-hover focus:border-transparent focus:bg-sidebar-hover focus:outline-0',
          className,
        )}
      >
        <Icon name="language" className="size-4.5 shrink-0 text-muted-foreground" />
        <span id={labelId} className="truncate text-body-sm">
          {label}
        </span>
        {/*
          A function child rather than a bare `SelectValue`: it lets the
          selected language keep its own `lang`, the same as the rows below.
        */}
        <SelectValue className="ms-auto flex-none text-muted-foreground">
          {(value) => <span lang={value as string}>{name(value as Locale)}</span>}
        </SelectValue>
      </SelectTrigger>

      {/* Anchored to the trigger's own end edge, in both scripts. */}
      <SelectContent align="end">
        {locales.map((locale) => (
          <SelectItem key={locale} value={locale}>
            <span lang={locale}>{name(locale)}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The corner switcher on the auth screens.
 *
 * **This variant shows the endonyms, and so it also carries `lang`.** The rule
 * the `group` variant follows — Latin `AR` must not be tagged as Arabic, or a
 * screen reader pronounces two letters in the wrong language — inverts once the
 * label really is "العربية": untagged, it would be read with an English voice.
 * The rule was never "no `lang`", it was "`lang` has to match the glyphs".
 */
function LocaleDropdown({
  className,
  activeLocale,
  disabled,
  side,
  onSelect,
}: {
  className?: string;
  activeLocale: Locale;
  disabled: boolean;
  side: 'top' | 'bottom';
  onSelect: (locale: Locale) => void;
}) {
  const t = useTranslations('localeSwitcher');
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  /*
   * Escape closes, and so does a pointer anywhere else — the same pair the
   * rail's profile menu uses, and for the same reason: a menu with no way out
   * but its own trigger strands whoever opened it by accident. `pointerdown`
   * rather than `click`, so the menu is gone before what is underneath it acts.
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
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('label')}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-[10px] px-3 text-body-sm font-medium',
          'text-muted-foreground transition-colors duration-(--duration-label) hover:text-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo focus-visible:outline-none',
          'disabled:opacity-50',
          open && 'text-foreground',
        )}
      >
        <span lang={activeLocale}>{t(`${activeLocale}Name`)}</span>
        {/*
          The arrow points where the list will appear, and reverses once it is
          open — two drawn arrows rather than one rotated, which lands a half
          pixel off its own baseline at this size.
        */}
        <Icon
          name={(side === 'top') === !open ? 'chevronUp' : 'chevronDown'}
          className="size-4"
        />
      </button>

      {open ? (
        <ul
          id={menuId}
          role="menu"
          className={cn(
            'absolute end-0 z-20 min-w-40 rounded-md border border-border bg-card p-1 shadow-elevated',
            side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
            'motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200',
          )}
        >
          {locales.map((locale) => (
            <li key={locale}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={locale === activeLocale}
                onClick={() => {
                  onSelect(locale);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-start text-body-sm',
                  'transition-colors duration-(--duration-label) hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:bg-accent focus-visible:outline-none',
                  locale === activeLocale ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                <span lang={locale}>{t(`${locale}Name`)}</span>
                {locale === activeLocale ? <Icon name="check" className="size-4 text-primary" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
