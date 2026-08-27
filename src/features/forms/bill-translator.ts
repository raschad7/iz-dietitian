import { type BillTranslator } from '@/features/billing/bill';

import { type ClinicForms } from './fields';

/**
 * The bill's translator, with the clinic's own labels in front of it.
 *
 * ## Why a wrapper and not a prop on the document
 *
 * `BillDocument` already takes its words from a function — see
 * `BillTranslator`, which exists so the PDF and the menu cannot describe the
 * same bill differently. A clinic's wording is the same question asked one step
 * earlier: what does this key say *here*. So it is answered by substituting the
 * function, and the document is untouched — no `labels` prop threaded through
 * sixteen call sites, and no second lookup for a future label to forget.
 *
 * It also means everything that prints a bill inherits this by wrapping `t`
 * once where it is created, and anything that does not wrap keeps the app's own
 * copy, which is a correct bill rather than a broken one.
 *
 * ## What it can and cannot change
 *
 * Only the keys in `BILL_FORM_FIELDS`, prefixed `bill.` in the table. Every
 * other key — and every key with arguments — falls straight through to the
 * catalogue. A clinic cannot rewrite a figure, a date or a bill number this
 * way, because none of those is a translation: they come from the ledger.
 *
 * ⚠ The override is returned verbatim, with no ICU parsing. The editable labels
 * are plain nouns, and a clinic that typed `{count, plural, ...}` into one would
 * get it printed as it stands rather than a runtime error on a document
 * somebody is waiting for.
 */
export function billTranslatorWith(t: BillTranslator, forms: ClinicForms): BillTranslator {
  /*
    The cast is at this one boundary and is what the rest of the app is spared.
    `BillTranslator` is next-intl's own function type — overloaded, generic over
    every key in the namespace, and carrying `rich`, `markup` and `raw` — so a
    hand-written function cannot satisfy it structurally without reimplementing
    it. What is actually needed is far smaller: one call, one key, a string
    back, which is all `BillDocument` uses.
  */
  const translate = ((key: string, ...rest: unknown[]) => {
    const override = forms[`bill.${key}`];

    /* Arguments mean it is not one of ours: every editable label is a plain
       noun, and a key being given values is a key with holes in it. */
    if (override !== undefined && rest.length === 0) return override;

    return (t as unknown as (key: string, ...rest: unknown[]) => string)(key, ...rest);
  }) as unknown as BillTranslator;

  /* `rich`, `markup`, `raw` and `has` are carried across untouched. Nothing on
     the bill uses them today; a document that starts to should get next-intl's
     own behaviour rather than an undefined. */
  return Object.assign(translate, t);
}
