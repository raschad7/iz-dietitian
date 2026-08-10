'use client';

import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Icon, type IconName } from '@/components/ui/icon';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { type Locale } from '@/i18n/routing';

type ConfirmSubmitButtonProps = {
  label: string;
  /** The consequence, in one sentence. Omit for actions that are easily undone. */
  confirmMessage?: string;
  /**
   * The question, short. Defaults to the button's own label, which is usually
   * right — "Delete permanently?" reads better as a title than the sentence
   * explaining what it costs. Pass one where the label alone does not name what
   * is at stake.
   */
  confirmTitle?: string;
  variant?: 'default' | 'outline' | 'destructive' | 'destructiveGhost' | 'ghost' | 'neutral';
  size?: 'default' | 'sm' | 'icon' | 'icon-sm';
  /**
   * Renders the glyph instead of the words. `label` stays the accessible name
   * and becomes the tooltip, so the button is never unlabelled — an icon-only
   * control with no `aria-label` is a button that reads as "button".
   */
  icon?: IconName;
  className?: string;
};

/**
 * Submit button that can ask before it acts.
 *
 * **It asks through `ConfirmDialog` now, not `window.confirm()`.** The browser's
 * own prompt was chosen when the design system had no modal; it has had one for
 * a while, and the native dialog was the loudest inconsistency left in the staff
 * app — browser chrome pinned to the top-left corner of a right-to-left page, in
 * the browser's UI language rather than the clinic's, with an OK button drawn by
 * the operating system. Four actions on a client's record went through it.
 *
 * The exchange is necessarily asynchronous now, where `confirm()` was a blocking
 * call that could veto the submit by returning false from `onClick`. So the
 * click is cancelled unconditionally and confirming starts a *new* submit
 * through `requestSubmit()` — which dispatches a real submit event, so the
 * form's `action` and this button's own `useFormStatus` both behave exactly as
 * they did before.
 *
 * Actions that are trivially reversible (archive, restore) pass no
 * `confirmMessage` and submit immediately, with no dialog at all.
 */
export function ConfirmSubmitButton({
  label,
  confirmMessage,
  confirmTitle,
  variant = 'outline',
  size = 'default',
  icon,
  className,
}: ConfirmSubmitButtonProps) {
  const tCommon = useTranslations('common');
  // From the active document rather than a prop: every caller already renders
  // inside `NextIntlClientProvider`, and threading a locale through five call
  // sites to set one `dir` is a worse API than reading the one that is there.
  const locale = useLocale() as Locale;
  const { pending } = useFormStatus();

  const [asking, setAsking] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const iconOnly = icon !== undefined && (size === 'icon' || size === 'icon-sm');
  const destructive = variant === 'destructive' || variant === 'destructiveGhost';

  const button = (
    <Button
      ref={buttonRef}
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      aria-label={iconOnly ? label : undefined}
      className={className}
      onClick={(event) => {
        if (!confirmMessage) return;
        // The answer cannot arrive during this handler, so this submit never
        // happens. Confirming starts another one.
        event.preventDefault();
        setAsking(true);
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

  return (
    <>
      {iconOnly ? <TooltipHint label={label}>{button}</TooltipHint> : button}

      {asking && confirmMessage ? (
        <ConfirmDialog
          locale={locale}
          title={confirmTitle ?? label}
          description={confirmMessage}
          /*
           * The button's own words, not a generic "OK". The confirm button is
           * the last chance to notice you are on the wrong row, and "Delete
           * permanently" says more there than "Confirm" does.
           */
          confirmLabel={label}
          cancelLabel={tCommon('cancel')}
          tone={destructive ? 'destructive' : 'default'}
          onConfirm={() => {
            setAsking(false);
            // `requestSubmit` rather than `submit()`: the latter skips both
            // validation and the submit event, and React's `action` is bound to
            // that event. The submitter is passed so any name/value it carries
            // still reaches the action.
            const form = buttonRef.current?.form;
            form?.requestSubmit(buttonRef.current);
          }}
          onCancel={() => setAsking(false)}
        />
      ) : null}
    </>
  );
}
