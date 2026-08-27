'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Switch } from '@/components/ui/switch';
import { SettingsLabel } from '@/features/portal/components/settings-section';
import { InstallInstructionsDialog } from '@/features/portal/pwa/install-instructions-dialog';
import { type Direction, type Locale } from '@/i18n/routing';

import { isPushToggleable } from './push-state';
import { usePushSubscription } from './use-push-subscription';

/**
 * "Notifications on this device" — the one control that turns real push
 * notifications on, and the only place in the app that asks for notification
 * permission.
 *
 * ## Why it sits above the four consent switches and is not one of them
 *
 * The four below it answer *what the clinic may tell you*, and they have
 * answered that since before this feature existed — they gate WhatsApp too, and
 * a client who turns appointment reminders off is not reminded on any channel.
 * This one answers *where a notification may be delivered*, and its answer is
 * specific to the phone in the client's hand: the same account on a laptop is a
 * separate device with its own answer.
 *
 * Keeping them apart is what makes both readable. Folded together, a client who
 * switched their tablet off would appear to have withdrawn consent, and the
 * dietitian's WhatsApp reminder would stop with it.
 *
 * ## Why it is a switch and not a banner
 *
 * ⚠ **The permission prompt has to come from a gesture**, and it may only be
 * asked once — a client who dismisses it can never be asked again by this app,
 * only by digging through system settings. So it is never requested on arrival,
 * never from an effect, and never on the home screen: it is asked when somebody
 * has come to the notifications screen and pressed the switch, which is the one
 * moment they are certain to understand what is being asked and why.
 *
 * The five states come from `resolvePushState`; three of them are not switches
 * at all, because a control that cannot work must say why rather than move and
 * do nothing.
 */
export function EnablePushRow({ locale, dir }: { locale: Locale; dir: Direction }) {
  const t = useTranslations('portal.settings.notifications.device');
  const { state, ready, busy, unconfigured, enable, disable } = usePushSubscription(locale);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  /*
    No keypair on this deployment: there is nothing behind the switch, and a
    client cannot set an environment variable. Rendering nothing is the honest
    answer, and it keeps a checkout with no VAPID keys looking exactly as it did
    before this feature existed — the same posture `config.ts` takes on the
    server.
  */
  if (unconfigured) return null;

  const labelId = 'setting-push-device';

  const description =
    state === 'blocked'
      ? t('blocked')
      : state === 'needs-install'
        ? t('needsInstall')
        : state === 'unsupported'
          ? t('unsupported')
          : t('description');

  /*
    iOS in a browser tab. Not a failure and not a refusal — Safari has
    supported Web Push since 16.4, for a web app on the Home Screen only — so
    the row becomes the way *in* to the install walkthrough the portal already
    has, rather than a dead switch beside an explanation.
  */
  if (state === 'needs-install') {
    return (
      <>
        <button
          type="button"
          onClick={() => setInstallDialogOpen(true)}
          className="-mx-2 flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-2.5 text-start transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo focus-visible:outline-none"
        >
          <SettingsLabel id={labelId} label={t('label')} description={description} />
        </button>

        <InstallInstructionsDialog
          open={installDialogOpen}
          onClose={() => setInstallDialogOpen(false)}
          dir={dir}
        />
      </>
    );
  }

  const toggleable = isPushToggleable(state);

  return (
    <div className="flex items-center gap-3 py-1">
      <SettingsLabel id={labelId} label={t('label')} description={description} />

      {/*
        `blocked` and `unsupported` keep the switch, disabled and off, rather
        than dropping it: the row is one of a list of switches, and removing
        the control would leave a line of text that reads as a heading. The
        description carries the reason, which is what a client can act on —
        for `blocked`, that means their own browser settings, because the
        permission prompt will not be shown again.
      */}
      {/*
        `onClick`, not an `onCheckedChange` — this `Switch` is a `<button>`
        rather than a Radix root (see the note on the component), and every
        other switch in the app is the submit control of its own form. This one
        cannot be: subscribing needs the browser's permission prompt and the
        `PushManager`, neither of which a form post can reach, so it is the one
        switch in the portal that genuinely requires JavaScript. A client with
        it off sees the row and a control that does not move, which is the
        truth about what their browser can do here.
      */}
      <Switch
        checked={state === 'on'}
        disabled={!ready || busy || !toggleable}
        aria-labelledby={labelId}
        onClick={() => {
          void (state === 'on' ? disable() : enable());
        }}
      />
    </div>
  );
}
