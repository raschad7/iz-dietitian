'use client';

import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';

type ConfirmSubmitButtonProps = {
  label: string;
  /** Shown in the confirmation prompt. Omit for actions that are easily undone. */
  confirmMessage?: string;
  variant?: 'default' | 'outline' | 'destructive' | 'ghost';
  size?: 'default' | 'sm';
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
}: ConfirmSubmitButtonProps) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
