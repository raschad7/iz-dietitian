'use client';

import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Tooltip } from '@/components/ui/tooltip';

type ConfirmSubmitButtonProps = {
  label: string;
  /** Shown in the confirmation prompt. Omit for actions that are easily undone. */
  confirmMessage?: string;
  variant?: 'default' | 'outline' | 'destructive' | 'ghost';
  size?: 'default' | 'sm' | 'icon' | 'icon-sm';
  /**
   * Renders the glyph instead of the words. `label` stays the accessible name
   * and becomes the tooltip, so the button is never unlabelled — an icon-only
   * control with no `aria-label` is a button that reads as "button".
   */
  icon?: IconName;
};

/**
 * Submit button that can ask before it acts.
 *
 * Uses the browser's own `confirm()` rather than a modal component: it is
 * synchronous, cancels the submit by returning false from `onClick`, is
 * translated and RTL-correct for free, and needs no dependency. Worth replacing
 * with a real dialog when the design system grows one.
 *
 * Actions that are trivially reversible (archive, restore) pass no
 * `confirmMessage` and submit immediately.
 */
export function ConfirmSubmitButton({
  label,
  confirmMessage,
  variant = 'outline',
  size = 'default',
  icon,
}: ConfirmSubmitButtonProps) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  const iconOnly = icon !== undefined && (size === 'icon' || size === 'icon-sm');

  const button = (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      aria-label={iconOnly ? label : undefined}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {iconOnly ? (
        // The glyph does not change while pending — swapping it would move the
        // reader's attention to the icon at the exact moment the row is about
        // to be replaced. `disabled` already says the click landed.
        //
        // `size-5` because with no words beside it the glyph *is* the button;
        // the base 16px is sized to sit next to a label. It has to be stated
        // here rather than on a wrapper — the button only auto-sizes glyphs
        // that carry no `size-` class, at a specificity a parent cannot beat.
        <Icon name={icon} className="size-5" />
      ) : (
        <>
          {icon ? <Icon name={icon} /> : null}
          {pending ? tCommon('loading') : label}
        </>
      )}
    </Button>
  );

  return iconOnly ? <Tooltip label={label}>{button}</Tooltip> : button;
}
