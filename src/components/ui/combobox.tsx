'use client';

import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { type ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * One row of the list.
 *
 * `value` is what the caller gets back; `label` is the only thing the filter
 * and the input ever read, so it must be the human string a person would type.
 */
export type ComboboxOption<T> = {
  value: T;
  /** What the input filters on and shows once chosen. */
  label: string;
  /** Optional trailing content — a status badge, a count. */
  meta?: ReactNode;
  /** Optional leading mark — the record's stored colour. */
  swatch?: string;
};

type ComboboxProps<T extends string> = {
  options: readonly ComboboxOption<T>[];
  value: T | null;
  onValueChange: (value: T | null) => void;
  /** The accessible name. Required — an unlabelled combobox is unusable. */
  label: string;
  placeholder: string;
  emptyMessage: string;
  className?: string;
  /** Presentation of the editable trigger; popup behaviour stays identical. */
  inputClassName?: string;
  /** Lets a compact trigger keep a comfortably wide result list. */
  popupClassName?: string;
};

/**
 * A single-select field you can type into to narrow the list.
 *
 * `Select` is a native `<select>` and cannot filter, which is fine for a
 * handful of fixed options and useless for a register of clients. This is the
 * other half of that pair: reach for `Select` first, and for this only when
 * the list is long enough that scanning it is the slow part.
 *
 * Everything that is hard about a combobox — the filter, the ARIA wiring
 * (`role="combobox"` on the input, `aria-activedescendant`, `aria-expanded`),
 * arrow-key navigation, type-ahead, Escape, click-outside and the flip/shift
 * positioning — belongs to the Base UI primitive. This file contributes the
 * shape language and nothing else, the same way `Input` and `Button` do.
 *
 * Deliberately single-select: no multiple, no chips, no async loading, no
 * free-text entry. Each of those is a state with no caller, and a control that
 * can be in a mode nobody uses is a control nobody can reason about.
 */
export function Combobox<T extends string>({
  options,
  value,
  onValueChange,
  label,
  placeholder,
  emptyMessage,
  className,
  inputClassName,
  popupClassName,
}: ComboboxProps<T>) {
  /*
   * The primitive works in whole option objects, the caller works in ids. The
   * translation happens here so no caller has to hold an object identity
   * stable across renders just to keep a selection.
   */
  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <ComboboxPrimitive.Root<ComboboxOption<T>>
      items={options}
      value={selected}
      onValueChange={(next) => onValueChange(next?.value ?? null)}
      itemToStringLabel={(option) => option.label}
      /*
       * Compare by id, not by reference. `Object.is` — the default — would
       * drop the selection the moment a caller rebuilt its options array,
       * which any caller deriving options inside render does on every keypress.
       */
      isItemEqualToValue={(option, current) => option.value === current.value}
    >
      {/*
        `InputGroup` rather than a bare `div`: it is what the positioner
        anchors to, so `--anchor-width` below measures the whole field, and a
        press on the padding around the input focuses the input instead of
        landing on dead space.
      */}
      <ComboboxPrimitive.InputGroup className={cn('relative', className)}>
        <ComboboxPrimitive.Input
          aria-label={label}
          placeholder={placeholder}
          // The box, the Arc and the focus treatment live in `.q-field`
          // (globals.css), shared with Input, Textarea and Select. 48px and
          // 20px of padding to match `Input` exactly — a field and the button
          // beside it sit in the same row and must be the same height.
          className={cn(
            'q-field h-12 py-1 ps-5 pe-11 placeholder:text-muted-foreground',
            inputClassName,
          )}
        />

        {/*
          `aria-hidden` and out of the tab order on purpose.

          The chevron duplicates behaviour the input already owns — clicking
          the input opens the list, ArrowDown opens it, Escape closes it — so
          to a screen reader it is decoration. Giving it the same `aria-label`
          as the input would put two controls called "Client" in the
          accessibility tree and have the name read twice; giving it a second
          translated string would buy a caller nothing. It stays a real
          `Trigger` so the pointer affordance still toggles rather than only
          opens. `tabIndex` is written out rather than left to the primitive's
          default so the intent is legible here.
        */}
        <ComboboxPrimitive.Trigger
          aria-hidden
          tabIndex={-1}
          className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-muted-foreground"
        >
          <Icon name="chevronDown" />
        </ComboboxPrimitive.Trigger>
      </ComboboxPrimitive.InputGroup>

      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner sideOffset={4} className="z-50">
          <ComboboxPrimitive.Popup
            // `--anchor-width` is the primitive's own positioner variable, so
            // the list is exactly as wide as the field it drops out of.
            className={cn(
              'w-(--anchor-width) origin-(--transform-origin) overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-elevated transition-[transform,opacity] duration-150 ease-[cubic-bezier(.2,.6,.2,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0',
              popupClassName,
            )}
          >
            {/*
              Stays mounted whether or not the list is empty — the primitive
              announces its contents politely, and conditionally rendering the
              element itself is what makes that announcement unreliable.
            */}
            <ComboboxPrimitive.Empty className="px-3 py-2 text-body-sm text-muted-foreground">
              {emptyMessage}
            </ComboboxPrimitive.Empty>

            <ComboboxPrimitive.List className="max-h-72 overflow-y-auto">
              {(option: ComboboxOption<T>) => (
                <ComboboxPrimitive.Item
                  key={option.value}
                  value={option}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-body-sm data-highlighted:bg-accent data-selected:bg-accent"
                >
                  {option.swatch ? (
                    /*
                      A per-record colour out of the database, not a token —
                      the documented "Arbitrary colour" case, which is why it
                      arrives as an inline style. `aria-hidden` because the
                      label beside it already says who this is.
                    */
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: option.swatch }}
                    />
                  ) : null}

                  {/* `dir="auto"` so an Arabic name inside an English list, or
                      the reverse, still reads from its own side. */}
                  <span className="min-w-0 flex-1 truncate" dir="auto">
                    {option.label}
                  </span>

                  {option.meta ? <span className="shrink-0">{option.meta}</span> : null}
                </ComboboxPrimitive.Item>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  );
}
