'use client';

import * as React from 'react';

import { Field, FieldError, FieldHint } from '@/components/ui/field';
import { Icon, type IconName } from '@/components/ui/icon';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * A labelled box that holds a number, at the system's field height and radius.
 *
 * ## Why this is shared and not a helper inside one form
 *
 * It was one: `NumberField` inside `intake-form.tsx`. The measurements dialog
 * then needed the same control and reached for a bare `InputGroup` instead —
 * which is the *upstream shadcn* component, 32px tall with `rounded-lg` and the
 * brand focus ring. Beside a 48px field with the 10px control radius and a
 * green edge, it read as a different application. A generic labelled field is
 * exactly what the design system says must not be rebuilt per feature, so the
 * one that was already right moved here.
 *
 * ## The unit is not in the box
 *
 * `unit` is drawn into the **label**, quieter than the name beside it — never
 * as an addon inside the control. A box holding a number and its own unit reads
 * as a composite control and invites the unit to be typed into it; the digits
 * get the box to themselves.
 *
 * It also disambiguates for free. Two of the measurement form's figures are
 * both called "body water" — one in kilograms, one as a percentage — and with
 * the unit inside the box the form showed the same label twice with no way to
 * tell which was which.
 *
 * ## `mode`
 *
 * `number` is a native number input: the intake's four required fields, where
 * the browser's own stepping and keypad are worth having.
 *
 * `text` is a text input with a decimal keypad, and the measurements form needs
 * it. A number input **silently discards** a value the browser considers
 * malformed, so a mistyped figure comes back as an empty box with no
 * explanation — and on a form whose contract is that an empty box means "not
 * measured", a discarded typo is filed as a reading nobody took. Text hands the
 * string to the schema, which says what is wrong with it.
 */
export function NumberField({
  name,
  label,
  unit,
  icon,
  mode = 'number',
  min,
  max,
  step,
  value,
  onChange,
  defaultValue,
  placeholder,
  required,
  maxDigits,
  error,
  hint,
  inputKey,
  id = name,
}: {
  name: string;
  label: string;
  /** kg, cm, %. Drawn into the label, never inside the control — see above. */
  unit?: string;
  /**
   * A glyph at the group's inline-start, on the reading edge.
   *
   * Decorative: the `Label` above names the field, and a ruler announced beside
   * "Height" says it twice. It is there to tell boxes of digits apart at a
   * glance in a panel where that is all they are.
   */
  icon?: IconName;
  /** See the note above. */
  mode?: 'number' | 'text';
  min?: number;
  max?: number;
  step?: number;
  value?: string;
  onChange?: (next: string) => void;
  defaultValue?: string;
  placeholder?: string;
  /**
   * Draws the `*` after the label and announces the field as required.
   *
   * Not the native `required` attribute: these forms are `noValidate` so that
   * one validator reports every field in one style.
   */
  required?: boolean;
  /**
   * How many digits may be typed into the box.
   *
   * Not `maxLength`. That attribute is inert on `input type="number"` — the
   * HTML spec applies it to text, search, url, tel, email and password only —
   * so a `maxLength={3}` here would look like a rule and enforce nothing. The
   * cap is applied in the change handler instead, which rejects the keystroke
   * (and a paste) rather than truncating after the fact.
   *
   * Counts **digits**, not characters, so the decimal separator on a weight is
   * not one of the three: `70.5` is three digits and fits.
   *
   * Requires `onChange` — an uncontrolled field has no current value to fall
   * back to when a keystroke is refused, so passing this without it does
   * nothing.
   */
  maxDigits?: number;
  error?: string;
  /** Under the box. The measurements form puts the report's own text here. */
  hint?: React.ReactNode;
  /**
   * Remounts the input so an uncontrolled box re-seeds from `defaultValue`.
   *
   * A refusal comes back with what was typed, and an uncontrolled input keeps
   * whatever the DOM has — see the long note in `client-form.tsx` on why the
   * key is a counter and not the values themselves.
   */
  inputKey?: string | number;
  id?: string;
}) {
  /*
    Refusing a keystroke, rather than clamping the value.

    Returning without calling `onChange` leaves the controlled value where it
    was, so the fourth digit simply does not appear. Trimming to three instead
    would silently rewrite what somebody typed — a 1750 mistyped for 175 would
    become 175 and read as accepted.
  */
  const handleChange = (next: string) => {
    if (!onChange) return;

    const digits = (next.match(/\d/g) ?? []).length;
    if (maxDigits !== undefined && digits > maxDigits) return;

    onChange(next);
  };

  const errorId = error ? `${id}-error` : undefined;

  return (
    <Field>
      <Label htmlFor={id} required={required}>
        {label}
        {unit ? (
          /*
            The unit, one step quieter than the name it qualifies. `font-normal`
            against the label's own medium, so the name leads and the unit reads
            as the note it is.
          */
          <span className="font-normal text-muted-foreground">({unit})</span>
        ) : null}
      </Label>

      {/*
        No direction lock on the group.

        It follows the document, so in Arabic the icon, the placeholder and the
        digits all begin on the right and in English the same arrangement
        mirrors back. Only the *box* mirrors: the digits inside it are a number,
        and a number is a left-to-right run under the bidi algorithm in either
        script — 171 is written 171 in Arabic too.

        `focusTone="neutral"`: the group draws its own focus treatment, and the
        brand default is the accent ring that `.q-field` deliberately refuses —
        a form is a column of fields and the accent firing on each one as it is
        tabbed through turns the accent into noise.

        48px and the system's control radius, so the group matches every other
        field on the screen rather than the component's own 32px default.
      */}
      <InputGroup focusTone="neutral" className="h-12 rounded-(--radius-control)">
        {icon ? (
          <InputGroupAddon align="inline-start" className="ps-4">
            <Icon name={icon} />
          </InputGroupAddon>
        ) : null}

        <InputGroupInput
          key={inputKey}
          id={id}
          name={name}
          {...(mode === 'number'
            ? { type: 'number' as const, min, max, step }
            : { type: 'text' as const, autoComplete: 'off' })}
          inputMode="decimal"
          aria-required={required || undefined}
          /*
            The group paints the red edge from this, via its own
            `has-[[data-slot][aria-invalid=true]]:border-destructive` — so the
            whole control turns, not just the bare input inside it.
          */
          aria-invalid={error !== undefined || undefined}
          aria-describedby={errorId}
          className={cn(
            // The field's own inline padding, which `InputGroupInput` strips
            // back to nothing so a group can decide it per addon.
            'px-5',
            'tabular-nums',
            /*
              The browser's own spinners are drawn at the inline-end edge, and
              they appear on hover over a box whose whole content is a two- or
              three-digit number — a control nobody asked for, arriving on top
              of the value.
            */
            '[appearance:textfield]',
            '[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          )}
          placeholder={placeholder}
          {...(onChange
            ? { value: value ?? '', onChange: (event) => handleChange(event.target.value) }
            : { defaultValue })}
        />
      </InputGroup>

      <FieldError id={errorId}>{error}</FieldError>
      {!error && hint ? <FieldHint className="tabular-nums">{hint}</FieldHint> : null}
    </Field>
  );
}
