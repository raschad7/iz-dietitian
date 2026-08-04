import { MessageCircle, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { clinicContactLinks } from '@/features/portal/clinic-contact';
import { type PortalClinic } from '@/features/portal/types';

/**
 * `تواصل مع العيادة` as a settings row.
 *
 * The same two links the profile screen's clinic section offers, in the place
 * someone looks for them when they have a problem with the app rather than with
 * their record. Both screens read `clinicContactLinks`, so the number is parsed
 * once and cannot disagree between them.
 *
 * With no usable phone number on the clinic row this renders the clinic's name
 * and says the number is not recorded — it never draws a call button that would
 * dial nothing.
 */
export function ClinicContactRow({
  clinic,
  countryCode,
}: {
  clinic: PortalClinic | null;
  countryCode: string;
}) {
  const t = useTranslations('portal.settings.support');
  const tProfile = useTranslations('portal.profile');

  const { tel, whatsapp } = clinic
    ? clinicContactLinks(clinic.phone, countryCode)
    : { tel: null, whatsapp: null };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium">{t('contactClinic')}</span>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {clinic ? clinic.name : tProfile('clinicUnknown')}
        </p>
      </div>

      {tel || whatsapp ? (
        <div className="flex shrink-0 items-center gap-1">
          {tel ? (
            <a
              href={tel}
              aria-label={tProfile('callClinic')}
              className="grid size-11 place-items-center rounded-full bg-secondary text-primary transition-colors hover:bg-status-on-track-bg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo focus-visible:outline-none"
            >
              <Phone className="size-4.5" strokeWidth={1.9} aria-hidden="true" />
            </a>
          ) : null}

          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={tProfile('whatsappClinic')}
              className="grid size-11 place-items-center rounded-full bg-secondary text-primary transition-colors hover:bg-status-on-track-bg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo focus-visible:outline-none"
            >
              <MessageCircle className="size-4.5" strokeWidth={1.9} aria-hidden="true" />
            </a>
          ) : null}
        </div>
      ) : (
        <span className="shrink-0 text-sm text-muted-foreground">{tProfile('notRecorded')}</span>
      )}
    </div>
  );
}
