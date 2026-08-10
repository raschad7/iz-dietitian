'use client';

import { Select } from '@base-ui/react/select';
import { useRef, useState } from 'react';

import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { type Locale } from '@/i18n/routing';
import { COUNTRIES, COUNTRY_ORDER, type CountryCode } from '@/lib/phone-countries';
import { countryForDial, joinPhone, splitPhone } from '@/lib/phone-format';
import { cn } from '@/lib/utils';

/**
 * A phone number as a country picker plus the rest of the digits.
 *
 * The two halves are one value. Whichever half changes, the field recombines
 * them and reports a single `+<code><digits>` string — so callers keep dealing
 * in one phone number and nothing downstream has to learn about a second field.
 *
 * Works in both kinds of form this app has. Give it `name` and it writes a
 * hidden input, which is what a `<form action={serverAction}>` submits; give it
 * `onChange` and it reports upward, which is what a controlled dialog wants.
 * Both together is fine.
 *
 * The trigger shows only the dial code — `+962`, never "Jordan" — sized for
 * digits rather than the widest country name in the list. The full name
 * appears once you open the popup, which is the one moment it is worth
 * reading; a closed field showing it would waste most of its own width on
 * text nobody is choosing between. This is a Base UI `Select` rather than the
 * native one `src/components/ui/select.tsx` wraps, precisely because a native
 * `<select>` cannot show different text closed than it lists open — the two
 * are the same string by construction.
 */

export type PhoneFieldProps = {
  id: string;
  /** Submits the combined value under this name. Omit in a controlled form. */
  name?: string;
  locale: Locale;
  /** A stored number in any shape; it is split into the two halves. */
  defaultValue?: string | null;
  /** The combined value, on every keystroke and every country change. */
  onChange?: (phone: string) => void;
  /** Translated. The trigger has no visible label of its own. */
  countryLabel: string;
  disabled?: boolean;
  /**
   * Applied to both halves — a compound field has to carry any styling across
   * the whole row or it reads as two fields that happen to be adjacent.
   */
  className?: string;
};

export function PhoneField({
  id,
  name,
  locale,
  defaultValue,
  onChange,
  countryLabel,
  disabled,
  className,
}: PhoneFieldProps) {
  // Lazily, and only once: this reads whatever shape the number was stored in,
  // and from then on the two halves are what the user is editing.
  const [{ country, national }, setValue] = useState(() => {
    const initial = splitPhone(defaultValue);
    return { country: countryForDial(initial.dial), national: initial.national };
  });

  /**
   * Where the popup portals to, instead of Base UI's own default of
   * `document.body`.
   *
   * Both callers of this field sit inside `Dialog` — a native `<dialog>`
   * opened with `showModal()`, which the browser promotes to the top layer.
   * A plain `document.body` portal is *not* in that layer, so it would paint
   * behind the open dialog no matter its z-index — the popup would "work"
   * and be entirely invisible. Portaling into a node that is itself a
   * descendant of the dialog keeps the popup in the same top-layer subtree.
   * `display: contents` on that node keeps it out of this row's flex layout
   * — it holds no content of its own until the popup opens.
   */
  const portalContainerRef = useRef<HTMLDivElement>(null);

  function update(next: { country: CountryCode; national: string }): void {
    setValue(next);
    onChange?.(joinPhone(COUNTRIES[next.country].dial, next.national));
  }

  return (
    <div className="flex items-center gap-2">
      <div ref={portalContainerRef} className="contents" />
      {/*
        The field the form actually submits. The two visible controls carry no
        `name`, so a server action goes on reading one `phone` value and needs
        no idea this control exists.
      */}
      {name && <input type="hidden" name={name} value={joinPhone(COUNTRIES[country].dial, national)} />}

      <Select.Root
        value={country}
        disabled={disabled}
        onValueChange={(value) => update({ country: value as CountryCode, national })}
      >
        <Select.Trigger
          type="button"
          aria-label={countryLabel}
          dir="ltr"
          /*
            88px rather than 112px, and the padding comes in with it: `ps-4` was
            spacing a label that is never longer than a dial code, and the room
            it took belongs to the digits beside it.

            It is sized to the widest case, not the common one — 23 of the 240
            entries carry a four-digit code (`+1876`), so `+XXXX` plus the 16px
            chevron is what has to fit. Anything narrower reads fine against
            `+962` and clips against Jamaica.
          */
          className={cn(
            'q-field flex h-12 w-22 shrink-0 items-center justify-between gap-0.5 ps-3 pe-2 tabular-nums',
            className,
          )}
        >
          <Select.Value>{(value: CountryCode) => `+${COUNTRIES[value].dial}`}</Select.Value>
          <Select.Icon>
            <Icon name="chevronDown" className="size-4 text-muted-foreground" />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal container={portalContainerRef}>
          {/*
            `align="start"`, not the positioner's centred default.

            The trigger is a 5.5rem dial-code chip and the list is 18rem wide,
            so centring hung roughly 6rem of it off the side of a control it is
            supposed to belong to — and on a narrow window that overhang is what
            decides whether the list appears left or right of the field, which
            is not a decision the pointer can predict. Anchored to the field's
            own inline-start edge it grows in one direction, in both scripts.
          */}
          <Select.Positioner
            sideOffset={4}
            align="start"
            className="z-50"
            alignItemWithTrigger={false}
          >
            <Select.Popup
              className={cn(
                'max-h-72 w-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-elevated',
                'motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200',
              )}
            >
              <Select.List>
                {COUNTRY_ORDER[locale].map((iso) => (
                  // Name first: what someone scans a list of 240 countries by.
                  <Select.Item
                    key={iso}
                    value={iso}
                    className={cn(
                      'flex cursor-default items-center justify-between gap-3 rounded-md px-3 py-2 text-start text-body-md',
                      'data-highlighted:bg-accent data-highlighted:text-accent-foreground',
                    )}
                  >
                    <Select.ItemText className="min-w-0 truncate">{COUNTRIES[iso][locale]}</Select.ItemText>
                    <span className="shrink-0 tabular-nums text-muted-foreground" dir="ltr">
                      +{COUNTRIES[iso].dial}
                    </span>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>

      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        // Digits read left-to-right in Arabic too, as the rest of the app's
        // phone fields already do.
        dir="ltr"
        disabled={disabled}
        className={className}
        value={national}
        onChange={(event) => update({ country, national: event.target.value })}
      />
    </div>
  );
}
