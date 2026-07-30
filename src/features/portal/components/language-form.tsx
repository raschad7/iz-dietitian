import { useTranslations } from 'next-intl';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { updateLanguageAction } from '@/features/portal/actions';
import { locales, type Locale } from '@/i18n/routing';

/**
 * The one setting a client owns.
 *
 * Saving takes them to the same page in the chosen language — `next-intl` reads
 * the locale from the URL, so writing the preference without navigating would
 * look like a setting that does nothing. The action handles that redirect; see
 * `updateLanguageAction`.
 *
 * A plain `<form>` with no client component of its own: the submit button
 * carries the pending state, and a native `<select>` gives the phone its own
 * picker for free.
 */
export function LanguageForm({ locale }: { locale: Locale }) {
  const t = useTranslations('portal');
  const tSwitcher = useTranslations('localeSwitcher');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.language')}</CardTitle>
        <CardDescription>{t('profile.languageDescription')}</CardDescription>
      </CardHeader>

      <CardContent>
        <form action={updateLanguageAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />

          <div className="space-y-2">
            <Label htmlFor="preferred-locale">{tSwitcher('label')}</Label>
            <SelectField id="preferred-locale" name="preferredLocale" defaultValue={locale}>
              {locales.map((option) => (
                <option key={option} value={option}>
                  {tSwitcher(option)}
                </option>
              ))}
            </SelectField>
          </div>

          <ConfirmSubmitButton label={t('profile.saveLanguage')} variant="default" />
        </form>
      </CardContent>
    </Card>
  );
}
