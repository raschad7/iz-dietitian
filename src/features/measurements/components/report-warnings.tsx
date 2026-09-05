'use client';

import { useTranslations } from 'next-intl';

import { Callout } from '@/components/ui/callout';

import { type ParseWarning } from '../parse/types';
import { type RecordWarning } from '../report-state';

/**
 * Everything that looked wrong about a report, above the figures it produced.
 *
 * ## Why these are shown rather than acted on
 *
 * Not one of them can be resolved by the app. A name that does not match may be
 * a transliteration or may be the wrong client's report; a checksum that fails
 * may be a rounding artefact or a field read from the wrong row; a height the
 * machine disagrees about may be an operator typo at either end. Every one is a
 * question only the person holding the report can answer, and answering it for
 * them is how a parser stops being checked.
 *
 * So none of them blocks a save. They change what the dietitian looks at before
 * pressing it.
 *
 * ## Order carries the priority, not colour
 *
 * `nameMismatch` first, always. Filing a report onto the wrong client's record
 * is the most consequential mistake this feature makes possible and the hardest
 * to notice afterwards — every other warning is about a number being wrong, that
 * one is about the whole record being wrong.
 *
 * All of them are drawn `attention`, and none `medical`. `Callout`'s tones map
 * onto status tokens rather than onto a severity ladder — amber is "something to
 * check", which is exactly what every one of these is, and clay is reserved for
 * medical facts rather than borrowed to mean "worse". So the ordering does the
 * work that a third colour would otherwise be asked to do.
 */

type AnyWarning = ParseWarning | RecordWarning;

/** Most consequential first. */
const ORDER: Record<AnyWarning['kind'], number> = {
  nameMismatch: 0,
  duplicate: 1,
  unknownDevice: 2,
  checksum: 3,
  converted: 4,
  heightMismatch: 5,
  dateAmbiguous: 6,
};

export function ReportWarnings({ warnings }: { warnings: readonly AnyWarning[] }) {
  const t = useTranslations('measurements');

  if (warnings.length === 0) return null;

  const sorted = [...warnings].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);

  return (
    <div className="space-y-2">
      {sorted.map((warning, index) => (
        <Callout key={`${warning.kind}-${index}`} tone="attention">
          {message(warning, t)}
        </Callout>
      ))}
    </div>
  );
}

function message(
  warning: AnyWarning,
  t: ReturnType<typeof useTranslations<'measurements'>>,
): string {
  switch (warning.kind) {
    case 'unknownDevice':
      return t('warnings.unknownDevice');

    case 'converted':
      return t('warnings.converted', {
        field: t(`metrics.${warning.field}`),
        from: warning.from,
        to: warning.to,
      });

    case 'checksum':
      return t('warnings.checksum', {
        check: warning.check,
        expected: warning.expected,
        found: warning.found,
      });

    case 'dateAmbiguous':
      return t('warnings.dateAmbiguous', { raw: warning.raw });

    case 'nameMismatch':
      return t('warnings.nameMismatch', {
        onReport: warning.onReport,
        onRecord: warning.onRecord,
      });

    case 'heightMismatch':
      return t('warnings.heightMismatch', {
        onReport: warning.onReport,
        onRecord: warning.onRecord,
      });

    case 'duplicate':
      return t('warnings.duplicate', { measuredOn: warning.measuredOn });
  }
}
