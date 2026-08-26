'use client';

import { useTranslations } from 'next-intl';
import {
  useActionState,
  useId,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
} from 'react';

import { setPortalPassword } from '@/features/auth/actions';
import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { PasswordInput } from '@/features/auth/components/password-input';
import { PasswordRules } from '@/features/auth/components/password-rules';
import { initialAuthState } from '@/features/auth/form-state';
import { clientPasswordChecks } from '@/features/auth/password-policy';
import {
  readSetPasswordForm,
  setPasswordFieldErrors,
  type SetPasswordFieldErrors,
} from '@/features/auth/set-password-validation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { type Locale } from '@/i18n/routing';

/**
 * Forced first-sign-in change. A client lands here holding a dietitian-issued
 * temporary password and cannot reach the rest of the portal until they
 * replace it — see the guard in `src/app/[locale]/portal/(secured)/layout.tsx`.
 *
 * ## What this screen has to get right
 *
 * It is the first thing a new client ever does in the portal, they cannot skip
 * it, and they are being asked to invent something that satisfies rules nobody
 * has told them. Everything below follows from that:
 *
 * - the rules are on screen from the start and tick off as they are met
 *   (`PasswordRules`), rather than being revealed one failure at a time;
 * - the confirm box stays shut until those rules are met, and the button until
 *   the two boxes agree, so the screen asks for one thing at a time — see
 *   `passwordReady` and `canSubmit` for why each of those is only defensible
 *   with its reason already on screen;
 * - the second box says so out loud when it matches, and says so on blur when
 *   it does not, so nobody has to reveal both fields and compare them by eye;
 * - the messages are the page's own, in the page's language, because the
 *   browser's are neither — see `set-password-validation.ts`.
 */
export function SetPasswordForm({ locale }: { locale: Locale }) {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const [state, formAction] = useActionState(setPortalPassword, initialAuthState);
  const [fieldErrors, setFieldErrors] = useState<SetPasswordFieldErrors>({});

  /*
    The two values, mirrored into state purely so the rule list and the match
    line have something to read.

    The inputs stay uncontrolled — `Input` runs its own text layer for the
    Arabic glyph repair and is happiest owning its value — so this is a copy
    kept in step by the form's own `onChange`, not the source of truth. The
    source of truth is the DOM, which is also what `new FormData(form)` reads on
    submit, so the two cannot disagree about what is being sent.
  */
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const rulesId = useId();

  /*
    Whether the first box has satisfied all three rules — and therefore whether
    the second box and the button are open for business.

    ⚠ **This reads the same three stops the track draws, and nothing else.**
    `isStrongClientPassword` would have been the closer match to the server, but
    it also refuses the handful of common passwords, and that check has no stop
    on the track. Gating on it would let a value light all three stops and leave
    the button dead with nothing on screen explaining why — the exact failure a
    disabled control has to avoid. A common password that clears the three rules
    therefore submits, and `passwordTooCommon` comes back and says so in words.

    The invariant worth keeping: **three lit stops always means a live button.**
  */
  const checks = clientPasswordChecks(password);
  const passwordReady = checks.length && checks.letter && checks.digit;

  const matches = password !== '' && password === confirmPassword;

  /*
    The button waits for the two boxes to agree, not merely for the first one to
    be valid.

    ⚠ **This is only safe because a mismatch is visible before the press.**
    `reportMismatchOnBlur` below puts the red line under the confirm box the
    moment the reader leaves it holding something different, so a dead button
    always has its reason stated next to it — the same bargain the rule track
    makes for `passwordReady`. Without that, a single typo in the second box
    would leave someone staring at a control that refuses to work and no words
    anywhere on the screen explaining it. If that blur handler ever goes, this
    condition has to go with it.
  */
  const canSubmit = passwordReady && matches;

  /**
   * Checks the form in Arabic before the browser can check it in English.
   *
   * `noValidate` below is what silences the native bubble; without something
   * taking its place the form would post two empty strings and wait for the
   * round trip to say so. `set-password-validation.ts` is why the bubble had to
   * go rather than be translated — and it is the same module the server action
   * answers with, so a value that slips past here meets the identical sentence
   * rather than a second opinion.
   */
  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>): void {
    const errors = setPasswordFieldErrors(readSetPasswordForm(new FormData(event.currentTarget)));
    setFieldErrors(errors);

    if (Object.keys(errors).length === 0) return;

    event.preventDefault();
    // The first field that is wrong, not the first field on the form: being
    // dropped on the box that needs attention is the whole point of catching
    // this here rather than on the server.
    window.setTimeout(() => {
      event.currentTarget?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }, 0);
  }

  /**
   * Says the two do not match, once the reader has finished with the box.
   *
   * On blur rather than per keystroke, which is what §Fields and forms asks
   * for and is also the only sensible reading: half of "tuffah24" is not a
   * mismatch, it is someone still typing, and a box that turns red at the
   * second character and green at the eighth is worse than one that waits.
   *
   * ⚠ **Both boxes are watched, not just the second one.** Going back to change
   * the first password after the two already agreed breaks the match just as
   * surely as mistyping the second — and in that direction the only cue would
   * otherwise be the green line quietly disappearing, which is an absence
   * rather than a message. Leaving either box is the moment to say so.
   *
   * `onBlur` is put on the form rather than the field because React's version
   * of it bubbles, so one handler covers both boxes and keeps the rule in one
   * place.
   */
  function reportMismatchOnBlur(event: FocusEvent<HTMLFormElement>): void {
    if (!(event.target instanceof HTMLInputElement)) return;

    const { name, value } = event.target;
    if (name !== 'password' && name !== 'confirmPassword') return;

    /*
      The box being left holds the newer value — `onChange` has already run for
      it, but reading it directly is what makes this correct whatever order the
      two events arrive in. Its sibling comes from state.
    */
    const first = name === 'password' ? value : password;
    const second = name === 'confirmPassword' ? value : confirmPassword;

    // An empty second box is not a mismatch. Someone who tabbed past it has not
    // made a mistake yet, and the submit path already answers a blank one.
    if (second === '' || second === first) return;

    setFieldErrors((current) => ({ ...current, confirmPassword: 'passwordMismatch' }));
  }

  /** A field stops being wrong the moment it is edited — and the rules re-read. */
  function handleChange(event: ChangeEvent<HTMLFormElement>): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const { name, value } = event.target;

    if (name === 'password') setPassword(value);
    if (name === 'confirmPassword') setConfirmPassword(value);

    setFieldErrors((current) => {
      const field = name as keyof SetPasswordFieldErrors;
      if (!current[field]) return current;

      const next = { ...current };
      delete next[field];
      // Retyping either box answers a mismatch, which is only ever reported on
      // the second one.
      if (field === 'password') delete next.confirmPassword;
      return next;
    });
  }

  return (
    <Card className="w-full max-w-md">
      {/*
        Centred, with the mark on top. This is a single-purpose screen with one
        card on it and no siblings to align to, so the column reads as the
        subject of the page rather than as one panel among several — which is
        the shape `EmptyState` takes for the same reason, and the medallion
        below is its circle, at its size, on its tokens.

        `justify-items-center` rather than `items-center`: `CardHeader` is a
        grid, so it is the inline axis that needs centring and `items-*` would
        only move the rows against each other.
      */}
      <CardHeader className="justify-items-center gap-3 text-center">
        {/*
          `bg-secondary` at half strength. The token is already `--green-50`,
          the lightest step the brand ramp has, so there is nothing further down
          to reach for — the opacity modifier is what takes it the rest of the
          way, letting the card's own surface through rather than inventing a
          paler green the system does not have. It is the same move `EmptyState`
          makes with `bg-muted/40`.

          The glyph's colour is `q-set-password-mark` in `globals.css`, which is
          where the note on why it is a one-off rather than a scale step lives.
        */}
        <span
          aria-hidden
          className="q-set-password-mark flex size-12 items-center justify-center rounded-full bg-secondary/50"
        >
          <Icon name="lock" className="size-5" />
        </span>

        <div className="space-y-1.5">
          {/* A real heading, not a label: the portal header above carries a
              name rather than a title, so this card is the only thing on the
              screen a screen reader can navigate to. `h2` is the highest tag
              `CardTitle` offers, and deliberately — see the note on `as`. */}
          <CardTitle as="h2">{t('setPasswordHeading')}</CardTitle>
          <CardDescription className="text-balance">{t('setPasswordDescription')}</CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {/*
          `noValidate`, and the `required` / `minLength` rules that used to sit
          on the inputs now live in `setPasswordSchema` instead.

          The browser's own checks were the only thing on this screen that spoke
          English: the bubble is drawn by the browser in the browser's locale and
          cannot be translated, restyled or repositioned. An Arabic client on an
          English Chrome got a grey OS tooltip pointing at a right-to-left form.
        */}
        <form
          action={formAction}
          noValidate
          onSubmit={validateBeforeSubmit}
          onChange={handleChange}
          onBlur={reportMismatchOnBlur}
          className="space-y-5"
        >
          <input type="hidden" name="locale" value={locale} />

          <PasswordInput
            name="password"
            label={tCommon('password')}
            autoComplete="new-password"
            nativeRequired={false}
            placeholder={t('passwordPlaceholder')}
            error={fieldErrors.password ? t(fieldErrors.password) : undefined}
            describedBy={rulesId}
            /*
              The rules go in `footer`, not `hint`: a hint is displaced by the
              error, and these are at their most useful in the one moment an
              error is on screen.
            */
            footer={<PasswordRules id={rulesId} value={password} className="mt-2" />}
          />

          {/*
            Shut until the first box is right. There is nothing to confirm
            before then, and a second copy of a password that is about to be
            rejected is work the reader will have to redo.

            It carries no hint of its own. A control that refuses input without
            saying why is how this pattern usually goes wrong, and what keeps
            this one honest is the rule track directly above it: the grey bar is
            already naming the requirement that has not been met, immediately
            next to the box that is waiting on it. A sentence under the field
            repeating that was the same answer twice.
          */}
          <PasswordInput
            name="confirmPassword"
            label={t('confirmPassword')}
            autoComplete="new-password"
            nativeRequired={false}
            placeholder={t('confirmPasswordPlaceholder')}
            disabled={!passwordReady}
            error={fieldErrors.confirmPassword ? t(fieldErrors.confirmPassword) : undefined}
            /*
              Confirming out loud, rather than only ever complaining.

              Both boxes are masked, so without this the only way to be sure the
              two agree is to reveal them both and compare by eye. A line that
              appears the moment they match answers the question the second box
              exists to ask — and it is the affirmative half of the same
              feedback the rules give above, never a red state while typing.
            */
            footer={
              matches ? (
                <p className="mt-2 flex items-center gap-1.5 text-caption text-primary motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
                  <Icon name="check" className="size-3.5" />
                  <span>{t('passwordsMatch')}</span>
                </p>
              ) : null
            }
          />

          <AuthFormMessage state={state} />

          {/*
            Live only once the whole form is right — see `canSubmit`, and the
            warning there about what has to stay on screen for this to be fair.

            Every state that holds it shut names itself somewhere the reader is
            already looking: the rule track's grey bar for a rule not yet met —
            which is also what the locked confirm box is waiting on — and the
            red line under the second box for a mismatch. That is the whole
            condition for disabling a control in this app.
          */}
          <AuthSubmitButton label={t('setPasswordSubmit')} disabled={!canSubmit} />
        </form>
      </CardContent>
    </Card>
  );
}
