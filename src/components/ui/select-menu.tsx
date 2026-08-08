'use client';

import * as React from 'react';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * A listbox this app draws itself, for the places a native `<select>` is not
 * good enough.
 *
 * **`Select` is still the default and should stay that way.** A native select
 * gets keyboard behaviour, screen-reader semantics and the mobile picker for
 * free, ships no client bundle, and mirrors in RTL without being told. This
 * component has to earn all four back by hand, and the only reason it exists is
 * that the browser's own popup cannot be styled: inside a dense dialog its list
 * is drawn by the OS in a font, size and spacing that belong to no design
 * system, and next to `TimeField` — which is built out of two of these — the
 * mismatch was the loudest thing on the form.
 *
 * Reach for this when the *open* list is part of the design. Reach for `Select`
 * everywhere else.
 *
 * Implementation notes worth keeping:
 *
 *  - The trigger is `.q-field`, the same box `Input`, `Textarea` and `Select`
 *    share, so hover and focus behave identically and a change to the field
 *    language reaches this too.
 *  - A hidden input carries the value, so this still submits inside an ordinary
 *    uncontrolled `<form>` with no `onChange` wiring at the call site.
 *  - The list is `position: fixed`, measured from the trigger. `absolute` would
 *    be clipped by the dialog panel's own `overflow-y-auto`, and portalling to
 *    `<body>` would drop it *behind* a `<dialog>`, which renders in the top
 *    layer. Fixed, rendered in place, is the one option that is neither.
 */

export type SelectOption = {
  value: string;
  label: string;
};

type SelectMenuProps = {
  /** Posts the value in a plain form. Omit inside a composite like `TimeField`. */
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  /** Shown when nothing is chosen. Selecting it clears the value. */
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

export function SelectMenu({
  name,
  value,
  onChange,
  options,
  placeholder,
  id,
  disabled,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: SelectMenuProps) {
  const generatedId = React.useId();
  const listId = `${generatedId}-list`;

  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [rect, setRect] = React.useState<{ top: number; start: number; width: number } | null>(null);

  const trigger = React.useRef<HTMLButtonElement>(null);
  const list = React.useRef<HTMLUListElement>(null);
  /** Type-ahead buffer, cleared by a timer rather than held in state. */
  const typed = React.useRef({ text: '', at: 0 });

  const selected = options.find((option) => option.value === value) ?? null;

  /*
   * Measured in the handler rather than in an effect: an effect that sets state
   * on open paints the list at the wrong place for one frame and then moves it,
   * and the React compiler rejects the synchronous setState besides.
   */
  const measure = React.useCallback(() => {
    const node = trigger.current;
    if (!node) return;

    const box = node.getBoundingClientRect();
    const below = window.innerHeight - box.bottom;

    // Flip above the trigger when the list would not fit under it. `start` is
    // the inline-start edge in the document's own direction, which is what the
    // style below positions against.
    const height = Math.min(options.length * 40 + 8, 240);
    const top = below < height + 8 ? box.top - height - 4 : box.bottom + 4;

    setRect({
      top,
      start: document.dir === 'rtl' ? window.innerWidth - box.right : box.left,
      width: box.width,
    });
  }, [options.length]);

  const openList = () => {
    if (disabled) return;
    measure();
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  };

  const close = React.useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  const choose = (option: SelectOption) => {
    onChange(option.value);
    close();
  };

  /*
   * While the list is open it follows the trigger and closes on an outside
   * press. Listeners only — nothing here sets state during the effect body.
   */
  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (trigger.current?.contains(target) || list.current?.contains(target)) return;
      setOpen(false);
    };

    // `true` on scroll: a scroll inside the dialog panel does not bubble, and
    // the list is positioned against the viewport.
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  /** Keeps the active option in view as the arrows move it. */
  React.useEffect(() => {
    if (!open) return;
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault();
        openList();
      }
      return;
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        close();
        return;
      case 'Tab':
        // Tab commits and moves on, the way a native select does.
        setOpen(false);
        return;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const option = options[active];
        if (option) choose(option);
        return;
      }
      case 'ArrowDown':
        event.preventDefault();
        setActive((current) => Math.min(current + 1, options.length - 1));
        return;
      case 'ArrowUp':
        event.preventDefault();
        setActive((current) => Math.max(current - 1, 0));
        return;
      case 'Home':
        event.preventDefault();
        setActive(0);
        return;
      case 'End':
        event.preventDefault();
        setActive(options.length - 1);
        return;
      default:
        break;
    }

    // Type-ahead. A native select does this and losing it would be a downgrade
    // nobody asked for — on a list of twenty-four hours it is the fastest way in.
    if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;

    const now = Date.now();
    typed.current = {
      text: now - typed.current.at > 800 ? event.key : typed.current.text + event.key,
      at: now,
    };

    const match = options.findIndex((option) =>
      option.label.toLowerCase().startsWith(typed.current.text.toLowerCase()),
    );

    if (match >= 0) setActive(match);
  };

  return (
    <div className={cn('relative w-full', className)}>
      {name ? <input type="hidden" name={name} value={value} /> : null}

      <button
        ref={trigger}
        type="button"
        id={id}
        disabled={disabled}
        // `combobox` and not `listbox`: the trigger is the control, the list it
        // owns is the listbox. This is the ARIA 1.2 select-only pattern.
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className="q-field h-12 cursor-pointer items-center justify-between gap-2 ps-5 pe-11 text-start"
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')} dir="auto">
          {selected?.label ?? placeholder ?? ''}
        </span>

        <Icon
          name="chevronDown"
          className={cn(
            'pointer-events-none absolute inset-e-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground',
            'transition-transform duration-180 ease-out',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && rect ? (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          style={{ top: rect.top, insetInlineStart: rect.start, width: rect.width }}
          className={cn(
            'fixed z-50 max-h-60 overflow-y-auto rounded-[10px] border border-border bg-popover p-1',
            'shadow-elevated',
            'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-180',
          )}
        >
          {placeholder ? (
            <Option
              id={`${listId}--1`}
              index={-1}
              active={false}
              selected={value === ''}
              muted
              onSelect={() => choose({ value: '', label: placeholder })}
            >
              {placeholder}
            </Option>
          ) : null}

          {options.map((option, index) => (
            <Option
              key={option.value}
              id={`${listId}-${index}`}
              index={index}
              active={index === active}
              selected={option.value === value}
              onSelect={() => choose(option)}
              onHover={() => setActive(index)}
            >
              {option.label}
            </Option>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Option({
  id,
  index,
  active,
  selected,
  muted,
  onSelect,
  onHover,
  children,
}: {
  id: string;
  index: number;
  active: boolean;
  selected: boolean;
  muted?: boolean;
  onSelect: () => void;
  onHover?: () => void;
  children: React.ReactNode;
}) {
  return (
    <li
      id={id}
      role="option"
      data-index={index}
      aria-selected={selected}
      onMouseEnter={onHover}
      /*
        `pointerdown` and not `click`: the outside-press listener runs on
        pointerdown too, and on a click the list would already have closed
        underneath the pointer before the selection landed.
      */
      onPointerDown={(event) => {
        event.preventDefault();
        onSelect();
      }}
      className={cn(
        'flex h-10 cursor-pointer items-center justify-between gap-2 rounded-md px-3 text-body-sm',
        muted && 'text-muted-foreground',
        // Hover and keyboard share one highlight, so the pointer and the arrows
        // never disagree about which row is next.
        active && 'bg-secondary text-secondary-foreground',
        selected && 'font-semibold',
      )}
    >
      <span className="truncate" dir="auto">
        {children}
      </span>
      {selected ? <Icon name="check" className="size-4 shrink-0 text-primary" /> : null}
    </li>
  );
}
