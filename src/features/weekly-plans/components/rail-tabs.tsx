'use client';

import { cn } from '@/lib/utils';

/**
 * The plan rail's tab bar.
 *
 * A real `tablist` rather than styled buttons: the rail is where all of the
 * board's secondary content lives, and a screen reader has to be able to tell that
 * switching tabs replaces a panel rather than navigating away from the plan.
 *
 * Presentational — the board owns which tab is open, because opening a meal card
 * selects the meal tab from outside this component.
 */
export function RailTabs<T extends string>({
  tabs,
  active,
  onSelect,
  label,
  className,
}: {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onSelect: (id: T) => void;
  label: string;
  /** The caller pins the bar; the bar does not know what it is sitting above. */
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('grid grid-cols-4 border-b border-border', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`rail-tab-${tab.id}`}
          aria-selected={tab.id === active}
          aria-controls={`rail-panel-${tab.id}`}
          tabIndex={tab.id === active ? 0 : -1}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();

            const current = tabs.findIndex((entry) => entry.id === tab.id);
            const rtl = document.documentElement.dir === 'rtl';
            const visualStep = event.key === 'ArrowRight' ? 1 : -1;
            const step = rtl ? -visualStep : visualStep;
            const nextIndex =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? tabs.length - 1
                  : (current + step + tabs.length) % tabs.length;
            const next = tabs[nextIndex];
            if (!next) return;

            onSelect(next.id);
            document.getElementById(`rail-tab-${next.id}`)?.focus();
          }}
          className={cn(
            // 40px, the system's floor: below `xl` this bar is inside a sheet
            // and these four are thumb targets.
            'relative min-h-11 px-2 py-1 text-label font-medium outline-none transition-colors after:absolute after:inset-x-2 after:bottom-[-1px] after:h-0.5 after:origin-center after:scale-x-0 after:bg-primary after:transition-transform focus-visible:bg-accent',
            tab.id === active
              ? 'text-primary after:scale-x-100'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
