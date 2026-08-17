'use client';

import { Select } from '@base-ui/react/select';
import { useState } from 'react';

import { useDialogContainer } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
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

/** `٠`, and the Persian `۰` a few keyboards emit instead. */
const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

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
  /**
   * Shown in the digits half only. The country half is a menu with a value in
   * it from the first render, so it has nothing to stand in for — and the
   * digits are the half where "does the dialling code go in here too?" is a
   * real question a label above the pair cannot answer.
   */
  placeholder?: string;
  disabled?: boolean;
  /**
   * Marks the digits half required, so a form using native validation stops on
   * it. The country half always holds a value and has nothing to require.
   */
  required?: boolean;
  /**
   * How many digits the national part may carry. Omitted, the field does not
   * cap it — the country picker means the caller knows the length it expects
   * and this component does not.
   */
  maxDigits?: number;
  /**
   * Applied to both halves — a compound field has to carry any styling across
   * the whole row or it reads as two fields that happen to be adjacent.
   */
  className?: string;
  /** Paints the invalid edge on both halves — see `.q-field[aria-invalid]`. */
  'aria-invalid'?: boolean;
};

export function PhoneField({
  id,
  name,
  locale,
  defaultValue,
  onChange,
  countryLabel,
  placeholder,
  disabled,
  required,
  maxDigits,
  className,
  'aria-invalid': ariaInvalid,
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
   *
   * This used to be a local `display: contents` div held by a ref. It is the
   * shared `useDialogContainer()` now, which is the same element every other
   * popup in the app portals into, and it returns `null` outside a dialog —
   * where Base UI's `document.body` default is correct.
   */
  const container = useDialogContainer();

  function update(next: { country: CountryCode; national: string }): void {
    setValue(next);
    onChange?.(joinPhone(COUNTRIES[next.country].dial, next.national));
  }

  /**
   * What the digits half accepts: digits, and nothing else.
   *
   * The filter is on the way in rather than on the way out. `joinPhone` already
   * strips anything else before the value is submitted, so letters were never
   * *stored* — but they sat in the box looking accepted, and the number that
   * left was quietly not the string that had been typed. Refusing the character
   * at the keystroke is the same rule stated where it can still be seen.
   *
   * Arabic-Indic digits are folded to ASCII rather than dropped: a keyboard set
   * to Arabic emits `٥` for the 5 key, and a field that silently ate every
   * keystroke would read as broken to the person most likely to be using it.
   */
  function toDigits(raw: string): string {
    const digits = [...raw]
      .map((character) => {
        const code = character.codePointAt(0) ?? 0;
        if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
          return String(code - ARABIC_INDIC_ZERO);
        }
        if (code >= EXTENDED_ARABIC_INDIC_ZERO && code <= EXTENDED_ARABIC_INDIC_ZERO + 9) {
          return String(code - EXTENDED_ARABIC_INDIC_ZERO);
        }
        return character;
      })
      .join('')
      .replace(/\D/g, '');

    return maxDigits === undefined ? digits : digits.slice(0, maxDigits);
  }

  return (
    <div className="flex items-center gap-2">
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
          aria-invalid={ariaInvalid || undefined}
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

        <Select.Portal container={container ?? undefined}>
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
            /*
              **Inside a dialog the list has to position itself `fixed`.**
              Being portalled into the dialog also means being a child of it,
              and the dialog scrolls its own overflow — so an absolutely
              positioned popup takes the dialog as its containing block and is
              clipped at the dialog's edge. With 240 countries the list is
              taller than the card that holds it, so it was cut off part-way
              down with no way to reach the rest.

              A fixed popup's containing block is the viewport, so the dialog's
              clip no longer applies and the list is capped by the room the
              positioner actually found. `popover.tsx` and `combobox.tsx`
              already did this; this field and `select.tsx` were the two that
              never got it.
            */
            positionMethod={container ? 'fixed' : undefined}
          >
            <Select.Popup
              className={cn(
                /*
                  `max-h-(--available-height)` rather than a flat `max-h-72`:
                  the positioner reports the space it found, so the list is
                  capped by the viewport instead of by a guess that can still
                  overrun a short window.
                */
                'max-h-(--available-height) w-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-elevated',
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
        placeholder={placeholder}
        /*
          Digits read left-to-right in Arabic too, as the rest of the app's
          phone fields already do — but only once there are digits.

          An empty field is showing a sentence, not a number, and `dir="ltr"`
          laid that Arabic sentence out from the left edge, reading away from
          the field's own reading edge. While the field is empty the direction
          is the *locale's*, so the hint starts on the right in Arabic and on
          the left in English; the first keystroke pins the value back to ltr,
          which is where a phone number belongs.

          Taken from `locale` rather than left to inherit: this control is
          dropped into dialogs and wrappers that lock themselves to `ltr` for
          their own digits, and an inherited direction would follow whichever
          of them happens to be the parent.
        */
        dir={national ? 'ltr' : getLocaleDirection(locale)}
        disabled={disabled}
        required={required}
        maxLength={maxDigits}
        aria-invalid={ariaInvalid || undefined}
        className={className}
        value={national}
        onChange={(event) => update({ country, national: toDigits(event.target.value) })}
      />
    </div>
  );
}
