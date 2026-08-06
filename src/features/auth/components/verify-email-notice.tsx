'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { resendVerification, signOutAction } from '@/features/auth/actions';
import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { initialAuthState } from '@/features/auth/form-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

type VerifyEmailNoticeProps = {
  locale: Locale;
  /**
   * The address the link was sent to, when it is known — from the sign-up that
   * just happened, or from an unverified session. Pre-filling it saves the one
   * piece of typing standing between someone and a second attempt.
   */
  email?: string;
  /**
   * Whether to offer a sign-out. Only true when a session actually exists,
   * which is the case for an account created before the verification gate was
   * turned on: it can reach the dashboard guard, be sent here, and would
   * otherwise have no way to get back to the sign-in page as somebody else.
   */
  canSignOut?: boolean;
  /**
   * The mail provider refused the message that brought them here — passed in
   * from the sign-up that just failed to send, because this component's own
   * action state starts idle and knows nothing about it.
   */
  sendFailed?: boolean;
  /**
   * True inside `AuthSplitCard`, whose white panel is already the one card
   * every auth screen sits on — a `Card` in here would be a second one
   * nested inside it. False (the default) draws its own `Card`, for the
   * standalone `/verify-email` route, which has no other surface around it.
   */
  bare?: boolean;
};

/**
 * The screen shown after sign-up, and wherever an unverified practitioner is
 * turned away.
 *
 * Shared by the sign-up form and the `/verify-email` route rather than written
 * twice — the two are reached differently but say exactly the same thing, and a
 * resend button that existed on only one of them would be missing at the moment
 * it is most needed.
 */
export function VerifyEmailNotice({
  locale,
  email,
  canSignOut = false,
  sendFailed = false,
  bare = false,
}: VerifyEmailNoticeProps) {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const [state, formAction] = useActionState(resendVerification, initialAuthState);

  // After a resend the action echoes the address back, which keeps the field
  // filled across the round trip without making this a controlled input.
  const prefilledEmail = (state.status === 'sent' ? state.email : undefined) ?? email;

  /**
   * The transport refused the message. Nothing about the account is wrong, so
   * this screen stays — but telling someone to watch an inbox when nothing was
   * accepted for delivery is worse than saying nothing at all.
   *
   * A resend that has since run is the more recent truth and replaces the
   * verdict this was rendered with, in both directions: a successful retry
   * clears the warning, and a retry that fails again keeps it up.
   */
  const deliveryFailed = state.status === 'sent' ? state.deliveryFailed === true : sendFailed;

  const heading = deliveryFailed ? t('verificationEmailFailedHeading') : t('checkInboxHeading');
  const description = deliveryFailed
    ? t('verificationEmailFailed')
    : prefilledEmail
      ? t('checkInboxDescriptionWithEmail', { email: prefilledEmail })
      : t('checkInboxDescription');

  const content = (
    <>
      {deliveryFailed ? null : <p className="text-sm text-muted-foreground">{t('checkInboxSpam')}</p>}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="locale" value={locale} />

        <div className="space-y-2">
          <Label htmlFor="resend-email">{tCommon('email')}</Label>
          <Input
            id="resend-email"
            name="email"
            type="email"
            autoComplete="email"
            dir="ltr"
            required
            defaultValue={prefilledEmail}
          />
          <p className="text-xs text-muted-foreground">{t('resendVerificationHint')}</p>
        </div>

        {/*
          Suppressed while the send is failing: this reports `verificationSent`
          for any `sent` state, which would sit directly under a heading
          saying the message could not be sent. The rate-limit and error
          cases still need it.
        */}
        {deliveryFailed && state.status === 'sent' ? null : <AuthFormMessage state={state} />}

        <AuthSubmitButton label={t('resendVerificationSubmit')} />
      </form>

      <div className="space-y-2 text-sm text-muted-foreground">
        {/*
          A mistyped address cannot be corrected from here: the mail went
          elsewhere, and the resend above would only send it there again.
          Signing up afresh is the only way out — the mistyped account is
          swept by `purgeUnverifiedAccounts` a day later.
        */}
        <p>
          {t('checkInboxWrongAddress')}{' '}
          <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            {t('signUpLink')}
          </Link>
        </p>

        {canSignOut ? (
          <form action={signOutAction}>
            <input type="hidden" name="locale" value={locale} />
            <Button type="submit" variant="ghost" size="sm" className="px-0">
              {tCommon('signOut')}
            </Button>
          </form>
        ) : null}
      </div>
    </>
  );

  if (bare) {
    return (
      <div className="w-full">
        <header className="mb-6 space-y-1 text-start">
          <h2 className="font-heading text-heading-lg">{heading}</h2>
          <p className="text-body-sm text-muted-foreground">{description}</p>
        </header>

        <div className="space-y-6">{content}</div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">{content}</CardContent>
    </Card>
  );
}
