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
 * description. This matches that description against the catalogue's labels in
 * both locales and writes back the key they belong to.
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
import { clientCharges } from '@/db/schema';
import arMessages from '@/i18n/messages/ar.json';
import enMessages from '@/i18n/messages/en.json';
import { BILLING_SERVICES, type BillingService } from '@/features/billing/services';

const apply = process.argv.includes('--apply');

/**
 * Every label a service has ever been shown under, lowercased, pointing at its
 * key.
 *
 * Built from the message catalogues rather than written out here, so a service
 * renamed in one of them cannot leave this script matching a string the app
 * stopped using. Both locales, because the description is in whichever language
 * the dietitian had the app in when they recorded the charge.
 */
function labelIndex(): Map<string, BillingService> {
  const index = new Map<string, BillingService>();

  for (const messages of [arMessages, enMessages]) {
    const services = messages.billing.services as Record<string, string>;

    for (const { value } of BILLING_SERVICES) {
      const label = services[value];
      if (label) index.set(label.trim().toLowerCase(), value);
    }
  }

  return index;
}

async function main() {
  const index = labelIndex();

  console.info(`labels known: ${index.size}`);
  for (const [label, value] of index) console.info(`  ${JSON.stringify(label)} -> ${value}`);

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

  const matched = new Map<BillingService, typeof rows>();
  const unmatched: typeof rows = [];

  for (const row of rows) {
    const key = index.get((row.description ?? '').trim().toLowerCase());

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
  for (const { value } of BILLING_SERVICES) {
    console.info(`  ${value.padEnd(22)}${matched.get(value)?.length ?? 0}`);
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
