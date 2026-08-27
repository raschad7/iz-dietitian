'use server';

import { revalidatePath } from 'next/cache';

import { MAX_BODY_LENGTH } from '@/features/whatsapp/templates';
import { localeSchema } from '@/features/whatsapp/schema';
import { requireStaffClinic } from '@/lib/session';

import { allowedPlaceholders, formField } from './fields';
import { type FormsActionState } from './form-state';
import { saveClinicForms } from './mutations';
import { unknownPlaceholders } from './placeholders';

/**
 * The Forms tab's one write.
 *
 * A server action is a public endpoint — the page guard protects the render,
 * not the write — so this re-verifies the staff session and scopes everything
 * to the caller's own clinic. Same shape as every other feature's actions file:
 * the rules live beside the fields they are about, the write lives in
 * `./mutations.ts`, and only the Next.js concerns are here.
 *
 * ## It takes whichever fields the dialog had open
 *
 * The form posts one input per field, named by its key, and this reads back
 * only the keys it recognises — so the bill dialog posts sixteen and a message
 * dialog posts one, and neither has to tell the action which editor it was.
 * A key the code does not know is ignored rather than rejected: it is either a
 * field that has since been removed or something somebody appended by hand, and
 * neither is worth failing a clinic's save over.
 *
 * ## What it refuses
 *
 * A message body naming a placeholder the message cannot fill, and a body over
 * the gateway's length. Both are checked here, in front of the person who typed
 * it, rather than at send time in front of nobody — see `./placeholders.ts`.
 * Bill labels are refused only for length, because a label is printed as it is
 * written.
 */
export async function saveFormsAction(
  _previous: FormsActionState,
  formData: FormData,
): Promise<FormsActionState> {
  const locale = localeSchema.parse(formData.get('locale'));
  const { clinicId } = await requireStaffClinic(locale);

  const entries: { fieldKey: string; value: string }[] = [];

  for (const [name, raw] of formData.entries()) {
    if (typeof raw !== 'string') continue;

    const field = formField(name);
    if (!field) continue;

    /*
      Normalised the way a text area's own line endings are not: a browser posts
      CRLF inside a `<textarea>`, and a message stored with them would differ
      from the same message typed into a field that does not, for no reason a
      reader could see.
    */
    const value = raw.replaceAll('\r\n', '\n').trim();

    if (value.length > MAX_BODY_LENGTH) return { status: 'error', messageKey: 'errors.tooLong' };

    const [unknown] = unknownPlaceholders(value, allowedPlaceholders(field));
    if (unknown) {
      return { status: 'error', messageKey: 'errors.unknownPlaceholder', placeholder: unknown };
    }

    entries.push({ fieldKey: field.key, value });
  }

  if (entries.length === 0) return { status: 'error', messageKey: 'errors.invalid' };

  try {
    await saveClinicForms(clinicId, entries);
  } catch (error) {
    console.error('[forms] saving clinic wording failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  /*
    The settings page redraws with the new wording, and so does anything else
    that prints it: a bill is rendered on request from the ledger, so there is
    nothing else cached to invalidate — the next print reads these rows.
  */
  revalidatePath(`/${locale}/app/settings`);

  return { status: 'success' };
}

