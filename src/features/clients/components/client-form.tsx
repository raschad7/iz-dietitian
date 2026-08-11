'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { DialogBody, DialogFooter } from '@/components/ui/dialog';
import { ClientIdentityFields } from '@/features/clients/components/client-identity-fields';
import { createClientAction, updateClientAction } from '@/features/clients/actions';
import { initialFormState, type ClientFormState } from '@/features/clients/form-state';
import { type ClientFormValues } from '@/features/clients/types';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The body of the client card — the only way into a client record's identity,
 * whether it is being created or edited. `ClientFormTrigger` owns the card.
 *
 * **Identity only, and there is no disclosure any more.** This card used to
 * hide height, goal, activity level and three notes fields behind a "more
 * details" chevron, while weight, allergen tags and the meal schedule lived on
 * a form owned by the weekly planner. Neither surface held a whole client:
 * the six inputs the calorie formula needs were split five-and-one across the
 * two, so a dietitian could fill either one completely and still be told
 * something was missing. All of that is the intake dialog now
 * (`IntakeFormTrigger`), and what is left here is the handful of facts a record
 * is *created* from — which is what makes a walk-in still take one short screen.
 *
 * The fields rest neutral and pick up olive under the pointer like every other
 * field in the app. They used to carry `.q-field-primary`, an olive edge and
 * fill at rest, which made an empty card open as a block of green before anyone
 * had touched it and left olive meaning two things at once: "required" and "you
 * are here".
 */
type FieldName = 'fullName' | 'phone' | 'email' | 'dateOfBirth' | 'sex';

type ClientFormProps = {
  locale: Locale;
  /** Absent when creating. */
  client?: ClientFormValues;
  /** Cancelling closes the card rather than navigating away. */
  onCancel: () => void;
  /** An edit saved. Creating redirects instead, so this never fires for one. */
  onSaved: () => void;
};

export function ClientForm({ locale, client, onCancel, onSaved }: ClientFormProps) {
  const tCommon = useTranslations('common');

  const [state, formAction] = useActionState(
    client ? updateClientAction : createClientAction,
    initialFormState,
  );

  const errorFor = (field: FieldName) =>
    state.status === 'error' ? state.fieldErrors?.[field]?.[0] : undefined;

  useEffect(() => {
    if (state.status === 'success') onSaved();
  }, [state.status, onSaved]);

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col text-start">
      <input type="hidden" name="locale" value={locale} />
      {client ? <input type="hidden" name="clientId" value={client.id} /> : null}

      <DialogBody className="min-h-0 flex-1 gap-0 overflow-y-auto p-4 sm:p-5">
        {/*
          The fields themselves live in `ClientIdentityFields`, because the
          calendar's "New client" dialog asks for exactly these — see the note
          there on why the two surfaces stopped disagreeing about what a client
          is made of.
        */}
        <ClientIdentityFields locale={locale} client={client} errorFor={errorFor} />

        {/*
          Where the disclosure used to be. Creating a client no longer asks for
          anything clinical, so there is nothing left to hide — see the note on
          `ClientForm` above. The next step is offered after the save, not
          crammed in beneath it: `createClientAction` redirects to the new
          record, whose Nutrition tab is where the rest is filled in.
        */}
        <FormMessage state={state} className="pt-4" />
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {tCommon('cancel')}
        </Button>
        <SubmitButton label={tCommon('save')} size="sm" />
      </DialogFooter>
    </form>
  );
}

function FormMessage({ state, className }: { state: ClientFormState; className?: string }) {
  const t = useTranslations('clients');
  if (state.status !== 'error') return null;

  return (
    <p role="status" className={cn('text-sm text-destructive', className)}>
      {t(state.messageKey)}
    </p>
  );
}

function SubmitButton({ label, size }: { label: string; size?: 'default' | 'sm' }) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size={size} disabled={pending}>
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
