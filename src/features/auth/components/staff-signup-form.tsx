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

import { signUpStaff } from '@/features/auth/actions';
import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { GoogleButton } from '@/features/auth/components/google-button';
import { PasswordInput } from '@/features/auth/components/password-input';
import { PasswordRules } from '@/features/auth/components/password-rules';
import { VerifyEmailNotice } from '@/features/auth/components/verify-email-notice';
import { initialAuthState } from '@/features/auth/form-state';
import { clientPasswordChecks } from '@/features/auth/password-policy';
import {
  readSignUpForm,
  signUpFieldErrors,
  type SignUpFieldErrors,
} from '@/features/auth/signup-validation';
import { MAX_NAME_PART_LENGTH } from '@/features/auth/schema';
import { FieldError } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type Locale } from '@/i18n/routing';

type StaffSignUpFormProps = {
  locale: Locale;
  /** False when this deployment has no Google credentials — see `isGoogleEnabled`. */
  showGoogle: boolean;
};

export function StaffSignUpForm({ locale, showGoogle }: StaffSignUpFormProps) {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const [state, formAction] = useActionState(signUpStaff, initialAuthState);
  const [fieldErrors, setFieldErrors] = useState<SignUpFieldErrors>({});

  /*
    The two password values, mirrored into state purely so the rule track and
    the match line have something to read. Straight from `SetPasswordForm`,
    which is the screen this behaviour was asked to match — read that file for
    the reasoning behind each piece; only what differs is noted here.

    The inputs stay uncontrolled — `Input` runs its own text layer for the
    Arabic glyph repair — so this is a copy kept in step by the form's own
    `onChange`, not the source of truth. The DOM is, which is also what
    `new FormData(form)` reads on submit, so the two cannot disagree about what
    is being sent.
  */
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const rulesId = useId();

  /*
    Whether the password box has satisfied all three rules — and therefore
    whether the confirm box and the button are open for business.

    ⚠ **This reads the same three stops the track draws, and nothing else.** Not
    the schema, which also refuses the handful of common passwords — that check
    has no stop on the track, so gating on it would let a value light all three
    bars and leave the button dead with nothing on screen explaining why. A
    common password that clears the three rules therefore submits, and
    `passwordTooCommon` comes back and says so in words.

    The invariant worth keeping: **three lit stops always means a live button.**
  */
  const checks = clientPasswordChecks(password);
  const passwordReady = checks.length && checks.letter && checks.digit;

  const matches = password !== '' && password === confirmPassword;

  /*
    ⚠ **Only safe because a mismatch is visible before the press.**
    `reportMismatchOnBlur` puts the red line under the confirm box the moment
    the reader leaves it holding something different, so a dead button always
    has its reason stated next to it. If that handler ever goes, this condition
    has to go with it.

    The four fields above the passwords are deliberately *not* part of this. A
    button that stays dead until a five-field form is perfect is a button that
    spends most of its life dead, and an empty name has no live cue of its own
    the way the rule track and the mismatch line are — `validateBeforeSubmit`
    answers those on the press, which is where §Fields and forms puts them.
  */
  const canSubmit = passwordReady && matches;

  /**
   * Checks the form in Arabic before the browser can check it in English.
   *
   * `noValidate` below is what silences the native bubble; without something
   * taking its place the form would simply post four empty strings and wait for
   * the round trip to say so. See `signup-validation.ts` for why the bubble had
   * to go rather than be translated.
   */
  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>): void {
    const errors = signUpFieldErrors(readSignUpForm(new FormData(event.currentTarget)));
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
   * On blur rather than per keystroke, which is what §Fields and forms asks for
   * and is also the only sensible reading: half of a password is not a
   * mismatch, it is someone still typing.
   *
   * ⚠ **Both boxes are watched, not just the second one.** Going back to change
   * the first password after the two already agreed breaks the match just as
   * surely as mistyping the second — and in that direction the only cue would
   * otherwise be the green line quietly disappearing, which is an absence
   * rather than a message.
   *
   * `onBlur` goes on the form rather than the field because React's version of
   * it bubbles, so one handler covers both boxes.
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
  function clearCorrectedField(event: ChangeEvent<HTMLFormElement>): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const { name, value } = event.target;

    if (name === 'password') setPassword(value);
    if (name === 'confirmPassword') setConfirmPassword(value);

    setFieldErrors((current) => {
      const field = name as keyof SignUpFieldErrors;
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      // Retyping either password answers a mismatch, whichever box it was
      // reported on.
      if (field === 'password') delete next.confirmPassword;
      return next;
    });
  }

  /*
    Sign-up succeeded and issued no session — the account is waiting on the link
    that just went out. The notice is shared with `/verify-email` so both places
    offer the same resend.
  */
  if (state.status === 'sent') {
    return <VerifyEmailNotice locale={locale} email={state.email} sendFailed={state.deliveryFailed} bare />;
  }

  return (
    <div className="w-full">
      {/* No heading and no intro line — the screen's `h1` already reads
          "Create a clinic team account". See `StaffLoginForm`. */}
      {/*
        `noValidate`, and every `required` / `minLength` / `type="email"` rule
        below now lives in `signUpSchema` instead.

        The browser's own checks were the only thing on this screen that spoke
        English: the bubble is drawn by the browser in the browser's locale, and
        it cannot be translated, restyled or repositioned. An Arabic clinic on an
        English Chrome got "Please include an '@' in the email address" in a grey
        OS tooltip pointing at a right-to-left form. `type="email"` stays on the
        input because it selects the right on-screen keyboard on a phone; it is
        `noValidate` that stops it from being enforced by the browser.
      */}
      <form
        action={formAction}
        noValidate
        onSubmit={validateBeforeSubmit}
        onChange={clearCorrectedField}
        onBlur={reportMismatchOnBlur}
        className="space-y-4 short:space-y-3"
      >
        <input type="hidden" name="locale" value={locale} />

        {/*
          The two halves sit side by side on one row rather than stacked. They
          are one answer — a name — and a form that spends two full-width rows
          on it reads as twice the work; the pair also stays under the fold on a
          phone, where this form is already five fields long. `sm:` because at
          320px two ten-character boxes are narrower than the text in them.
        */}
        <div className="grid gap-4 sm:grid-cols-2 short:gap-3">
          <div className="space-y-2">
            <Label htmlFor="signup-first-name">{t('firstName')}</Label>
            <Input
              id="signup-first-name"
              name="firstName"
              autoComplete="given-name"
              maxLength={MAX_NAME_PART_LENGTH}
              aria-required
              aria-invalid={Boolean(fieldErrors.firstName)}
              aria-describedby={fieldErrors.firstName ? 'signup-first-name-error' : undefined}
              placeholder={t('firstNamePlaceholder')}
              icon="person"
            />
            {fieldErrors.firstName ? (
              <FieldError id="signup-first-name-error">{t(fieldErrors.firstName, { count: MAX_NAME_PART_LENGTH })}</FieldError>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-last-name">{t('lastName')}</Label>
            <Input
              id="signup-last-name"
              name="lastName"
              autoComplete="family-name"
              maxLength={MAX_NAME_PART_LENGTH}
              aria-required
              aria-invalid={Boolean(fieldErrors.lastName)}
              aria-describedby={fieldErrors.lastName ? 'signup-last-name-error' : undefined}
              placeholder={t('lastNamePlaceholder')}
              icon="person"
            />
            {fieldErrors.lastName ? (
              <FieldError id="signup-last-name-error">{t(fieldErrors.lastName, { count: MAX_NAME_PART_LENGTH })}</FieldError>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-email">{tCommon('email')}</Label>
          {/* No `dir="ltr"` — see the note on the same field in `StaffLoginForm`. */}
          <Input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            aria-required
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'signup-email-error' : undefined}
            placeholder={t('emailPlaceholder')}
            icon="email"
          />
          {fieldErrors.email ? (
            <FieldError id="signup-email-error">{t(fieldErrors.email)}</FieldError>
          ) : null}
        </div>

        <PasswordInput
          name="password"
          label={tCommon('password')}
          autoComplete="new-password"
          nativeRequired={false}
          placeholder={t('passwordPlaceholder')}
          error={fieldErrors.password ? t(fieldErrors.password) : undefined}
          describedBy={rulesId}
          /*
            The rule track replaces the hint sentence that stood here.

            That sentence carried three rules at once and could not say which of
            them you had already satisfied, so someone seven characters in read
            exactly what someone who had typed nothing read. It also stated the
            *old* staff rule — ten characters, letters with numbers or symbols —
            which is no longer what the server enforces.

            `footer`, not `hint`: a hint is displaced by the error, and these
            are at their most useful in the one moment an error is on screen.
          */
          footer={<PasswordRules id={rulesId} value={password} className="mt-2" />}
        />

        {/*
          Shut until the box above is right. There is nothing to confirm before
          then, and a second copy of a password that is about to be rejected is
          work the reader will have to redo.

          It carries no hint of its own. A control that refuses input without
          saying why is how this pattern usually goes wrong, and what keeps this
          one honest is the rule track directly above it: the grey bar is
          already naming the requirement that has not been met, immediately next
          to the box waiting on it.
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
            Confirming out loud, rather than only ever complaining. Both boxes
            are masked, so without this the only way to be sure the two agree is
            to reveal them both and compare by eye.
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
          Live only once both password boxes are right — see `canSubmit`, and
          the warning there about what has to stay on screen for this to be
          fair. Every state that holds it shut names itself somewhere the reader
          is already looking: the rule track's grey bar for a rule not yet met,
          the red line under the second box for a mismatch.
        */}
        <AuthSubmitButton label={t('signUpSubmit')} disabled={!canSubmit} />
      </form>

      {/*
        Below the password, in the same place sign-in puts its alternates: the
        two screens are one card that flips, and a control that jumps from above
        the form to below it as it flips reads as a different screen rather than
        as the other face of the same one.

        It is the same button as on the sign-in page, and deliberately so: with
        OAuth there is no separate "register" step — the first time through
        creates the account. It also skips the verification gate entirely,
        because Google has already proven the address belongs to them.
      */}
      {showGoogle ? (
        <>
          {/* The same rule sign-in draws — see `StaffLoginForm` for the tokens
              and for why there is no `uppercase` on it. The two faces of this
              screen must not disagree about a divider. */}
          <div className="my-4 short:my-2.5 flex items-center gap-3.5 text-caption font-semibold text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t('orUsePassword')}
            <span className="h-px flex-1 bg-border" />
          </div>

          {/* The only place that passes `requestSignUp` — this is the enrolment door. */}
          <GoogleButton locale={locale} requestSignUp />
        </>
      ) : null}
    </div>
  );
}
