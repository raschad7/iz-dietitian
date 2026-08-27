import { WHATSAPP_PLACEHOLDERS, type WhatsappFormKind } from '@/features/forms/placeholders';

/**
 * Every piece of text a clinic can rewrite, and where its default comes from.
 *
 * This is the whole contract of the Forms tab. The settings screen renders from
 * it, the action validates against it, and both readers — the bill PDF and the
 * WhatsApp sender — look their key up in it. One list, so a field cannot exist
 * in the editor and be ignored by the document that is supposed to use it.
 *
 * ## Two shapes of field, one list
 *
 * A bill label is a handful of words on a document that is otherwise figures; a
 * message body is the whole message. They are edited differently — a line and a
 * text area — and stored identically, which is why `kind` is a property here
 * rather than two lists that would drift apart.
 */

/**
 * The bill's own words, in the order they appear on the page: the heading, the
 * details block, the table, the totals, and the line at the foot.
 *
 * ⚠ **Labels only.** Nothing here changes a figure, an amount, a date or which
 * rows are printed — those come from the ledger, and a bill whose *numbers*
 * could be rewritten in Settings would not be a record of anything. The layout
 * is fixed too; what a clinic gets is the vocabulary.
 *
 * `as const` and not a plain array: these are catalogue keys, and keeping them
 * literal is what makes `t(field.defaultKey)` in the editor a compile-time check
 * rather than a blank label at runtime.
 */
const BILL_LABEL_KEYS = [
  'bills.statementTitle',
  'bills.billTitle',
  'bills.billNo',
  'bills.subscriber',
  'bills.issuedOn',
  'bills.date',
  'bills.description',
  'bills.amount',
  'bills.charge',
  'bills.payment',
  'bills.emptyLedger',
  'fields.totalPrice',
  'fields.totalPayment',
  'fields.remaining',
  'fields.balance',
  'bills.footer',
] as const;

/** One editable label's key inside the `billing` namespace. */
export type BillLabelKey = (typeof BILL_LABEL_KEYS)[number];

/** A bill label: short, no placeholders, printed on the document. */
export type BillFormField = {
  kind: 'bill';
  key: string;
  /**
   * The catalogue key its default text comes from, inside the `billing`
   * namespace.
   *
   * The default is *read from the catalogue* rather than copied here, so a
   * clinic that has changed nothing keeps getting the app's own wording as it
   * is improved — and gets it in both languages, which a stored default could
   * not do. See the note on `clinic_forms`.
   */
  defaultKey: BillLabelKey;
};

/**
 * The name printed at the head of a bill, when the clinic wants it printed
 * differently from the name the app knows it by.
 *
 * A field rather than an edit to `clinics.name`, because they are two different
 * facts. The clinic's name is what staff pick it out by everywhere in the app —
 * the rail, the portal, a client's own screen — and a bill often has to carry
 * something longer and more formal: a registered name, a partnership, a line
 * with a licence number in it. Changing one to fix the other would rename the
 * clinic everywhere to fix a document.
 *
 * Empty means "the clinic's name", which is what a bill printed before this
 * existed and what it prints again the moment the field is cleared.
 */
export const CLINIC_NAME_FIELD = 'bill.header.clinicName';

/** A free field: text the clinic writes, with no catalogue default behind it. */
export type FreeFormField = {
  kind: 'free';
  key: string;
};

/** A WhatsApp message body: the whole message, with placeholders in it. */
export type MessageFormField = {
  kind: 'message';
  key: string;
  /** Which automatic message this is, which is also where its default body and
      its allowed placeholders come from. */
  message: WhatsappFormKind;
};
export type FormField = BillFormField | MessageFormField | FreeFormField;

/**
 * Each label as a field.
 *
 * The stored key is the catalogue key with `bill.` in front, which makes the
 * row self-describing: reading `bill.bills.footer` in the database says exactly
 * what it is, and `billTranslatorWith` gets back to the catalogue key by
 * dropping one prefix.
 */
export const BILL_FORM_FIELDS: readonly BillFormField[] = BILL_LABEL_KEYS.map((defaultKey) => ({
  kind: 'bill',
  key: `bill.${defaultKey}`,
  defaultKey,
}));

/**
 * The automatic messages, in the order an appointment moves through them:
 * booked, reminded, moved, deleted — and the one that is about the account
 * rather than the appointment: the reminder of what is still owed.
 *
 * The reminder is the one that goes out on a schedule rather than in response
 * to something a person just did — see `reminders.ts`. That makes it the
 * message a clinic is least able to check by watching, and the one its own
 * wording matters most on: it arrives the evening before, unprompted, and is
 * the last thing a patient reads before deciding whether to come.
 */
export const MESSAGE_FORM_FIELDS = (
  [
    'appointmentConfirmation',
    'appointmentReminder',
    'appointmentRescheduled',
    'appointmentCancelled',
    'paymentReminder',
  ] as const
).map<MessageFormField>((message) => ({ kind: 'message', key: `message.${message}`, message }));

/**
 * Where the clinic put everything in the two free zones, as JSON — see
 * `./zones.ts`, which owns the shape, the defaults and the reading of it.
 *
 * ⚠ Not validated field by field on the way in. `placementsFrom` is forgiving
 * by design — an id it does not know is dropped, a missing one is restored at
 * its default, a malformed value yields the default arrangement — because the
 * alternative is a bill that refuses to print over a settings row. The action's
 * length cap is what stops it being unbounded.
 */
export const PLACEMENTS_FIELD = 'layout.zones';

/** Which side of the page the totals block takes — see `totalsAlignmentFrom`. */
export const TOTALS_ALIGN_FIELD = 'layout.totals';

/** The free fields on the bill: its printed name, its rows, its arrangement. */
export const FREE_FORM_FIELDS: readonly FreeFormField[] = [
  { kind: 'free', key: CLINIC_NAME_FIELD },
  { kind: 'free', key: PLACEMENTS_FIELD },
  { kind: 'free', key: TOTALS_ALIGN_FIELD },
];

/** Every editable field. The valid values of `clinic_forms.field_key`. */
export const FORM_FIELDS: readonly FormField[] = [
  ...BILL_FORM_FIELDS,
  ...MESSAGE_FORM_FIELDS,
  ...FREE_FORM_FIELDS,
];

/** The stored overrides, by key. Absent means "the clinic has not changed it". */
export type ClinicForms = Record<string, string>;

/** The field a key names, or `undefined` for a key nothing renders any more. */
export function formField(key: string): FormField | undefined {
  return FORM_FIELDS.find((field) => field.key === key);
}

/**
 * Which placeholders a field may use — none, for a bill label.
 *
 * A bill label is printed beside the value it names; a `{clientName}` inside
 * one would be a hole nothing fills, and `renderWhatsappMessage`'s throw has no
 * equivalent on a PDF that would simply print the braces.
 */
export function allowedPlaceholders(field: FormField): readonly string[] {
  return field.kind === 'message' ? WHATSAPP_PLACEHOLDERS[field.message] : [];
}
