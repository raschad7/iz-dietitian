'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { invitePortalAccessAction, revokePortalAccessAction } from '@/features/clients/actions';
import { initialPortalState, type PortalActionState } from '@/features/clients/form-state';
import { type Locale } from '@/i18n/routing';

type PortalAccessCardProps = {
  locale: Locale;
  clientId: string;
  hasPortalAccess: boolean;
};

export function PortalAccessCard({ locale, clientId, hasPortalAccess }: PortalAccessCardProps) {
  const t = useTranslations('clients');

  const [state, formAction] = useActionState(
    hasPortalAccess ? revokePortalAccessAction : invitePortalAccessAction,
    initialPortalState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('portal.title')}</CardTitle>
        <CardDescription>{hasPortalAccess ? t('portal.granted') : t('portal.none')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="clientId" value={clientId} />

          <Message state={state} />

          <SubmitButton label={hasPortalAccess ? t('portal.revoke') : t('portal.invite')} destructive={hasPortalAccess} />
        </form>

        {!hasPortalAccess ? <p className="text-xs text-muted-foreground">{t('portal.devNotice')}</p> : null}
      </CardContent>
    </Card>
  );
}

function Message({ state }: { state: PortalActionState }) {
  const t = useTranslations('clients');
  if (state.status === 'idle') return null;

  return (
    <p
      role="status"
      className={state.status === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
    >
      {t(state.messageKey)}
    </p>
  );
}

function SubmitButton({ label, destructive }: { label: string; destructive: boolean }) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={destructive ? 'outline' : 'default'} disabled={pending}>
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
