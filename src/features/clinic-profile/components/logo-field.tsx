'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Field, FieldError } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * The clinic's mark: pick a file, see it immediately, save it with the dialog.
 *
 * ## The image never travels at full size
 *
 * There is no object storage in this stack — `DATABASE_URL` is the only backing
 * service — so the mark lives in a column as a `data:` URI. That is only
 * reasonable if the string is small, and the way to keep it small is to resize
 * *before* the network rather than to validate after it: a phone camera JPEG is
 * several megabytes, and posting one to a server action in order to reject it
 * wastes the whole upload. The picked file is drawn onto a 256×256 canvas and
 * re-encoded, so what leaves the browser is roughly 40 KB whatever was chosen.
 *
 * ## Fit, not fill
 *
 * The canvas letterboxes rather than crops. A clinic logo is usually wider than
 * it is tall, and `object-fit: cover` on a wordmark cuts the ends off the word,
 * which is the one thing a mark cannot survive. The transparent margin costs
 * nothing in WebP.
 */

const LOGO_PIXELS = 256;
const ACCEPTED = 'image/png,image/jpeg,image/webp';

/**
 * ⚠ **WebP is not universal, and the fallback matters.**
 * `toDataURL` returns a PNG when it does not recognise the requested type —
 * silently, with no error — so the type is read back off the returned string
 * rather than assumed. Both are accepted by `clinicLogoSchema`; what would
 * break is code downstream trusting the extension.
 */
async function resizeToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = LOGO_PIXELS;
    canvas.height = LOGO_PIXELS;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas-unavailable');

    // Contain: the longer edge fills the box, the shorter is centred in it.
    const scale = Math.min(LOGO_PIXELS / bitmap.width, LOGO_PIXELS / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, (LOGO_PIXELS - width) / 2, (LOGO_PIXELS - height) / 2, width, height);

    const encoded = canvas.toDataURL('image/webp', 0.92);
    // A browser with no WebP encoder hands back a PNG; both are legal here.
    return encoded.startsWith('data:image/') ? encoded : canvas.toDataURL('image/png');
  } finally {
    // Frees the decoded frame now rather than at the next GC pass. This runs
    // once per pick, but the frames are full camera resolution.
    bitmap.close();
  }
}

/**
 * The mark as it appears in a row, a dialog, or the rail.
 *
 * A **plain `<img>`, deliberately not `next/image`.** The source is a `data:`
 * URI already sized to 256px: there is no remote fetch to optimise, no layout
 * shift to reserve against and no srcset to generate, so the wrapper adds a
 * configuration surface and a parsing step for a value it cannot improve.
 *
 * A square with the card radius rather than a circle — `Avatar` is the shape
 * this system gives a *person*, and a clinic is not one. The muted fill gives a
 * transparent PNG something to sit on, so a white wordmark stays visible.
 */
export function ClinicLogo({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-lg bg-muted ring-1 ring-border',
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data: URI has nothing for the image optimizer to do.
        <img src={src} alt={alt} className="size-full object-contain" />
      ) : (
        <Icon name="contact" className="size-1/2 text-muted-foreground" />
      )}
    </span>
  );
}

export function ClinicLogoField({
  name = 'value',
  defaultValue,
  validationKey,
}: {
  /** The form field the data URI posts under. */
  name?: string;
  defaultValue: string | null;
  validationKey?: string;
}) {
  const t = useTranslations('clinicProfile');
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [failed, setFailed] = useState(false);

  async function pick(file: File | undefined): Promise<void> {
    if (!file) return;
    setFailed(false);
    try {
      setValue(await resizeToDataUrl(file));
    } catch {
      // A file the browser cannot decode — a renamed .txt, a corrupt PNG.
      // Reported in place rather than thrown: nothing else has gone wrong.
      setFailed(true);
    }
  }

  function clear(): void {
    setValue(null);
    setFailed(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  const errorId = 'clinic-logo-error';
  const invalid = failed || Boolean(validationKey);

  return (
    <Field data-invalid={invalid || undefined}>
      <div className="flex flex-wrap items-center gap-4">
        <ClinicLogo src={value} alt={t('logoPreviewAlt')} className="size-20" />

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="neutral" size="sm" onClick={() => inputRef.current?.click()}>
              <Icon name="upload" />
              {value ? t('logoReplace') : t('logoUpload')}
            </Button>
            {value ? (
              <Button type="button" variant="destructiveGhost" size="sm" onClick={clear}>
                {t('logoRemove')}
              </Button>
            ) : null}
          </div>
          <p className="text-caption text-muted-foreground">{t('logoHint')}</p>
        </div>
      </div>

      {/*
        Off-screen rather than `hidden`: a `display: none` file input cannot be
        opened by `.click()` in every browser, and it drops out of the
        accessibility tree along with its label.
      */}
      <input
        ref={inputRef}
        id="clinic-logo"
        type="file"
        accept={ACCEPTED}
        aria-label={t('logo')}
        className="sr-only"
        aria-describedby={invalid ? errorId : undefined}
        onChange={(event) => {
          void pick(event.target.files?.[0]);
        }}
      />

      {/* What the action actually reads. */}
      <input type="hidden" name={name} value={value ?? ''} />

      {invalid ? (
        <FieldError id={errorId}>
          {/*
            The cast narrows an arbitrary string back to the message catalogue's
            own key union. The action only ever sends `invalidImage` for this
            field — the dialog's generic state type is what widens it to
            `string` on the way here.
          */}
          {t(`validation.${validationKey ?? 'invalidImage'}` as 'validation.invalidImage')}
        </FieldError>
      ) : null}
    </Field>
  );
}
