'use client';

import * as React from 'react';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** One row of the list. `value` is what the caller gets back. */
export type SelectFieldOption<T> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type SelectFieldProps<T> = {
  /**
   * Omit both this and `onValueChange` to leave the select uncontrolled and let
   * `name` post it with the surrounding form — which is what the plan generator
   * does, having no state of its own to keep.
   */
  value?: T;
  onValueChange?: (value: T) => void;
  /** The starting row when the select is uncontrolled. */
  defaultValue?: T;
  options: readonly SelectFieldOption<T>[];
  /** Shown, and announced, while nothing is chosen. */
  placeholder?: string;
  /** Posts the value with the surrounding `<form>`. */
  name?: string;
  id?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  /** Presentation of the trigger; the popup is unaffected. */
  size?: 'default' | 'sm';
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

/**
 * A select over a flat list of options.
 *
 * Every select in this app so far is a value, a setter and an array — the same
 * three arguments the old `SelectMenu` took. Composing `Select` + `SelectTrigger`
 * + `SelectValue` + `SelectContent` + `SelectItem` by hand at each of those call
 * sites would be nine copies of one shape, and nine chances for one of them to
 * drift, which is the thing `docs/` already asks us not to do.
 *
 * Reach for the parts directly when a list needs what this deliberately does not
 * offer: groups with labels, separators, per-row icons or descriptions. This is
 * the shorthand, not a wall in front of the component.
 */
export function SelectField<T extends string | number>({
  value,
  onValueChange,
  defaultValue,
  options,
  placeholder,
  name,
  id,
  disabled,
  autoFocus,
  className,
  size = 'default',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: SelectFieldProps<T>) {
  return (
    <Select
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(next as T)}
      name={name}
      disabled={disabled}
      items={options as unknown as SelectFieldOption<T>[]}
    >
      <SelectTrigger
        id={id}
        size={size}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className={cn('w-full', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>

      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={String(option.value)} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
