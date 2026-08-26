'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { useDialogPresence } from '@/components/ui/dialog-motion';
import { FieldError, FieldHint } from '@/components/ui/field';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon, type IconName } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { ROW_ACTION_CLASS } from '@/features/billing/components/row-action';
import { initialBillingFormState, type BillingFormState } from '@/features/billing/form-state';
import { formatAmountCompact, keypadReadout, parseAmount, toAmountInput, toKeypadDigits } from '@/features/billing/money';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { parseDateInput, type IsoDate } from '@/lib/iso-date';
import { cn } from '@/lib/utils';

/**
 * The keypad card, for both sides of the ledger.
 *
 * An amount at display size, one pill under it saying which kind of entry it
 * is, the day it happened, and a single full-width button. `RecordPaymentDialog`
 * is this with the ways money is taken in the pill; `RecordChargeDialog` is this
 * with the services a clinic bills for. Nothing else differs, which is the point
 * — the two halves of a ledger are entered the same way, so nobody has to learn
 * a second card to record the other side of the same visit.
 *
 * ## Why the pieces are props and not two components
 *
 * The card was written for payments and copied for charges once before, as a
 * stack of labelled fields; the two then drifted on the things a reader notices
 * — where the date sat, how the amount was typed, whether the button filled the
 * footer. What varies between them is genuinely small: a list of options, the
 * name each posts under, and the words. Everything that governs how the card
 * behaves — the keypad, the sliding pill, the date row, the close-on-success —
 * lives here once and cannot diverge again.
 *
 * ## The amount is a text field
 *
 * `type="number"` looks right and is wrong for money. It lets a browser's
 * spinner change an amount by a scroll of the wheel over the field, it accepts
 * `1e3`, and its per-locale decimal handling silently disagrees with what the
 * server parses. This is a text input read by `parseAmount` — the same function
 * the schemas use — so what is typed and what is stored cannot drift apart.
 * Arabic-Indic digits are accepted, because this clinic's keyboards produce
 * them.
 *
 * Nothing here contacts a bank and no card details are asked for or accepted;
 * see the header of `src/db/schema/billing.ts`. The wording follows: "Record a
 * payment", never "Pay".
 */

/** One option on the pill: what it posts, how it is drawn, what it is called. */
export type KeypadOption = {
  value: string;
  icon: IconName;
  /** The pill's own tint when this option is the chosen one. */
  className: string;
  label: string;
  /**
   * What choosing this option costs, in minor units — for a card that does not
   * collect an amount of its own. `null` means the option has no price set;
   * `undefined` means prices are not this card's business, which is the wallet,
   * where the amount is the keypad.
   *
   * A price *per option* rather than one on the card, because the card cannot
   * ask the caller which option is chosen — that lives in here.
   */
  amountMinor?: number | null;
  /**
   * Anything else this option posts, as name/value pairs.
   *
   * A service posts its key beside the words it is billed under: the words are
   * what the bill says, the key is what a rule can be written against. The card
   * has no opinion on either — it renders what the option carries.
   */
  posts?: Record<string, string>;
  /**
   * Whether this option cannot be picked at all — a subscription for somebody
   * who is already inside a term.
   *
   * The row stays in the list rather than being filtered out of it: a service
   * that vanishes reads as a service the clinic stopped offering, and the
   * reader has no way to find out why. Greyed, with {@link KeypadOption.note}
   * under it saying when it comes back, the list still says what this clinic
   * sells and what is available today.
   *
   * The card will not open on a disabled option and will not submit one, but
   * the rule itself lives in `recordCharge` — see the note there on why a
   * card cannot be the only place a rule is enforced.
   */
  disabled?: boolean;
  /**
   * A line under the answer, when this option needs one — "the first
   * consultation is free". Shown only while the option is chosen, because it is
   * a fact about the entry being made and not about the list.
   *
   * On a {@link KeypadOption.disabled} option it is the reason instead, and it
   * is drawn in the menu row rather than under the answer — the reader needs it
   * while they are looking at the greyed-out row, not after choosing something
   * else.
   */
  note?: string;
};

export type BillingKeypadDialogProps = {
  locale: Locale;
  clientId: string;
  /** Today, in the clinic's zone, resolved on the server. See the Bills page. */
  today: string;
  /** The mark on the row button and in the card's heading. */
  icon: IconName;
  /** The server action the form posts to. */
  action: (previous: BillingFormState, formData: FormData) => Promise<BillingFormState>;
  /** The pill's options, in the order they are offered. First is the default. */
  options: KeypadOption[];
  /** The form field the chosen option posts under — `method`, `description`. */
  optionName: string;
  /** The form field the date posts under — `paidOn`, `chargedOn`. */
  dateName: string;
  /**
   * How the card is opened.
   *
   * `icon` is the register's: a row has four controls and no width for words,
   * so the mark carries the meaning and the name is announced rather than
   * drawn. `button` is for a panel that has the room — a record's Expenses
   * view — where an icon alone would be a control somebody has to press to find
   * out what it does.
   *
   * `emphasis` picks the button's weight where there is more than one on a row:
   * a screen should have one primary action, and the rest should look like the
   * alternatives they are.
   */
  trigger?: 'icon' | 'button';
  emphasis?: 'primary' | 'secondary';
  /**
   * Whether the card collects an amount.
   *
   * A payment is a figure, and the keypad is the card. A charge here is not:
   * the clinic records *which service was given* and settles the money on the
   * payment side, so that card is the same one with its top half gone — the
   * option becomes a labelled row beside the date, and `amount` posts zero
   * because `recordChargeSchema` requires the field and allows a zero on it.
   * A charge of nothing is a real entry: the visit happened and was not
   * billed, which is a different fact from never having been written down.
   */
  amount?: boolean;
  /**
   * The most this card may record, in minor units — what the subscriber still
   * owes, for the payment card. `undefined` on a card with no ceiling.
   *
   * Nobody pays more than they owe: the button will not commit a figure above
   * this, and `labels.overMax` says so while it is being typed rather than
   * after it is sent. The rule is enforced in `recordPayment`, which is where
   * it is true — this is where it is visible.
   *
   * A refund is a negative figure and is never capped: money going back out
   * cannot take an account past settled.
   */
  maxMinor?: number;
  labels: {
    title: string;
    open: string;
    openFor: string;
    close: string;
    /** Only read when `amount` is on; a card without a keypad has no use for them. */
    amount?: string;
    amountHint?: string;
    /** What is still outstanding, drawn under the keypad while it is being typed. */
    owed?: string;
    /** Shown in its place once the figure is past {@link BillingKeypadDialogProps.maxMinor}. */
    overMax?: string;
    /** The pill's accessible name: "Method", "Service".  */
    option: string;
    /** The answer line under the rule — what this entry does to the account. */
    answer?: string;
    /** The toast once it is written — "Payment recorded", "Charge added". */
    saved: string;
    /**
     * Shown in place of the figure when the chosen option has no price.
     *
     * Only reached by a card whose options carry prices, and it says where the
     * price is set rather than that there is not one: a reader looking at a
     * charge they cannot record needs the next step, not the diagnosis.
     */
    noPrice?: string;
    date: string;
    datePlaceholder: string;
    openDatePicker: string;
    submit: string;
    saving: string;
  };
};

export function BillingKeypadDialog({
  locale,
  clientId,
  today,
  icon,
  action,
  options,
  optionName,
  dateName,
  maxMinor,
  amount = true,
  trigger = 'icon',
  emphasis = 'secondary',
  labels,
}: BillingKeypadDialogProps) {
  /* Only the error line is read from the catalogue here: the action reports a
     key, and both dialogs share one `billing.errors` namespace. Every other
     word on the card is a prop, because the two cards say different ones. */
  const t = useTranslations('billing');
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialBillingFormState);
  const present = useDialogPresence(open);

  const [chosenValue, setChosenValue] = useState<string>(firstChoice(options));
  /*
    The keypad's digits, not the string on screen. Whole shekels, no separators
    and no point — the readout is derived from them by `keypadReadout`, so the
    grouping and the grey agorot are a function of the number rather than
    something the reader has to type around or can key into by accident.
  */
  const [digits, setDigits] = useState('');
  const [paidOn, setPaidOn] = useState<IsoDate>(today as IsoDate);
  /*
    What the date field is showing, which is not always a date.

    Mid-typing, `2026-08-` is not a day and cannot be stored as one, so the
    characters live here and only a parsed value reaches `paidOn`. The pair
    is the same one the appointment dialog keeps, for the same reason: a
    field that rewrote itself on every keystroke could not be typed into.
  */
  const [dateText, setDateText] = useState<string>(today);

  /*
    Typed dates land here on blur and on Enter. `parseDateInput` takes the
    two forms staff actually type; anything else snaps the field back to the
    day that is really stored, rather than leaving a string on screen that
    the form is not going to post.
  */
  const commitDateText = (raw: string) => {
    const parsed = parseDateInput(raw);

    if (!parsed) {
      setDateText(paidOn);
      return;
    }

    setPaidOn(parsed);
    setDateText(parsed);
  };

  /* The picker writes both halves — the stored day and what is on screen. */
  const chooseDate = (next: IsoDate) => {
    setPaidOn(next);
    setDateText(next);
  };
  /*
    The sliding tint, as a box rather than a class on a row.

    One wash that moves is not the same picture as two washes taking turns:
    the row a pointer leaves has to fade out while the row it arrives at
    fades in, and for the eye that is a blink, not a movement. So the tint is
    a single absolutely-positioned box behind the rows, and moving to another
    option animates its offset and its height — it travels the distance, the
    way the pill on a segmented control does.

    `null` until the menu has been laid out and measured. Rendering nothing
    until then is what keeps the first frame from sliding in from the top of
    the popup: the box appears already sitting on the chosen row.
  */
  const [tint, setTint] = useState<{ top: number; height: number } | null>(null);
  /* The rows themselves, so the tint can be sent to one by name. */
  const rows = useRef<Record<string, HTMLElement | null>>({});

  const moveTint = (value: string) => {
    const row = rows.current[value];
    /*
      `offsetTop` and not a bounding rect: the popup scales as it opens, and a
      rect measured mid-animation is a fraction of the size it is about to be.
      Offsets are layout, which the transform does not touch.
    */
    if (row) setTint({ top: row.offsetTop, height: row.offsetHeight });
  };

  const triggerRef = useRef<HTMLButtonElement>(null);

  /*
    Close once the write has landed — not optimistically on submit — and say so.

    Taken from the closing edge of `pending` rather than from a change in the
    status. Two entries in a row both end in `success`, so a status that has not
    changed is not the same as a submission that has not happened: watching the
    status alone left the *second* charge on an open card with no toast, because
    there was nothing to react to. The transition closing is what happens once
    per press.

    Guarded on `open`, so a `success` still sitting in action state cannot slam
    a freshly reopened card shut.
  */
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && state.status === 'success' && open) {
      setOpen(false);
      toast.success(labels.saved);

      /* The next entry starts from an empty keypad, not from this one. */
      setDigits('');
      setChosenValue(firstChoice(options));
      setPaidOn(today as IsoDate);
      setDateText(today);
    }

    wasPending.current = pending;
    /* A one-shot on the end of a submission. `labels`, `options` and `today` are
       the card's configuration, not reasons to re-run it. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state.status, open]);

  /* Focus goes back where it came from, on every close — Escape and the × as
     well as a successful write. */
  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const error = state.status === 'error' ? t(`errors.${state.messageKey}`) : null;

  /*
    What the account will be credited, echoed under the keypad. Straight through
    `parseAmount` and `formatAmount`, so the reader is shown the figure the
    server will store rather than the characters they typed — a stray letter or
    a third decimal place reads as nothing added, before they press the button.
  */
  /*
    Read back from the readout rather than from the digits, so the figure under
    the answer line is the one on the field — through the same parser the server
    runs, which is what makes an empty card read as `null` here and not as zero.
  */
  const readout = keypadReadout(locale, digits);
  const parsed = parseAmount(readout.entered);

  const chosen = options.find((entry) => entry.value === chosenValue) ?? options[0]!;

  /*
    Whether this card's options carry prices at all. `undefined` is the wallet,
    where the amount is the keypad and an option is only a method; a number or a
    `null` is a charge, where the price is the clinic's own and the option is
    what picks it.
  */
  /*
    Past what the account owes. Judged on the parsed figure rather than the
    digits, so it is the number the server would store that is being tested.
    A refund — a negative figure — is never over anything.
  */
  const over = maxMinor !== undefined && parsed !== null && parsed > maxMinor;

  const priced = !amount && chosen.amountMinor !== undefined;
  const unpriced = priced && chosen.amountMinor === null;

  /*
    One trigger, drawn two ways. The accessible name is `openFor` either way —
    "Record a payment for Sara" — because a screen reader hears the control out
    of its row, where "Record a payment" alone leaves four identical
    announcements down a register.
  */
  const control = (
    <Button
      ref={triggerRef}
      type="button"
      variant={trigger === 'icon' ? 'ghost' : emphasis === 'primary' ? 'default' : 'outline'}
      size={trigger === 'icon' ? 'icon' : 'default'}
      className={trigger === 'icon' ? ROW_ACTION_CLASS : undefined}
      onClick={() => setOpen(true)}
      aria-label={labels.openFor}
    >
      <Icon name={icon} className={trigger === 'icon' ? 'size-5' : 'size-4'} />
      {trigger === 'button' ? labels.open : null}
    </Button>
  );

  return (
    <>
      {/*
        Hovering the mark says what it does, in the app's own tooltip rather
        than the browser's `title` — which waits a second, draws itself in the
        system's font at the pointer, and on a touch screen never appears at
        all. Only the mark is wrapped: the labelled rendering has the same words
        printed on its face, and a tooltip repeating them is the button talking
        over itself. `shrink-0` because the wrapper is the flex item now, and
        the row it sits in is a tight one.
      */}
      {trigger === 'icon' ? (
        <TooltipHint label={labels.open} className="shrink-0">
          {control}
        </TooltipHint>
      ) : (
        control
      )}

      {present ? (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          label={labels.title}
          dir={getLocaleDirection(locale)}
          /* Not dismissible mid-write: the card guards a submission in flight. */
          dismissible={!pending}
        >
          <DialogHeader
            /*
              The mark travels *inside* the title rather than as the header's
              trailing child, which is where `DialogHeader` puts anything passed
              to it — that slot sits beside the ×, at the far end. Here it leads
              the heading, so it lands at the reading start in both languages:
              the right in Arabic, the left in English, and never on the wrong
              side of a mirrored layout.

              `aria-hidden`: the words beside it already name the card.
            */
            title={
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-sm border border-border text-muted-foreground"
                >
                  <Icon name={icon} className="size-4" />
                </span>
                {labels.title}
              </span>
            }
            onClose={pending ? undefined : () => setOpen(false)}
            closeLabel={labels.close}
          />

          <form action={formAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="clientId" value={clientId} />
            {/*
              The chosen pill's value, since the picker is not a `<select>`.

              `value`, not `label`: a payment posts `cash` and shows "Cash", while a
              charge posts the words themselves. Which of the two an option wants
              is the option's business, decided where the list is written.
            */}
            <input type="hidden" name={optionName} value={chosen.value} />

            {/*
              A card with no keypad posts the price of whatever was chosen — the
              schema wants an amount on every charge, and this is the one the
              clinic set. See `KeypadOption.amountMinor` and the settings section
              that fills it in.
            */}
            {amount ? null : (
              <input
                type="hidden"
                name="amount"
                value={chosen.amountMinor == null ? '' : toAmountInput(chosen.amountMinor)}
              />
            )}

            {/* Whatever else the chosen option carries — see `KeypadOption.posts`. */}
            {Object.entries(chosen.posts ?? {}).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}

            {/*
              `p-6`, not `px-6`: a card whose middle is one large figure needs
              the figure to sit in space rather than against the edges.

              The whole shorthand rather than the axis, because the body and the
              footer below have to arrive at the *same* inset — the date field
              and the button are one column and any difference between them
              reads as a mistake. `px-6` leaves the base `p-4` standing beside
              it and lets stylesheet order decide the winner; `p-6` replaces it
              outright, so the number written here is the number that applies.
            */}
            <DialogBody className="gap-5 p-6 pb-2">
              {amount ? (
                <>
                {/*
                  The amount, at display size and centred — the one thing the card
                  exists to collect, and the only thing on it until money has been
                  typed. `dir="ltr"` isolates the figure: an amount runs left to
                  right in both scripts, and a minus sign would otherwise move to
                  the far end in Arabic.
                */}
                <div className="flex flex-col items-center gap-3 pt-2">
                  <Label htmlFor="payment-amount" className="sr-only">
                    {labels.amount ?? null}
                  </Label>

                  {/*
                    The figure is drawn twice over: a transparent field that holds
                    the value and the caret, and a layer above it painting the
                    same string in two tones — what has been keyed in the page's
                    ink, what is still a placeholder in grey.

                    An `<input>` cannot colour half its own value, and splitting
                    the figure into two real inputs would split the caret, the
                    selection and the tab order with it. This way there is one
                    field, one value, and one thing posted; only the painting is
                    in two pieces.
                  */}
                  <div className="relative w-full">
                    <Input
                      id="payment-amount"
                      name="amount"
                      /*
                        The keyed figure only — never the grey `.00` beside it.

                        The two halves used to be one value, and those two zeros
                        were read straight back as keystrokes: a press appended a
                        digit, the field re-read `1.00` as `100`, and every key
                        multiplied the amount by a hundred. The agorot are painted
                        by the layer below and live nowhere else, so nothing the
                        reader did not type can come back in.

                        `parseAmount` reads `1,205` as ₪1,205.00 — grouping marks
                        and a missing point included — so this is also exactly what
                        the form should post.
                      */
                      value={readout.entered}
                      /*
                        A readout, not a text field: the digits are the state and
                        the string on screen is derived from them, so the reader
                        never types a separator or the point and can never delete
                        one into a shape the parser refuses. Everything that is not
                        a digit is dropped as it is pressed — a field that accepts
                        a letter and rejects it on submit has already let someone
                        read a wrong thing back as right.
                      */
                      onChange={(event) => setDigits(toKeypadDigits(event.target.value))}
                      inputMode="numeric"
                      autoComplete="off"
                      dir="ltr"
                      required
                      autoFocus
                      aria-describedby="payment-amount-hint"
                      /*
                        No placeholder attribute: the grey `0.00` is painted by the
                        layer below, which is the same grey the unkeyed agorot take
                        once an amount is started. One mechanism, so an empty card
                        and a half-typed one cannot end up different shades.
                      */
                      className={cn(
                        'h-auto border-0 bg-transparent p-0 text-center text-display-lg font-bold tabular-nums',
                        'shadow-none focus-visible:ring-0 focus-visible:outline-none',
                        /*
                          `text-transparent` hands the painting to the layer above
                          while the field keeps the value, the caret and every key.
                          `caret-transparent` because the amount is a readout, the
                          way a till shows one — at display size a blinking bar
                          beside the digits reads as a defect in the number.
                        */
                        'text-transparent caret-transparent',
                      )}
                    />

                    {/*
                      `aria-hidden`: this is a second drawing of the input's own
                      value, and a screen reader has already been given it by the
                      field. `pointer-events-none` so a press lands on the input
                      underneath, wherever on the figure it falls.
                    */}
                    <div
                      aria-hidden
                      dir="ltr"
                      className="pointer-events-none absolute inset-0 flex items-center justify-center text-display-lg font-bold tabular-nums"
                    >
                      <span>{readout.entered}</span>
                      <span className="text-muted-foreground/60">{readout.pending}</span>
                    </div>
                  </div>

                  <FieldHint id="payment-amount-hint" className="sr-only">
                    {labels.amountHint ?? null}
                  </FieldHint>

                  <DropdownMenu
                    onOpenChange={(nextOpen) => {
                      /* Next open measures again — the popup is remounted. */
                      if (!nextOpen) setTint(null);
                    }}
                  >
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          aria-label={labels.option}
                          className={cn(
                            'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-body-sm font-medium',
                            'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                            chosen.className,
                          )}
                        >
                          <Icon name={chosen.icon} className="size-4" />
                          <span>{chosen.label}</span>
                          <Icon name="chevronDown" className="size-4 opacity-70" />
                        </button>
                      }
                    />

                    <DropdownMenuContent
                      align="center"
                      /* `relative`: the containing block for the sliding tint. */
                      className="relative w-44"
                      /* Pointer off the menu entirely: the tint slides home. */
                      onPointerLeave={() => moveTint(chosen.value)}
                    >
                      {/*
                        The tint, behind the rows. `inset-x-1` matches the popup's
                        own `p-1`, so it inks the row full width and stops where
                        the rows stop. `aria-hidden` and `pointer-events-none`: it
                        is paint, and every press has to reach the row under it.
                      */}
                      {tint ? (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-x-1 top-0 rounded-md bg-primary/10 transition-[transform,height] duration-200 ease-out"
                          style={{ transform: `translateY(${tint.top}px)`, height: tint.height }}
                        />
                      ) : null}

                      {/*
                        The group is load-bearing: Base UI's menu parts read a
                        context only `Menu.Group` provides.
                      */}
                      <DropdownMenuGroup>
                        {options.map((entry) => (
                          <DropdownMenuItem
                            key={entry.value}
                            ref={(row: HTMLElement | null) => {
                              rows.current[entry.value] = row;
                              /*
                                First measurement, taken as the popup commits: the
                                tint starts under whichever method is already
                                chosen, so opening the menu shows a resting pill
                                rather than one flying in.
                              */
                              if (row && entry.value === chosen.value && tint === null) {
                                setTint({ top: row.offsetTop, height: row.offsetHeight });
                              }
                            }}
                            disabled={entry.disabled}
                            onClick={() => setChosenValue(entry.value)}
                            /*
                              Base UI highlights by moving real focus, so the
                              pointer and the arrow keys arrive at the same row;
                              both send the tint after them.
                            */
                            onPointerEnter={() => moveTint(entry.value)}
                            onFocus={() => moveTint(entry.value)}
                            /*
                              The row paints no background of its own — there is
                              one tint on this menu and it is the box above.
                              `focus:bg-transparent` is what takes the base item's
                              `focus:bg-accent` off; without it the travelling
                              pill would arrive under a row that had already
                              filled itself in, which is the doubled highlight
                              this picker is meant not to have.

                              What the row still does on highlight is the ink: the
                              label and the mark go brand green. lucide strokes
                              are `currentColor`, and the icon rule repeats the
                              base's own variant chain so it replaces that rule
                              rather than racing it on specificity.

                              `relative`: rows stack above the tint.
                            */
                            className={cn(
                              'relative transition-colors focus:bg-transparent focus:text-primary',
                              /*
                                Base UI marks the row under the pointer with
                                `data-highlighted` and moves focus to it; the ink
                                answers to both, so a build where the popup has not
                                taken focus still greens the row the tint is under.
                              */
                              'data-highlighted:bg-transparent data-highlighted:text-primary',
                              'not-data-[variant=destructive]:focus:**:text-primary',
                              'data-highlighted:**:text-primary',
                            )}
                          >
                            {/*
                              The method leads the row and the check closes it —
                              the far left in Arabic, the far right in English,
                              since these are the flex line's logical ends and the
                              whole row mirrors with the script.

                              The slot is always rendered, empty on the row that
                              is not chosen: an icon on one row and nothing on the
                              other let the labels sit at two different widths and
                              shuffle as the choice moved between them.

                              `text-primary` on the mark alone. The chosen row is
                              not otherwise inked — that green belongs to the row
                              the pointer is on — so the check is what says which
                              method the card will post, and it says it in the
                              colour the app uses for a settled thing.
                            */}
                            <Icon name={entry.icon} className="size-4" />
                            {/* A column, so a service that cannot be picked can
                                say why on a second line without the row's mark
                                and check moving. */}
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate">{entry.label}</span>
                              {entry.disabled && entry.note ? (
                                <span className="text-body-sm text-muted-foreground">
                                  {entry.note}
                                </span>
                              ) : null}
                            </span>

                            <span aria-hidden className="grid size-4 shrink-0 place-items-center text-primary">
                              {entry.value === chosen.value ? <Icon name="check" className="size-4" /> : null}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                </>
              ) : (
                /*
                  Down the middle, where the keypad would have been.

                  It was a labelled row for a while — the name at the reading
                  start, the pill at the end, matching the date line under it.
                  That is the right shape for a fact being read back, and the
                  wrong one for the only thing this card is here to collect: it
                  left the card's one question sitting in a corner with white
                  space where its subject should be. Centred, the pill occupies
                  the middle the way the amount does on the wallet, and the two
                  cards are recognisably the same card.

                  No visible label over it. The pill is already saying what it
                  is — a service, named, in its own tint — and a word above it
                  repeating the category is a caption on a picture of itself.
                  The name is still announced: it is the trigger's
                  `aria-label`, which is where a control that reads as its own
                  label belongs.
                */
                <div className="flex flex-col items-center gap-2 pt-2">
                  <DropdownMenu
                    onOpenChange={(nextOpen) => {
                      /* Next open measures again — the popup is remounted. */
                      if (!nextOpen) setTint(null);
                    }}
                  >
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          aria-label={labels.option}
                          className={cn(
                            'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-body-sm font-medium',
                            'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                            chosen.className,
                          )}
                        >
                          <Icon name={chosen.icon} className="size-4" />
                          <span>{chosen.label}</span>
                          <Icon name="chevronDown" className="size-4 opacity-70" />
                        </button>
                      }
                    />

                    <DropdownMenuContent
                      align="center"
                      /* `relative`: the containing block for the sliding tint. */
                      className="relative w-44"
                      /* Pointer off the menu entirely: the tint slides home. */
                      onPointerLeave={() => moveTint(chosen.value)}
                    >
                      {/*
                        The tint, behind the rows. `inset-x-1` matches the popup's
                        own `p-1`, so it inks the row full width and stops where
                        the rows stop. `aria-hidden` and `pointer-events-none`: it
                        is paint, and every press has to reach the row under it.
                      */}
                      {tint ? (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-x-1 top-0 rounded-md bg-primary/10 transition-[transform,height] duration-200 ease-out"
                          style={{ transform: `translateY(${tint.top}px)`, height: tint.height }}
                        />
                      ) : null}

                      {/*
                        The group is load-bearing: Base UI's menu parts read a
                        context only `Menu.Group` provides.
                      */}
                      <DropdownMenuGroup>
                        {options.map((entry) => (
                          <DropdownMenuItem
                            key={entry.value}
                            ref={(row: HTMLElement | null) => {
                              rows.current[entry.value] = row;
                              /*
                                First measurement, taken as the popup commits: the
                                tint starts under whichever method is already
                                chosen, so opening the menu shows a resting pill
                                rather than one flying in.
                              */
                              if (row && entry.value === chosen.value && tint === null) {
                                setTint({ top: row.offsetTop, height: row.offsetHeight });
                              }
                            }}
                            disabled={entry.disabled}
                            onClick={() => setChosenValue(entry.value)}
                            /*
                              Base UI highlights by moving real focus, so the
                              pointer and the arrow keys arrive at the same row;
                              both send the tint after them.
                            */
                            onPointerEnter={() => moveTint(entry.value)}
                            onFocus={() => moveTint(entry.value)}
                            /*
                              The row paints no background of its own — there is
                              one tint on this menu and it is the box above.
                              `focus:bg-transparent` is what takes the base item's
                              `focus:bg-accent` off; without it the travelling
                              pill would arrive under a row that had already
                              filled itself in, which is the doubled highlight
                              this picker is meant not to have.

                              What the row still does on highlight is the ink: the
                              label and the mark go brand green. lucide strokes
                              are `currentColor`, and the icon rule repeats the
                              base's own variant chain so it replaces that rule
                              rather than racing it on specificity.

                              `relative`: rows stack above the tint.
                            */
                            className={cn(
                              'relative transition-colors focus:bg-transparent focus:text-primary',
                              /*
                                Base UI marks the row under the pointer with
                                `data-highlighted` and moves focus to it; the ink
                                answers to both, so a build where the popup has not
                                taken focus still greens the row the tint is under.
                              */
                              'data-highlighted:bg-transparent data-highlighted:text-primary',
                              'not-data-[variant=destructive]:focus:**:text-primary',
                              'data-highlighted:**:text-primary',
                            )}
                          >
                            {/*
                              The method leads the row and the check closes it —
                              the far left in Arabic, the far right in English,
                              since these are the flex line's logical ends and the
                              whole row mirrors with the script.

                              The slot is always rendered, empty on the row that
                              is not chosen: an icon on one row and nothing on the
                              other let the labels sit at two different widths and
                              shuffle as the choice moved between them.

                              `text-primary` on the mark alone. The chosen row is
                              not otherwise inked — that green belongs to the row
                              the pointer is on — so the check is what says which
                              method the card will post, and it says it in the
                              colour the app uses for a settled thing.
                            */}
                            <Icon name={entry.icon} className="size-4" />
                            {/* A column, so a service that cannot be picked can
                                say why on a second line without the row's mark
                                and check moving. */}
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate">{entry.label}</span>
                              {entry.disabled && entry.note ? (
                                <span className="text-body-sm text-muted-foreground">
                                  {entry.note}
                                </span>
                              ) : null}
                            </span>

                            <span aria-hidden className="grid size-4 shrink-0 place-items-center text-primary">
                              {entry.value === chosen.value ? <Icon name="check" className="size-4" /> : null}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}

              {/*
                What the account will be credited. A rule above it, because it is
                  the card's answer rather than another of its fields — everything
                  over the line is what the reader is entering, and this is what it
                  comes to.
              */}
              {amount || priced ? (
                <div className="flex items-center justify-between border-t border-border pt-3 text-body-sm">
                  <span className="text-muted-foreground">{labels.answer ?? null}</span>
                  {/*
                    Blank until there is an amount, rather than `₪0.00`.

                    This line is the card's *answer*, and a zero is an answer —
                    "nothing will be added" — to a question nobody has asked yet.
                    The keypad above already says the field is empty, by showing
                    its own placeholder; saying it twice, once as a real-looking
                    figure, is how a reader comes to distrust the figure when it
                    does mean something.
                  */}
                  {/*
                    The keypad's figure, or the price of the option that was
                    chosen. A card that collects no amount still records one, and
                    this line is where the reader sees it before they commit it.
                  */}
                  <span dir="ltr" className="font-medium tabular-nums">
                    {amount ? formatAmountCompact(locale, parsed ?? 0) : null}
                    {priced && chosen.amountMinor != null
                      ? formatAmountCompact(locale, chosen.amountMinor)
                      : null}
                    {unpriced ? <span className="text-muted-foreground">—</span> : null}
                  </span>
                </div>
              ) : null}

              {/*
                The day the money changed hands, written as the line above it
                is written: what it is at the reading start, what it says at
                the reading end. It belongs with the answer rather than with
                the keypad — a payment is dated today unless somebody says
                otherwise, so this is a line to read and only sometimes a
                field to fill in, and putting it among the things being
                entered gave a settled fact the weight of a question.

                No rule of its own: the border above already separates the
                card's answer from what is being entered, and these two lines
                are both on the answer side of it.

                `dir="ltr"` on the value, the same isolation the amount takes:
                `YYYY-MM-DD` runs left to right in both scripts, and the
                calendar sits before it the way the shekel sign sits before
                the figure above — on the left, in Arabic as in English.

                Both halves start on today, in the clinic's own zone, resolved
                on the server; a browser a few hours ahead would otherwise
                call it tomorrow. `name` on the picker posts the ISO string
                with the form, so the action's schema reads exactly what it
                read before — the typed field carries no `name` of its own and
                cannot post half a date.

                No bound on the grid, in either direction: a cheque dated
                forward and a receipt entered weeks late are both things this
                ledger has to be able to write down, and
                `recordPaymentSchema` accepts any real calendar date.
              */}
              <div className="flex items-center justify-between gap-3 text-body-sm">
                <Label htmlFor="payment-date" className="text-muted-foreground">
                  {labels.date}
                </Label>

                <div dir="ltr" className="flex items-center gap-1">
                  <DatePicker
                    trigger="icon"
                    name={dateName}
                    locale={locale}
                    value={paidOn}
                    onChange={chooseDate}
                    label={labels.openDatePicker}
                    /*
                      The caption ring, not the year dropdowns. Dropdowns are
                      for a field whose answer is years away — a date of birth.
                      This one is days away at most.
                    */
                    caption="chooser"
                    /*
                      The chosen day filled in the brand green, not the neutral a
                      form field defaults to. That default exists so a page of
                      date fields does not come out a field of green — this card
                      holds one date, and the popup it opens is the only question
                      on screen while it is up, which is exactly the case the
                      tone was left open for. It also matches the picker rows
                      under the amount, so one green means "chosen" everywhere on
                      the card.
                    */
                    selectedTone="primary"
                    /*
                      Stripped to the glyph: no box, no border, no fill. The
                      icon stands to the date exactly as the shekel sign stands
                      to the figure on the line above — a mark on the value, one
                      small gap away, not a button parked beside it. It is still
                      a real trigger, so it takes the ink on hover and keeps the
                      focus ring it arrives with.
                    */
                    className="size-5 shrink-0 border-0 bg-transparent p-0 text-muted-foreground shadow-none transition-colors hover:bg-transparent hover:text-primary active:bg-transparent data-pressed:bg-transparent data-pressed:text-primary data-popup-open:bg-transparent data-popup-open:text-primary"
                  />

                  {/*
                    Still typed as well as picked: six keystrokes beat any grid
                    for somebody who knows the date. Borderless and sized to its
                    content, because on this line it is a value being shown, and
                    a boxed field here would be the loudest thing on the card.
                  */}
                  <Input
                    id="payment-date"
                    value={dateText}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={labels.datePlaceholder}
                    onChange={(event) => setDateText(event.target.value)}
                    onBlur={(event) => commitDateText(event.target.value)}
                    onKeyDown={(event) => {
                      /*
                        Enter commits the date instead of submitting the card: a
                        half-typed day should not be able to post the payment.
                      */
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      commitDateText(event.currentTarget.value);
                    }}
                    className="h-7 w-[10ch] border-0 bg-transparent px-0 text-start font-medium tabular-nums shadow-none focus-visible:bg-muted"
                  />
                </div>
              </div>

              {/*
                The chosen option has no price yet, so there is nothing to
                record. Said here rather than left to the disabled button: a
                control that will not work without saying why is exactly what
                this line exists to prevent.
              */}
              {unpriced ? <FieldHint className="text-center">{labels.noPrice}</FieldHint> : null}

              {/*
                What is left to collect, and — once the figure typed is past it
                — that it is. One line in both states rather than a hint that
                appears only on the refusal: a reader deciding what to type is
                the one who needs the figure, and telling them after they have
                typed it is a correction rather than a help.
              */}
              {labels.owed && !unpriced ? (
                <FieldHint className={cn('text-center', over && 'text-destructive')}>
                  {over ? labels.overMax : labels.owed}
                </FieldHint>
              ) : null}

              {/*
                The option's own note — why this entry is what it is. It sits
                under the answer line because that is what it explains: a figure
                of zero beside "Added to total price" is a question until
                something says the first consultation is free.
              */}
              {!unpriced && chosen.note ? (
                <FieldHint className="text-center">{chosen.note}</FieldHint>
              ) : null}

              {/* One line — the action reports a single message key rather than
                  per-field issues. */}
              <FieldError>{error}</FieldError>
            </DialogBody>

            {/*
              One button, full width. There is no Cancel beside it: the × in the
              header and Escape both close the card, and a second way out spends
              half the footer saying what the corner already says. The submit is
              the only decision on the card, so it gets all of it.
            */}
            {/*
              `justify-center` over the footer's own `justify-end`, which is
              where a row of actions belongs — Cancel then Save, against the
              inline edge. This footer holds one button and no alternative to
              it, so an edge to sit against is an edge the eye has to find: the
              amount above it is centred, the method under that is centred, and
              the button that commits them both belongs on the same line down
              the middle of the card.

              `border-transparent` drops the rule the footer draws to separate
              actions from content. There is nothing to separate here — the
              button is the last step of one movement, not a different region.

              `p-6 pt-0` is the body's inset exactly, replacing the footer's own
              `p-4` outright rather than overriding one axis of it — see the
              body above for why the shorthand and not `px-6`. `pt-0` closes the
              gap the body's own bottom padding already left.
            */}
            <DialogFooter className="justify-center border-transparent bg-transparent p-6 pt-0">
              {/*
                `max-w-none` beside the `w-full`, and it is not redundant: the
                button scale caps every button at `max-w-80`, because a button
                is as wide as its label and a 900px "Save" is not a button. This
                one is a form's last field rather than an action in a row — the
                date picker above it cancels the same cap for the same reason,
                and without this the two sat at 320px and 400px, half a step out
                of line in a card whose whole column is otherwise flush.
              */}
              <Button
                type="submit"
                className="w-full max-w-none"
                disabled={pending || unpriced || over || Boolean(chosen.disabled)}
              >
                {pending ? labels.saving : labels.submit}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}

/**
 * The option a card opens on: the first that can actually be picked.
 *
 * `options[0]` for every card whose list is fully available, which is all of
 * them until a rule takes a row out — the charge card greys out subscriptions
 * for somebody already inside a term, and opening on a greyed row would hand
 * the reader a card whose button was dead before they touched it.
 *
 * Falls back to the first option when every one of them is disabled, so the
 * card still has something chosen and the readout still has something to read.
 */
function firstChoice(options: readonly KeypadOption[]): string {
  return (options.find((entry) => !entry.disabled) ?? options[0]!).value;
}
