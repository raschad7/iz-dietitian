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
    <div role="tablist" aria-label={label} className={cn('flex gap-1 pb-3', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`rail-tab-${tab.id}`}
          aria-selected={tab.id === active}
          aria-controls={`rail-panel-${tab.id}`}
          onClick={() => onSelect(tab.id)}
          className={cn(
            // 40px, the system's floor: below `xl` this bar is inside a sheet
            // and these four are thumb targets.
            'min-h-10 flex-1 rounded-md px-2 py-1 text-label font-medium transition-colors',
            tab.id === active
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-accent',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
