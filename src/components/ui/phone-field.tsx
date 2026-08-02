'use client';

import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { type Locale } from '@/i18n/routing';
import { COUNTRIES, COUNTRY_ORDER, type CountryCode } from '@/lib/phone-countries';
import { countryForDial, joinPhone, splitPhone } from '@/lib/phone-format';

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
 * A native `<select>`, following `src/components/ui/select.tsx`: 240 countries
 * is exactly the case where the browser's own picker — typeahead, scrolling, a
 * full-screen list on a phone — beats anything hand-built, and it costs no
 * bundle.
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
  /** Translated. The select has no visible label of its own. */
  countryLabel: string;
  disabled?: boolean;
};

export function PhoneField({ id, name, locale, defaultValue, onChange, countryLabel, disabled }: PhoneFieldProps) {
  // Lazily, and only once: this reads whatever shape the number was stored in,
  // and from then on the two halves are what the user is editing.
  const [{ country, national }, setValue] = useState(() => {
    const initial = splitPhone(defaultValue);
    return { country: countryForDial(initial.dial), national: initial.national };
  });

  function update(next: { country: CountryCode; national: string }): void {
    setValue(next);
    onChange?.(joinPhone(COUNTRIES[next.country].dial, next.national));
  }

  return (
    <div className="flex items-center gap-2">
      {/*
        The field the form actually submits. The two visible controls carry no
        `name`, so a server action goes on reading one `phone` value and needs
        no idea this control exists.
      */}
      {name && <input type="hidden" name={name} value={joinPhone(COUNTRIES[country].dial, national)} />}

      <Select
        aria-label={countryLabel}
        value={country}
        disabled={disabled}
        // Bounded, or the widest country name in the list sets the width of the
        // whole row. A native select truncates its own label to fit.
        className="w-32 shrink-0 sm:w-40"
        onChange={(event) => update({ country: event.target.value as CountryCode, national })}
      >
        {COUNTRY_ORDER[locale].map((iso) => (
          // Name first: a native select jumps to the option whose text starts
          // with what you type, and people type "Jordan", not "962".
          <option key={iso} value={iso}>
            {COUNTRIES[iso][locale]} (+{COUNTRIES[iso].dial})
          </option>
        ))}
      </Select>

      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        // Digits read left-to-right in Arabic too, as the rest of the app's
        // phone fields already do.
        dir="ltr"
        disabled={disabled}
        value={national}
        onChange={(event) => update({ country, national: event.target.value })}
      />
    </div>
  );
}
