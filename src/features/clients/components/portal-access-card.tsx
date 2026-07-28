'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { invitePortalAccessAction, revokePortalAccessAction } from '@/features/clients/actions';
import { ConfirmSubmitButton } from '@/features/clients/components/confirm-submit-button';
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

          {/* Revoking ends their session immediately, so it asks first. */}
          <ConfirmSubmitButton
            label={hasPortalAccess ? t('portal.revoke') : t('portal.invite')}
            confirmMessage={hasPortalAccess ? t('portal.confirmRevoke') : undefined}
            variant={hasPortalAccess ? 'outline' : 'default'}
          />
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

