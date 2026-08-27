'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { saveFormsAction } from '@/features/forms/actions';
import { BillFormEditor } from '@/features/forms/components/bill-form-editor';
import {
  MESSAGE_FORM_FIELDS,
  type ClinicForms,
  type MessageFormField,
} from '@/features/forms/fields';
import { initialFormsState, type FormsActionState } from '@/features/forms/form-state';
import { placeholdersIn } from '@/features/forms/placeholders';
import { SettingsEditDialog } from '@/features/settings/components/settings-edit-dialog';
import { SettingsRow, SettingsSection } from '@/features/settings/components/settings-section';
import type { Locale } from '@/i18n/routing';

/**
 * The Forms tab: the words this clinic puts on a bill, and the words it sends a
 * patient automatically.
 *
 * ## What this is for
 *
 * Every clinic bills and messages in its own voice. The app ships copy that is
 * correct and neutral — "Your appointment at {clinicName} is confirmed" — and a
 * clinic that wants to add its parking directions, its cancellation policy or
 * simply its own phrasing had no way to say so short of turning the automatic
 * messages off and sending each one by hand.
 *
 * ## Two sections, one editor shape
 *
 * The bill's labels are one dialog: they are one document and are read against
 * each other, so renaming "Amount" while "Total" still says something else is a
 * mistake you see by having both on screen.
 *
 * Each message is its own dialog, because each is a whole message — a text area
 * with the placeholders listed under it, not a field in a form.
 *
 * ## What the reader is trusted with, and what they are not
 *
 * Anything typed here is what the patient reads: there is no preview step and no
 * approval. That is the point — a message a dietitian has to check afterwards is
 * a message they may as well have sent themselves. The one thing the editor will
 * not accept is a placeholder the message cannot fill, because that is the only
 * mistake whose consequence lands somewhere nobody is looking: at send time, as
 * a message that never arrives. See `./placeholders.ts`.
 *
 * A saved message is in force for the next appointment booked, moved or
 * deleted. Nothing is re-sent and nothing already sent changes — a WhatsApp
 * message is gone the moment it leaves.
 */
export function FormsSettings({
  locale,
  forms,
  defaults,
  logo,
  clinicName,
  doctorName,
  clinicAddress,
}: {
  locale: Locale;
  /** What this clinic has already rewritten, by field key. */
  forms: ClinicForms;
  /**
   * The app's own body for each editable message, by field key.
   *
   * Passed down rather than read here, because the copy lives in
   * `whatsapp/templates.ts` — one set of words, in the file that sends them.
   * Duplicating it into the catalogue so this component could look it up would
   * be two places to change a message and one of them wrong.
   */
  defaults: ClinicForms;
  /** The clinic's mark, from `clinics.logo_url` — see `BillLayoutSettings` for
      why it is shown here and uploaded on the Clinic tab. */
  logo: string | null;
  /** The clinic's own name — what the printed name falls back to. */
  clinicName: string;
  /** Who practises here — the bill's head can name them. */
  doctorName: string | null;
  /** Where the clinic is — printed in the bill's head when it is set. */
  clinicAddress: string | null;
}) {
  const t = useTranslations('forms');

  return (
    <>
      {/*
        The bill, whole: its name, its mark, where its blocks sit, the clinic's
        own lines and every label on it — one section, one button, one screen.
        See `BillFormEditor` for why it is not three.
      */}
      <BillFormEditor
        locale={locale}
        forms={forms}
        logo={logo}
        clinicName={clinicName}
        doctorName={doctorName}
        clinicAddress={clinicAddress}
      />

      <SettingsSection
        title={t('messages.title')}
        description={t('messages.description')}
        icon="whatsapp"
      >
        {/*
          A row per message, and here that is right where it was not for the
          bill: these are three separate messages sent at three different
          moments, and a clinic rewriting the cancellation notice is not
          thinking about the booking confirmation.
        */}
        {MESSAGE_FORM_FIELDS.map((field) => (
          <SettingsRow
            key={field.key}
            label={t(`messages.${field.message}`)}
            description={t(`messages.${field.message}Help`)}
            /* Whether this clinic has its own wording, rather than the wording
               itself: a message is a paragraph, and a paragraph in a settings
               row is a wall of text between two controls. */
            value={
              <span className="text-muted-foreground">
                {forms[field.key] ? t('custom') : t('default')}
              </span>
            }
            action={
              <MessageFormDialog
                locale={locale}
                field={field}
                stored={forms[field.key]}
                fallback={defaults[field.key] ?? ''}
              />
            }
          />
        ))}
      </SettingsSection>
    </>
  );
}

/**
 * One automatic message, as the patient will receive it.
 *
 * Prefilled with the app's own body rather than left empty, which is the
 * opposite of a bill label in `BillFormEditor` and for the opposite reason: a
 * label is a word you replace, and a message is a paragraph you edit. Nobody rewrites a
 * booking confirmation from a blank box, and a placeholder holding six lines of
 * grey text is a message you cannot edit until you have retyped it.
 *
 * Clearing the box and saving still means "use the app's own", because the
 * action deletes an empty value — so the way back is emptying the field, and
 * the row behind it says which state it is in.
 */
function MessageFormDialog({
  locale,
  field,
  stored,
  fallback,
}: {
  locale: Locale;
  field: MessageFormField;
  stored?: string;
  /** The app's own body for this message, for a clinic starting from it. */
  fallback: string;
}) {
  const t = useTranslations('forms');
  /* Held here rather than in the text area: the footer's Restore has to be able
     to write it, and the footer is the dialog's. */
  const [body, setBody] = useState(stored ?? fallback);
  /*
    Showing the app's own words, and not this clinic's, since the last Restore —
    false again at the first keystroke after it.

    It decides what is *posted*. Saving the app's copy back as a clinic's own
    would leave the row reading "Custom" for a message nobody has customised, and
    would freeze that wording if the app's improves; an empty value deletes the
    row instead — see `saveClinicForms` — which is what "the app's default"
    actually is.
  */
  const [restored, setRestored] = useState(false);

  /**
   * Take an edit, unless it takes a fillable word out of the message.
   *
   * ## Why an edit can be refused at all
   *
   * `{clientName}` is not text the writer owns: it is an instruction to the
   * sender to put a name there. Half of it typed over is not a shorter
   * placeholder, it is a message that arrives reading "مرحباً {clientNam" — and
   * the person it arrives at is not in the room to notice. The save cannot catch
   * it either: a broken token is either a name the message cannot fill, which is
   * refused, or worse, a name it *can*, which sends.
   *
   * So the words around them are the clinic's and the words themselves are not.
   * An edit leaving fewer of any one of them than the message already had is
   * dropped, and the box keeps what it had.
   *
   * Restore is a separate path: it replaces the whole message with the app's
   * own, placeholders and all.
   */
  const write = (text: string) => {
    const kept = placeholdersIn(body).every(
      (name) => occurrences(text, name) >= occurrences(body, name),
    );
    if (!kept) return;

    setBody(text);
    setRestored(false);
  };
  return (
    <SettingsEditDialog
      locale={locale}
      title={t(`messages.${field.message}`)}
      triggerLabel={t('edit')}
      size="wide"
      action={saveFormsAction}
      initialState={initialFormsState}
      /*
        Beside Cancel rather than under the box: it is a decision about the whole
        message, like the two next to it. It changes nothing until Save, so there
        is no confirmation — closing the dialog is the undo.
      */
      footerStart={
        <Button
          type="button"
          variant="neutral"
          onClick={() => {
            setBody(fallback);
            setRestored(true);
          }}
        >
          {t('messages.reset')}
        </Button>
      }
    >
      {(state) => (
        <>
          <MessageBody
            field={field}
            value={body}
            onChange={write}
            /* Restored: the box shows the app's words and posts nothing, so the
               save clears this clinic's copy rather than rewriting it as theirs. */
            posts={!restored}
          />

          <FormsError state={state} />
        </>
      )}
    </SettingsEditDialog>
  );
}

/** How many times one fillable word appears in a message. */
function occurrences(text: string, name: string): number {
  return text.split(`{${name}}`).length - 1;
}

function MessageBody({
  field,
  value,
  onChange,
  posts,
}: {
  field: MessageFormField;
  value: string;
  onChange: (text: string) => void;
  /** Whether what is in the box is what the form should send. */
  posts: boolean;
}) {
  return (
    <>
    {/* An empty value where the box is only showing the app's own words: it is
        what tells the action to drop this clinic's copy. */}
    {posts ? null : <input type="hidden" name={field.key} value="" />}
    <Textarea
      id={field.key}
      {...(posts ? { name: field.key } : null)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={10}
      /* The patient's own language, whatever the staff are reading the settings
         page in — every outgoing message is Arabic. See
         `PATIENT_MESSAGE_LOCALE`. */
      dir="rtl"
      className="min-h-40"
    />
    </>
  );
}

/**
 * What went wrong, in the reader's own terms.
 *
 * The placeholder failure names the offending word, because "invalid" sends
 * somebody hunting through a message they have just written for a mistake the
 * app already knows the position of.
 */
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
