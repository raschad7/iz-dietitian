import { BadgeCheck, Camera } from 'lucide-react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { initialsOf } from '@/features/booking/format';
import { type PortalClinic, type PortalPractitioner, type PortalProfile } from '@/features/portal/types';
import { type Locale } from '@/i18n/routing';
import { formatDate } from '@/lib/format';

/**
 * Whose record this is, and who keeps it.
 *
 * The screen's title is "my profile", but the thing it opens on is not a
 * portrait — it is an attribution. A client reading a height they did not type
 * needs to know, before anything else, that a named person at a named clinic
 * wrote it down, because that is what makes the rest of the screen make sense
 * and what makes "ask them to correct it" an obvious next step rather than a
 * strange one.
 *
 * **The one tinted card on the screen.** Everything below is white on cream;
 * this is olive-50, so the eye lands on the identity and then reads downward.
 * Full brand saturation was the other option and it costs more than it buys —
 * a screen of five sections cannot afford a header that shouts (§9.4).
 *
 * **The date is the record's own, not a badge that always says "up to date".**
 * `clients.updated_at` moves when the dietitian saves the record, so this line
 * is a fact the client can check against their last visit. A green "verified"
 * chip that renders unconditionally would say nothing and imply everything.
 *
 * **The camera button is disabled, not hidden.** The photo is the one field on
 * this screen the client owns rather than their dietitian — see `types.ts`'s
 * `ProfilePageData` note — but there is no upload flow to wire it to yet
 * (`clients.photo_url` is still a path someone puts on disk by hand, see
 * `src/db/schema/clients.ts`). Showing a disabled control tells the client the
 * capability is coming rather than pretending the picture is fixed forever, the
 * way omitting the control entirely would.
 */
export function ProfileIdentity({
  profile,
  clinic,
  practitioner,
}: {
  profile: PortalProfile;
  clinic: PortalClinic | null;
  practitioner: PortalPractitioner | null;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.profile');

  return (
    <Card className="border-primary/15 bg-secondary">
      <CardContent className="flex items-center gap-4">
        <span className="relative shrink-0">
          {/*
            The circular clip lives on this inner span, not the outer one — the
            disabled camera button sits at the outer span's corner, and a
            `rounded-full`+`overflow-hidden` ancestor would mask it against the
            circle instead of just the button's own rectangle.
          */}
          <span className="relative flex size-16 items-center justify-center overflow-hidden rounded-full bg-primary font-heading text-lg font-medium text-primary-foreground shadow-card">
            {profile.photoUrl ? (
              // `fill` + `object-cover`: a portrait and a square both have to land
              // as a circle without this component knowing the ratio. The initials
              // stay underneath, so a photo that 404s degrades to them.
              <Image src={profile.photoUrl} alt="" fill sizes="64px" className="object-cover" />
            ) : null}
            <span className={profile.photoUrl ? 'sr-only' : undefined}>
              {initialsOf(profile.fullName)}
            </span>
          </span>

          <Button
            type="button"
            disabled
            variant="secondary"
            size="icon-sm"
            aria-label={t('photo.changeSoon')}
            title={t('photo.changeSoon')}
            className="absolute end-0 bottom-0 shadow-card"
          >
            <Camera className="size-3.5" strokeWidth={1.9} aria-hidden="true" />
          </Button>
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate font-heading text-lg leading-snug font-semibold text-secondary-foreground">
            {profile.fullName}
          </p>

          {/*
            Clinic and practitioner on one line, in that order: the clinic is
            the institution the record belongs to and the dietitian is the
            person inside it. Both are repeated in full further down, with a
            phone number and opening hours; here they are a caption.
          */}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {clinic ? clinic.name : t('clinicUnknown')}
            {practitioner ? ` · ${practitioner.name}` : null}
          </p>

          <p className="flex items-center gap-1.5 pt-0.5 text-xs text-secondary-foreground">
            <BadgeCheck className="size-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
            {t('lastUpdated', { date: formatDate(locale, profile.updatedAt, { dateStyle: 'long' }) })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
