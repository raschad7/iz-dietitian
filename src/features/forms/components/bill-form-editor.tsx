'use client';

import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { saveFormsAction } from '@/features/forms/actions';
import {
  BILL_FORM_FIELDS,
  CLINIC_NAME_FIELD,
  PLACEMENTS_FIELD,
  TOTALS_ALIGN_FIELD,
  type ClinicForms,
} from '@/features/forms/fields';
import { initialFormsState, type FormsActionState } from '@/features/forms/form-state';
import {
  isCustomItem,
  itemSize,
  totalsAlignSelf,
  totalsAlignmentFrom,
  TOTALS_ALIGNMENTS,
  type TotalsAlignment,
  MAX_PLACEMENTS,
  sizeRange,
  storedSize,
  defaultPlacements,
  placementsFrom,
  placementsTo,
  ZONE_HEIGHT,
  ZONES,
  type Placement,
  type Zone,
} from '@/features/forms/zones';
import { SettingsEditDialog } from '@/features/settings/components/settings-edit-dialog';
import { SettingsSection } from '@/features/settings/components/settings-section';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The bill, drawn as the page it prints, with the top of it free to arrange.
 *
 * ## What a clinic can actually do here
 *
 * Drag anything in the head of the page or the details block to anywhere in
 * that block. Add a line of your own to either and put it where you like. Type
 * on any word to change it. Drop in a logo. Everything is where it will be on
 * paper, at the size it will be, in the language the bill prints in.
 *
 * ## Why the freedom stops at those two blocks
 *
 * ⚠ **A bill paginates.** The table grows with the ledger, the totals follow
 * wherever it ends, and the footer prints at the foot of every page — so an
 * item pinned at a fixed spot below the table is an item that a long account
 * prints on top of. The two blocks at the top are the parts of the document
 * with a height that does not depend on the account, which is exactly what
 * makes a position in them mean something. See `../zones.ts`.
 *
 * The table's columns and the totals keep their shape for the same reason a
 * spreadsheet's do: they have to line up down a page, in two scripts. What
 * they take instead is an alignment.
 *
 * ## What is not editable, and why it is grey
 *
 * Figures, dates and the subscriber's name come from the ledger. A document
 * whose numbers could be typed in Settings would not be a record of anything,
 * so they are drawn muted — the difference between "your text" and "what a real
 * bill holds here" is visible rather than explained.
 *
 * ## One save
 *
 * The words, the arrangement and the mark post together: wording and layout to
 * `clinic_forms` in one transaction, the mark to the clinic row.
 */
export function BillFormEditor({
  locale,
  forms,
  logo,
  clinicName,
  doctorName,
  clinicAddress,
}: {
  locale: Locale;
  forms: ClinicForms;
  /** The clinic's mark, from `clinics.logo_url`. */
  logo: string | null;
  /** The clinic's own name, which the printed name falls back to. */
  clinicName: string;
  /** Who practises here — the head of the page can name them. */
  doctorName: string | null;
  /** Where the clinic is — the head draws the real line, not a stand-in. */
  clinicAddress: string | null;
}) {
  const t = useTranslations('forms');
  /*
    The canvas's own reset, borrowed.

    The arrangement and the words it puts back are `BillCanvas`'s state and
    belong there — but the control belongs beside Cancel, which is the footer's
    and so the dialog's. A ref rather than lifting the state up: the canvas is
    remounted every time the dialog opens, which is what makes an abandoned
    reset disappear on its own.
  */
  const restore = useRef<(() => void) | null>(null);
  const holdRestore = useCallback((reset: (() => void) | null) => {
    restore.current = reset;
  }, []);

  return (
    /*
      A heading and the way in, and nothing between them.

      There was a paragraph under the title and the clinic's mark beside the
      button. Neither said anything the dialog does not: the sheet inside is the
      bill, drawn, with the mark already on it — a thumbnail of it out here is
      the same picture twice, and a description of an editor you are one press
      from opening is a page asking to be read before it can be used.

      The button rides the section's own `action` slot — the far end of the
      heading row, which is the left of an Arabic page and the right of an
      English one, the same place every other section keeps its control.
    */
    <SettingsSection
      title={t('bill.title')}
      description={t('bill.description')}
      icon="bills"
      /* Padding and not a margin: a section's own top margin collapses on the
         first one — see `SettingsSection` — and this is the first thing under
         the tab bar, which it would otherwise sit directly against. */
      className="pt-3"
      action={
        <SettingsEditDialog
          locale={locale}
          title={t('bill.title')}
          triggerLabel={t('edit')}
          /* The word on the button is the same "Change" every settings row
             uses; what it changes is said by the heading beside it, which a
             screen reader is not standing next to. */
          triggerAriaLabel={t('bill.edit')}
          size="page"
          action={saveFormsAction}
          initialState={initialFormsState}
          footerStart={
            <Button type="button" variant="neutral" onClick={() => restore.current?.()}>
              {t('bill.reset')}
            </Button>
          }
        >
          {(state) => (
            <BillCanvas
              forms={forms}
              logo={logo}
              clinicName={clinicName}
              doctorName={doctorName}
              clinicAddress={clinicAddress}
              locale={locale}
              state={state}
              onRestore={holdRestore}
            />
          )}
        </SettingsEditDialog>
      }
    >
      {/* The section's own rule, and nothing under it. What this section holds
          is a document, and the document is in the dialog — the rule is what
          says the heading is a section of this page rather than a line floating
          above the next one. */}
      {null}
    </SettingsSection>
  );
}

/**
 * The page.
 *
 * Mirrors `BillDocument` block for block, because the point is that what is on
 * screen is what prints. The two are not generated from one source, and that is
 * a real cost: a thing added to the PDF has to be added here too, or the editor
 * stops telling the truth. The alternative — overlaying inputs on a rendered
 * PDF — is a coordinate system nobody can maintain.
 */
function BillCanvas({
  forms,
  logo,
  clinicName,
  doctorName,
  clinicAddress,
  locale,
  state,
  onRestore,
}: {
  forms: ClinicForms;
  logo: string | null;
  clinicName: string;
  /** Who practises here, drawn where the clinic puts it. */
  doctorName: string | null;
  /** The clinic's own address, drawn where the clinic puts it. */
  clinicAddress: string | null;
  locale: Locale;
  state: FormsActionState;
  /** Hands this sheet's reset up, so the dialog's footer can call it. */
  onRestore: (reset: (() => void) | null) => void;
}) {
  const t = useTranslations('forms');
  const billing = useTranslations('billing');

  /*
    The mark is the one thing on this sheet the editor does not decide. It is on
    the bill when the clinic has uploaded one and off it when it has not — so it
    is dropped from the arrangement while there is no logo, and un-hidden while
    there is. Taking it off here would be a second, quieter way to delete a logo,
    and a clinic that had done so would find the Clinic tab still holding one.
  */
  const [placements, setPlacements] = useState<Placement[]>(() =>
    placementsFrom(forms[PLACEMENTS_FIELD], Boolean(logo))
      .filter((item) => item.id !== 'logo' || logo)
      .map((item) => (item.id === 'logo' ? { ...item, hidden: false } : item)),
  );
  const [totalsAlignment, setTotalsAlignment] = useState<TotalsAlignment>(() =>
    totalsAlignmentFrom(forms, locale === 'ar'),
  );
  /*
    Bumped by the reset, and used as a `key` on the sheet.

    The words on this page are `contentEditable` and deliberately uncontrolled —
    see `InlineText` — so there is no value to set them back to. Remounting them
    with nothing stored is what puts the app's own wording back, and it is one
    number rather than a controlled rewrite of every label.
  */
  const [resetCount, setResetCount] = useState(0);
  /** Whether the reader has asked for the app's bill back, unsaved as yet. */
  const reset = resetCount > 0;

  const restoreDefaults = () => {
    setPlacements(defaultPlacements(Boolean(logo)).filter((item) => item.id !== 'logo' || logo));
    setTotalsAlignment(totalsAlignmentFrom({}, locale === 'ar'));
    setResetCount((count) => count + 1);
  };

  /* In an effect, because a ref handed in as a prop is not this component's to
     write during a render — and nothing calls it until the footer is pressed,
     which is long after one. */
  useEffect(() => {
    onRestore(restoreDefaults);
    return () => {
      onRestore(null);
    };
  });

  const patch = (id: string, part: Partial<Placement>) =>
    setPlacements((current) =>
      current.map((item) => (item.id === id ? { ...item, ...part } : item)),
    );

  /** A label's own editable text, wherever on the page it is placed. */
  const label = (key: string) => {
    const field = BILL_FORM_FIELDS.find((entry) => entry.key === key);
    if (!field) throw new Error(`No bill label for ${key}.`);

    return (
      <InlineText
        name={field.key}
        stored={reset ? undefined : forms[field.key]}
        placeholder={billing(field.defaultKey)}
      />
    );
  };

  /**
   * What each placeable thing looks like, at the scale the zone is drawn at.
   *
   * `scale` is screen pixels per printed point. Only the mark needs it — a word
   * is sized by the sheet's own type scale — but it is passed to everything so
   * that the next thing with a size does not have to re-plumb it.
   */
  const renderItem = (item: Placement, scale: number): ReactNode => {
    if (isCustomItem(item.id)) return null;
    if (item.id !== 'logo') return drawn[item.id];
    /* The mark is only in the arrangement while the clinic has one — see
       `placements`. The guard is for the type, not for a case that happens. */
    if (!logo) return null;

    return (
      /* eslint-disable-next-line @next/next/no-img-element -- a `data:` URI has
         nothing for the image optimizer to do. */
      <img
        src={logo}
        alt={t('bill.logo')}
        /* In pixels, from the size in points: a percentage height would be
           measured against the placed item, which has none of its own. */
        style={{ height: Math.max(8, itemSize(item) * scale) }}
        className="w-auto max-w-none object-contain"
      />
    );
  };

  /**
   * The things whose look does not depend on the zone's scale.
   *
   * The same set `BillDocument` draws, at the same relative weights — a name in
   * bold, a phone in the muted contact size, a label above its value.
   */
  const drawn: Record<string, ReactNode> = {
    /*
      Where the mark would be, for a clinic that has none.

      It says where to get one rather than offering to take one: the clinic's
      logo is uploaded on the Clinic tab, with a control that resizes and
      re-encodes before anything leaves the browser, and it is shown in the
      portal as well as on a bill. Two uploaders for one column is two ways to
      set one thing, and the pair would drift.
    */
    clinicName: (
      <InlineText
        name={CLINIC_NAME_FIELD}
        stored={reset ? undefined : forms[CLINIC_NAME_FIELD]}
        /* The clinic's own name, so an untouched bill reads as it prints — and
           typing over it changes the document without renaming the clinic
           anywhere else. See `CLINIC_NAME_FIELD`. */
        placeholder={clinicName}
        announce={t('bill.clinicName')}
        className="text-body font-bold"
      />
    ),
    doctorName: <Sample>{doctorName ?? t('bill.sampleDoctor')}</Sample>,
    clinicPhone: <Sample>+970 59-000-0000</Sample>,
    clinicAddress: <Sample>{clinicAddress ?? t('bill.sampleAddress')}</Sample>,
    docTitle: <span className="font-bold">{label('bill.bills.statementTitle')}</span>,
    billNo: (
      <span className="text-caption text-muted-foreground">
        {label('bill.bills.billNo')} <Sample>1042</Sample>
      </span>
    ),
    subscriberLabel: (
      <span className="text-caption text-muted-foreground">{label('bill.bills.subscriber')}</span>
    ),
    subscriberValue: <Sample>{t('bill.sampleSubscriber')}</Sample>,
    issuedLabel: (
      <span className="text-caption text-muted-foreground">{label('bill.bills.issuedOn')}</span>
    ),
    issuedValue: <Sample>2026-08-27</Sample>,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* What the form posts for everything that is not typed on the page. */}
      <input type="hidden" name={PLACEMENTS_FIELD} value={placementsTo(placements)} />
      <input type="hidden" name={TOTALS_ALIGN_FIELD} value={totalsAlignment} />

      {/*
        The sheet, at the page's own proportions and in the language it prints
        in — a clinic reading Settings in English still prints an Arabic bill.
      */}
      <div
        key={resetCount}
        /*
          Its width is the dialog's — see `size="page"`, which is 46rem for
          exactly this sheet.

          The two zones are drawn at the printed aspect, so their height is a
          function of that width: at the 64rem `wide` gives a table the sheet
          came to roughly 830px and the dialog, which the UA caps near the
          viewport, scrolled on any laptop. A bill you have to scroll to see is
          an arrangement you are judging in halves.
        */
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 text-body-sm shadow-sm sm:p-6"
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        {ZONES.map((zone) => (
          <ZoneCanvas
            key={zone}
            zone={zone}
            name={t(`bill.zone.${zone}` as 'bill.zone.header')}
            placements={placements}
            renderItem={renderItem}
            onMove={(id, x, y, centred) => patch(id, { x, y, centred })}
            onResize={(id, size) => patch(id, { size })}
            onHide={(id) =>
              isCustomItem(id)
                ? setPlacements((current) => current.filter((item) => item.id !== id))
                : patch(id, { hidden: true })
            }
            onText={(id, text) => patch(id, { text })}
            hidden={placements.filter((item) => item.zone === zone && item.hidden)}
            onShow={(id) => patch(id, { hidden: false })}
            onAdd={() =>
              setPlacements((current) =>
                current.length >= MAX_PLACEMENTS
                  ? current
                  : [
                      ...current,
                      {
                        id: `custom:${Date.now()}`,
                        zone,
                        x: 4,
                        y: 70,
                        text: '',
                      },
                    ],
              )
            }
            itemName={(id) =>
              isCustomItem(id) ? t('bill.customItem') : t(`bill.item.${id}` as 'bill.item.logo')
            }
          />
        ))}

        {/* The table: headings the clinic owns, rows it does not. */}
        <div className="overflow-hidden rounded-md border border-border">
          <div className="grid grid-cols-[22%_48%_30%] gap-2 bg-muted px-3 py-2 text-caption font-semibold">
            <span>{label('bill.bills.date')}</span>
            <span>{label('bill.bills.description')}</span>
            <span>{label('bill.bills.amount')}</span>
          </div>

          {[
            { date: '2026-08-24', what: t('bill.sampleCharge'), amount: '₪270' },
            { date: '2026-08-20', what: t('bill.samplePayment'), amount: '₪150' },
          ].map((row) => (
            <div
              key={row.date}
              className="grid grid-cols-[22%_48%_30%] gap-2 border-t border-border px-3 py-2"
            >
              <Sample>{row.date}</Sample>
              <Sample>{row.what}</Sample>
              <Sample>{row.amount}</Sample>
            </div>
          ))}
        </div>

        {/*
          The totals take a side of the page — left, middle or right — and take
          it by being dragged there, like everything else on this sheet. Three
          stops rather than a free position, because they follow a table whose
          height the ledger decides: there is no fixed spot below it to drop
          something at, but there is always a side. See `TOTALS_ALIGNMENTS`.
        */}
        <TotalsBand alignment={totalsAlignment} rtl={locale === 'ar'} onAlign={setTotalsAlignment}>
          <Total label={label('bill.fields.totalPrice')} sample="₪270" />
          <Total label={label('bill.fields.totalPayment')} sample="₪150" />
          <Total label={label('bill.fields.remaining')} sample="₪120" strong />
        </TotalsBand>

        <div className="border-t border-border pt-3 text-center text-caption text-muted-foreground">
          {label('bill.bills.footer')}
        </div>
      </div>

      <FormsError state={state} />
    </div>
  );
}

/**
 * One free zone: a band of the page you can put things anywhere in.
 *
 * ## The height is the printed height
 *
 * Drawn at the same aspect the PDF gives it, so a thing dragged to the middle
 * of the zone is in the middle of the printed one. `ZONE_HEIGHT` is in points
 * and this is in pixels; the ratio is what matters and it is the same.
 *
 * ## Pointer events, not HTML drag-and-drop
 *
 * A native drag reports where a *drop* happened, not where the pointer is,
 * which is enough to reorder a list and not enough to place something: there is
 * no continuous position to follow. Pointer events give one, work on touch
 * without a second code path, and `setPointerCapture` keeps the drag alive when
 * the pointer leaves the item — which it does, constantly, because the item is
 * small and the zone is not.
 */
function ZoneCanvas({
  zone,
  name,
  placements,
  renderItem,
  onMove,
  onResize,
  onHide,
  onShow,
  onText,
  onAdd,
  hidden,
  itemName,
}: {
  zone: Zone;
  name: string;
  placements: readonly Placement[];
  renderItem: (item: Placement, scale: number) => ReactNode;
  onMove: (id: string, x: number, y: number, centred: boolean) => void;
  onResize: (id: string, size: number) => void;
  onHide: (id: string) => void;
  onShow: (id: string) => void;
  onText: (id: string, text: string) => void;
  onAdd: () => void;
  hidden: readonly Placement[];
  itemName: (id: string) => string;
}) {
  const t = useTranslations('forms');
  const surface = useRef<HTMLDivElement>(null);

  /*
    How many screen pixels a printed point is worth here.

    Measured rather than assumed: the zone's width is whatever the dialog gives
    it, and its height follows from the aspect ratio — so the only way to draw
    the mark at the size it prints is to ask the box how tall it currently is.
    A `ResizeObserver` because the dialog is resizable and the page reflows.
  */
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const box = surface.current;
    if (!box) return;

    const watch = new ResizeObserver(([entry]) => {
      const height = entry?.contentRect.height ?? 0;
      setScale(height / ZONE_HEIGHT[zone]);
    });

    watch.observe(box);
    return () => watch.disconnect();
  }, [zone]);

  /**
   * Where the pointer went, as a percentage of the zone.
   *
   * Measured against the surface's own box rather than the page, so a dialog
   * that scrolls does not offset every drag. `x` is taken from the *reading*
   * edge — the right in an RTL page — because that is what is stored.
   */
  const at = (event: ReactPointerEvent, grab: { x: number; y: number; width: number }) => {
    const box = surface.current?.getBoundingClientRect();
    if (!box) return null;

    const rtl = getComputedStyle(surface.current!).direction === 'rtl';
    const fromStart = rtl ? box.right - event.clientX : event.clientX - box.left;

    const x = Math.min(96, Math.max(0, ((fromStart - grab.x) / box.width) * 100));
    const y = Math.min(92, Math.max(0, ((event.clientY - box.top - grab.y) / box.height) * 100));

    /*
      Centred when its middle is near the zone's middle. Snapping rather than
      leaving it to the hand: "in the centre" is a thing a reader means exactly,
      and a name a percent off centre is a name that looks like a mistake on a
      printed page. The band is generous — a twentieth of the width either side
      — because it is the one position worth being certain of.
    */
    const middle = x + (grab.width / box.width) * 50;

    return { x, y, centred: Math.abs(middle - 50) < 5 };
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-caption font-semibold text-muted-foreground">{name}</h3>
        <Button type="button" variant="neutral" size="sm" onClick={onAdd}>
          {t('bill.addHere')}
        </Button>
      </div>

      <div
        ref={surface}
        /* The printed proportions: 499pt of width against the zone's own
           height. `aspect-ratio` keeps that true at any dialog width. */
        style={{ aspectRatio: `499 / ${ZONE_HEIGHT[zone]}` }}
        className="relative w-full rounded-md border border-dashed border-border bg-muted/20"
      >
        {placements
          .filter((item) => item.zone === zone && !item.hidden)
          .map((item) => (
            <PlacedThing
              key={item.id}
              item={item}
              name={itemName(item.id)}
              onMove={(event, grab) => {
                const next = at(event, grab);
                if (next) onMove(item.id, next.x, next.y, next.centred);
              }}
              /* The mark has no way off the bill from here — see the note on
                 `placements`. Everything else does. */
              removable={item.id !== 'logo'}
              onHide={() => onHide(item.id)}
              onText={(text) => onText(item.id, text)}
              onNudge={(to) => onMove(item.id, to.x, to.y, item.centred === true)}
              onResize={(size) => onResize(item.id, size)}
              scale={scale}
            >
              {renderItem(item, scale)}
            </PlacedThing>
          ))}
      </div>

      {/*
        What has been taken off this zone, offered back. A thing removed with no
        way to return is a decision a reader cannot undo without knowing the
        default arrangement by heart.
      */}
      {hidden.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-muted-foreground">{t('bill.hiddenHere')}</span>
          {hidden.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant="neutral"
              size="sm"
              onClick={() => onShow(item.id)}
            >
              {itemName(item.id)}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * One thing in a zone: draggable, removable, and — if the clinic added it —
 * typed into.
 *
 * The handle is the whole thing, which is what makes this feel like moving a
 * label rather than operating a widget. A word that is editable is still
 * editable: the drag only starts on a press that is not on the text, so
 * `pointerdown` inside an editable span is left alone.
 */
function PlacedThing({
  item,
  name,
  scale,
  removable,
  onMove,
  onNudge,
  onResize,
  onHide,
  onText,
  children,
}: {
  item: Placement;
  name: string;
  /** Screen pixels per printed point, so a drag can be read as a size. */
  scale: number;
  /** Whether this thing can be taken off the bill at all — the mark cannot. */
  removable: boolean;
  onMove: (event: ReactPointerEvent, grab: { x: number; y: number; width: number }) => void;
  /** The keyboard's way to move it: a position, already worked out. */
  onNudge: (to: { x: number; y: number }) => void;
  onResize: (size: number) => void;
  onHide: () => void;
  onText: (text: string) => void;
  children: ReactNode;
}) {
  const t = useTranslations('forms');
  const grab = useRef<{ x: number; y: number; width: number } | null>(null);
  /** Held right now, so the item can say so rather than only the cursor. */
  const [held, setHeld] = useState(false);
  /** Where the resize started, so the drag is a delta and not a jump. */
  const sizing = useRef<{ y: number; from: number; scale: number } | null>(null);

  return (
    <div
      /*
        The whole thing is the handle — the inner box below, which is the thing
        itself. It was a 14px grip that only appeared on hover, which is a target
        you have to find before you can move anything, and on a touch screen
        there is no hover to find it with.

        A press on a word being edited, or on one of the buttons, is not a drag:
        `isEditable` lets those through. Everything else — the padding, a
        label's own frame, the mark — starts one.
      */
      onPointerDown={(event) => {
        if (isEditable(event.target)) return;

        /* The inner box: the thing's own edges, which is what the pointer took
           hold of and what a position means. The outer one spans the band while
           centred and would put the grab offset a page away. */
        const thing = (event.target as Element).closest('span[class*="cursor-grab"]');
        const box = (thing ?? event.currentTarget).getBoundingClientRect();
        const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';

        /* Where inside the thing it was taken hold of, so it does not jump to
           put its corner under the pointer. */
        grab.current = {
          x: rtl ? box.right - event.clientX : event.clientX - box.left,
          y: event.clientY - box.top,
          width: box.width,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setHeld(true);
      }}
      onPointerMove={(event) => {
        if (!grab.current) return;
        onMove(event, grab.current);
      }}
      onPointerUp={() => {
        grab.current = null;
        setHeld(false);
      }}
      onPointerCancel={() => {
        grab.current = null;
        setHeld(false);
      }}
      style={{
        /*
          A size only where the clinic set one — see `storedSize`. Left alone,
          the words keep the sheet's own type scale, which is the bill the app
          has always printed; set, an inline size beats the class that would
          otherwise decide, which is what makes the grip visible on a word.

          The mark is not here: it is drawn at its height by `renderItem`.
        */
        ...(item.id === 'logo' || !storedSize(item)
          ? null
          : { fontSize: Math.max(7, itemSize(item) * scale) }),
        ...(item.centred
          ? { insetInline: 0, top: `${item.y}%` }
          : { insetInlineStart: `${item.x}%`, top: `${item.y}%` }),
      }}
      /* Positioning only. It spans the band while centred, because that is what
         centring needs, and draws nothing itself. */
      className={cn('absolute flex', item.centred && 'justify-center')}
    >
      <span
        role="group"
        tabIndex={0}
        aria-label={`${name} — ${t('bill.moveItem')}`}
        onKeyDown={(event) => {
          const across =
            event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
          const down = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
          if (!across && !down) return;

          event.preventDefault();
          /* Left and right are the paper's; `x` is measured from the reading
             edge, so on an Arabic sheet pressing left *increases* it. */
          const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
          const step = 2;

          onNudge({
            x: Math.min(96, Math.max(0, item.x + (rtl ? -across : across) * step)),
            y: Math.min(92, Math.max(0, item.y + down * step)),
          });
        }}
        className={cn(
          'group relative flex w-fit max-w-full touch-none items-center gap-1 rounded-sm border border-dashed border-transparent p-1.5',
          'cursor-grab hover:border-border hover:bg-card focus-visible:border-border focus-visible:outline-none',
          held && 'cursor-grabbing border-primary bg-card shadow-sm',
        )}
      >
        {/* Not the edge: an arrow here, and a caret inside a word — see the
            note on the box's own cursor. */}
        <span className="cursor-default">
          {isCustomItem(item.id) ? (
            <InlineText
              name={`${item.id}:text`}
              stored={item.text}
              placeholder={t('bill.customItem')}
              onChange={onText}
            />
          ) : (
            children
          )}
        </span>

        {removable ? (
          <button
            type="button"
            aria-label={`${name} — ${t('bill.removeItem')}`}
            onClick={onHide}
            className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Icon name="close" className="size-3.5" />
          </button>
        ) : null}

        {/*
        The corner grip, on every placed thing rather than only the mark: a mark
        takes a height and a word takes a type size, which is what `sizeRange`
        decides between.

        Dragged down makes it bigger, the way every corner handle behaves. The
        drag is in pixels and a size is in points, so the zone's own scale is
        the conversion — and a word moves at a third of the speed, because a
        font size crosses its whole range in a fraction of the travel a logo's
        height needs.

        Clamped either way: type under the floor is print nobody reads, and
        anything over the ceiling runs past the band it lives in.
      */}
        <span
          role="button"
          tabIndex={0}
          aria-label={`${name} — ${t('bill.resize')}`}
          onPointerDown={(event) => {
            if (scale <= 0) return;

            sizing.current = {
              y: event.clientY,
              from: itemSize(item),
              /* Pixels back into points — the inverse of what draws it. */
              scale: 1 / scale,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = sizing.current;
            if (!start) return;

            /* The mark grows by the drag in points; a word grows by a fraction
               of it, because a font size covers its whole range in a fifth of
               the pixels a logo's height does. */
            const step = item.id === 'logo' ? 1 : 0.35;
            const points = start.from + (event.clientY - start.y) * start.scale * step;
            const range = sizeRange(item.id);

            onResize(Math.min(range.max, Math.max(range.min, Math.round(points))));
          }}
          onPointerUp={() => {
            sizing.current = null;
          }}
          onKeyDown={(event) => {
            /* The keyboard way to do the same thing, because a drag is not one.
               Four points a press: fine enough to land on a size, coarse enough
               to cross the range without a hundred presses. */
            const step = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
            if (!step) return;

            event.preventDefault();
            const range = sizeRange(item.id);
            const next = itemSize(item) + step * (item.id === 'logo' ? 4 : 1);
            onResize(Math.min(range.max, Math.max(range.min, next)));
          }}
          /*
            A corner, not a glyph.

            It was a pair of arrows sitting *inside* the item, between its words
            and its remove button — which read as a control belonging to the
            text, moved the words along as it appeared, and had to be aimed at.
            A small square on the corner is what every editor puts there, it is
            outside the flow so nothing shifts when it shows, and the whole edge
            it sits on is the target.

            `-bottom-1 -end-1`: the corner furthest from where the reading
            starts, so it never covers the first word. Logical, so it is the
            bottom left of an Arabic item and the bottom right of an English
            one, which is the near corner in both.
          */
          className={cn(
            'absolute -bottom-1 -end-1 size-2.5 rounded-[2px] border border-primary bg-card',
            'cursor-nwse-resize opacity-0 transition-opacity',
            'group-hover:opacity-100 focus-visible:opacity-100',
          )}
        />
      </span>
    </div>
  );
}

/**
 * The totals, and the side of the page they take.
 *
 * ## Three stops, dragged
 *
 * The block follows a table whose height the ledger decides, so there is no
 * fixed spot below it to drop something at — but there is always a side. So it
 * drags like everything else on the sheet and lands on the nearest of three:
 * left, middle, right. A select would have been fewer lines and a different
 * editor; the whole page is dragged, and one control that is not would be the
 * one thing a reader has to be told about.
 *
 * ## Physically left and right
 *
 * The stops are the sides of the paper, not the reading edges — see
 * `TOTALS_ALIGNMENTS`. What a clinic means by "put the totals on the left" is
 * the left, and this is one block with three positions rather than an
 * arrangement that has to survive being mirrored.
 *
 * The keyboard gets the same three through the arrow keys, because a drag is
 * not a keyboard interaction and a control that only a pointer can reach is a
 * control some people do not have.
 */
function TotalsBand({
  alignment,
  rtl,
  onAlign,
  children,
}: {
  alignment: TotalsAlignment;
  /** Which way the sheet runs, so a physical side resolves the same way it
      does on the printed page — see `totalsAlignSelf`. */
  rtl: boolean;
  onAlign: (next: TotalsAlignment) => void;
  children: ReactNode;
}) {
  const t = useTranslations('forms');
  const held = useRef(false);

  /** Which third of the sheet a point falls in. */
  const stopAt = (event: ReactPointerEvent, box: DOMRect): TotalsAlignment => {
    const across = (event.clientX - box.left) / box.width;

    return across < 1 / 3 ? 'left' : across < 2 / 3 ? 'center' : 'right';
  };

  return (
    <div className="flex" style={{ justifyContent: totalsAlignSelf(alignment, rtl) }}>
      <dl
        role="group"
        tabIndex={0}
        aria-label={`${t('bill.totals')} — ${t('bill.totalsMove')}`}
        onPointerDown={(event) => {
          if (isEditable(event.target)) return;

          held.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!held.current) return;

          const sheet = event.currentTarget.parentElement?.parentElement;
          const box = sheet?.getBoundingClientRect();
          if (!box) return;

          onAlign(stopAt(event, box));
        }}
        onPointerUp={() => {
          held.current = false;
        }}
        onPointerCancel={() => {
          held.current = false;
        }}
        onKeyDown={(event) => {
          /* `TOTALS_ALIGNMENTS` reads left, centre, right — physically — so the
             arrow keys index it directly whatever the script. */
          const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
          if (!step) return;

          event.preventDefault();
          const at = TOTALS_ALIGNMENTS.indexOf(alignment);
          const next = TOTALS_ALIGNMENTS[Math.min(2, Math.max(0, at + step))];
          if (next) onAlign(next);
        }}
        className={cn(
          'flex w-1/2 cursor-grab touch-none flex-col gap-1 rounded-sm border border-dashed border-transparent p-1',
          'hover:border-border hover:bg-card focus:border-border focus:outline-none',
        )}
      >
        {children}
      </dl>
    </div>
  );
}

/**
 * Whether a press landed on something that is not a drag.
 *
 * The editable words, the two buttons and the resize grip all live inside the
 * thing being dragged, and all of them want the press for themselves. Asking
 * what was pressed is what lets the *rest* of the item — its padding, its
 * frame, the mark itself — start a drag without a handle to find first.
 */
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('[contenteditable="true"], button, [role="button"], input'))
  );
}

/**
 * A word on the page that the clinic owns.
 *
 * ## Why `contentEditable` and not an input
 *
 * An input here has to be sized to its content or every label sits in a box the
 * width of a form field and the page stops looking like a bill. A span does
 * that by being a span.
 *
 * ⚠ **It is deliberately uncontrolled.** React must not re-render the editable
 * node's children while somebody is typing in it — that resets the caret to the
 * end, which is the bug the price field in `service-prices-settings.tsx` had to
 * work around. The text is set once as `children` and never handed back.
 *
 * `name` posts it. A custom item has no field of its own — its words live in
 * the arrangement — so it reports upwards through `onChange` instead.
 */
function InlineText({
  name,
  stored,
  placeholder,
  announce,
  onChange,
  className,
}: {
  name: string;
  stored?: string;
  placeholder: string;
  /** What a screen reader calls this, when the placeholder is not a name. */
  announce?: string;
  /** Given instead of a posted field, for text that belongs to a placement. */
  onChange?: (text: string) => void;
  className?: string;
}) {
  const [value, setValue] = useState(stored ?? '');
  const [initial] = useState(stored ?? '');

  return (
    <>
      {onChange ? null : <input type="hidden" name={name} value={value} />}
      <span
        role="textbox"
        tabIndex={0}
        aria-label={announce ?? placeholder}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(event) => {
          const text = event.currentTarget.textContent ?? '';
          setValue(text);
          onChange?.(text);
        }}
        className={cn(
          'inline-block min-w-8 cursor-text rounded-sm px-1 outline-none',
          'hover:bg-accent focus:bg-accent focus:ring-2 focus:ring-ring',
          'empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]',
          className,
        )}
      >
        {initial}
      </span>
    </>
  );
}

/** A figure or a name a bill will hold — not the clinic's to write. */
function Sample({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap text-muted-foreground">{children}</span>;
}

function Total({ label, sample, strong }: { label: ReactNode; sample: string; strong?: boolean }) {
  return (
    <div
      className={cn(
        'flex justify-between gap-3',
        strong && 'border-t border-border pt-1 font-semibold',
      )}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        <Sample>{sample}</Sample>
      </dd>
    </div>
  );
}

function FormsError({ state }: { state: FormsActionState }) {
  const t = useTranslations('forms');

  if (state.status !== 'error') return null;

  return (
    <FieldError>
      {state.messageKey === 'errors.unknownPlaceholder'
        ? t('errors.unknownPlaceholder', { placeholder: state.placeholder })
        : t(state.messageKey)}
    </FieldError>
  );
}
