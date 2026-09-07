/**
 * Names the service on charges recorded before charges carried one.
 *
 *   bun run db:backfill:charge-services           # report only, writes nothing
 *   bun run db:backfill:charge-services --apply   # write the services
 *
 * `client_charges.service` arrived in migration 0033 as a nullable column with
 * no backfill, so every charge recorded before it answers `null`. That is not a
 * cosmetic gap: the column is what `subscriptionStanding` reads to decide
 * whether a subscriber is inside a term, and what `serviceTone` reads to tint a
 * ledger row. A three-month subscription sold before 0033 is, as far as both of
 * those are concerned, not a subscription at all.
 *
 * ## What it matches on, and why that is sound rather than a guess
 *
 * `RecordChargeDialog` posts the *label* as the description — see the note on
 * `options` there, where the value and the label are deliberately the same
 * string for a service. So a charge recorded through the card carries the
 * service's own name, in the language the dietitian was working in, as its
 * description. This matches that description against **that clinic's own**
 * service names, in both languages, and writes back the key they belong to.
 *
 * ⚠ It reads `clinic_services`, which is where the list lives now — one per
 * clinic, named by the clinic. It used to read the message catalogue, back when
 * every clinic sold the same three things under the same two translations. A
 * clinic that has since renamed a service will not match charges recorded under
 * the old name, and that is the honest outcome: this script infers a fact from
 * words, and words that are no longer anywhere are not evidence.
 *
 * It is exact, trimmed, case-insensitive matching. Nothing is inferred from a
 * substring: a description reading "Consultation and diet plan" is a charge
 * somebody typed themselves, and reading it as `consultation` would invent a
 * fact that changes what the subscription rules do.
 *
 * ## Guarantees
 *
 * - **Idempotent.** Only rows where `service IS NULL` are considered, so a row
 *   already naming its service is never rewritten. Running twice changes
 *   nothing the second time.
 * - **Conservative.** A description matching no label is left null and counted
 *   as `unmatched`. Those are freehand charges, which is a real and permanent
 *   state — `serviceTone` has a fallback for exactly them.
 * - **Atomic.** All writes happen in one transaction.
 * - **Report first.** Without `--apply` it only counts, so the numbers can be
 *   read before anything is written.
 */
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { clientCharges, clinicServices } from '@/db/schema';

const apply = process.argv.includes('--apply');

/**
 * Every name each clinic's services go by, lowercased, pointing at their key.
 *
 * Keyed by clinic and then by label, because two clinics may well call two
 * different things "متابعة" — matching across the whole deployment would file
 * one clinic's charge under another clinic's service key. Both languages, since
 * the description is in whichever one the dietitian had the app in.
 */
async function labelIndex(): Promise<Map<string, Map<string, string>>> {
  const rows = await db
    .select({
      clinicId: clinicServices.clinicId,
      key: clinicServices.key,
      nameAr: clinicServices.nameAr,
      nameEn: clinicServices.nameEn,
    })
    .from(clinicServices);

  const byClinic = new Map<string, Map<string, string>>();

  for (const row of rows) {
    const labels = byClinic.get(row.clinicId) ?? new Map<string, string>();

    for (const name of [row.nameAr, row.nameEn]) {
      const label = name.trim().toLowerCase();
      if (label) labels.set(label, row.key);
    }

    byClinic.set(row.clinicId, labels);
  }

  return byClinic;
}

async function main() {
  const index = await labelIndex();

  console.info(`clinics with a service list: ${index.size}`);

  const rows = await db
    .select({
      id: clientCharges.id,
      clinicId: clientCharges.clinicId,
      clientId: clientCharges.clientId,
      description: clientCharges.description,
      chargedOn: clientCharges.chargedOn,
    })
    .from(clientCharges)
    .where(isNull(clientCharges.service));

  const matched = new Map<string, typeof rows>();
  const unmatched: typeof rows = [];

  for (const row of rows) {
    const key = index.get(row.clinicId)?.get((row.description ?? '').trim().toLowerCase());

    if (!key) {
      unmatched.push(row);
      continue;
    }

    const bucket = matched.get(key) ?? [];
    bucket.push(row);
    matched.set(key, bucket);
  }

  const total = [...matched.values()].reduce((sum, bucket) => sum + bucket.length, 0);

  console.info(`\ncharges with no service:  ${rows.length}`);
  for (const [key, bucket] of matched) {
    console.info(`  ${key.padEnd(22)}${bucket.length}`);
  }
  console.info(`  unmatched (freehand): ${unmatched.length}`);

  if (apply && total > 0) {
    /* One transaction: the ledger is either named throughout or untouched.
       Updating by id rather than by description so a row cannot be caught by a
       description that changed between the read and the write. */
    await db.transaction(async (tx) => {
      for (const [value, bucket] of matched) {
        for (const row of bucket) {
          await tx
            .update(clientCharges)
            .set({ service: value })
            .where(and(eq(clientCharges.id, row.id), isNull(clientCharges.service)));
        }
      }
    });

    console.info(`\nwritten: ${total}`);
  }

  if (unmatched.length) {
    console.info('\nLeft null, correctly — these name no service the catalogue knows:');
    for (const row of unmatched.slice(0, 20)) {
      console.info(
        `  clinic=${row.clinicId} client=${row.clientId} ${row.chargedOn} ${JSON.stringify(row.description)}`,
      );
    }
    if (unmatched.length > 20) console.info(`  ... and ${unmatched.length - 20} more`);
  }

  if (!apply && total > 0) {
    console.info('\nRe-run with --apply to write these services.');
  }

  process.exit(0);
}


main().catch((error) => {
  console.error(error);
  process.exit(1);
});
