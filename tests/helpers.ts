import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { catalogFoodAliases, catalogFoodPortions, catalogFoods, clients, clinics, clinicWorkingHours, practitioners, pushSubscriptions, whatsappSettings, type WhatsappSettings } from '@/db/schema';
import { normalizeArabic } from '@/features/weekly-plans/arabic-normalize';
import { defaultClinicScheduleRows } from '@/features/clinic-profile/default-schedule';
import { normalizeForSearch } from '@/features/clients/search';
import { sessionNameForClinic } from '@/features/whatsapp/config';
import { type GatewaySentMessage, type WhatsappGateway } from '@/features/whatsapp/gateway';

/**
 * Creates a clinic and returns its id.
 *
 * Clients are scoped to a clinic, so every integration test needs at least one —
 * and the isolation tests need two.
 */
export async function createTestClinic(name = 'Test Clinic'): Promise<string> {
  const [clinic] = await db.insert(clinics).values({ name }).returning({ id: clinics.id });

  if (!clinic) throw new Error('insert into clinics returned no row');

  await db.insert(clinicWorkingHours).values(defaultClinicScheduleRows(clinic.id));

  return clinic.id;
}

/** A bookable practitioner. Appointments need one, and overlap tests need two. */
export async function createTestPractitioner(clinicId: string, name = 'Dr Test'): Promise<string> {
  const [row] = await db.insert(practitioners).values({ clinicId, name }).returning({ id: practitioners.id });

  if (!row) throw new Error('insert into practitioners returned no row');

  return row.id;
}

/**
 * A client, inserted directly rather than through `createClient` so that the
 * booking tests do not fail for a reason belonging to the clients feature.
 */
export async function createTestClient(clinicId: string, fullName = 'Test Client'): Promise<string> {
  const [row] = await db
    .insert(clients)
    .values({ clinicId, fullName, searchName: normalizeForSearch(fullName) })
    .returning({ id: clients.id });

  if (!row) throw new Error('insert into clients returned no row');

  return row.id;
}

/**
 * A clinic with WhatsApp connected, as it looks after a successful pairing.
 *
 * Defaults to `ready` because that is the only state a send is allowed from —
 * tests that care about the other states pass them explicitly.
 */
export async function createTestWhatsappSettings(
  clinicId: string,
  overrides: Partial<WhatsappSettings> = {},
): Promise<WhatsappSettings> {
  const [row] = await db
    .insert(whatsappSettings)
    .values({
      clinicId,
      sessionName: sessionNameForClinic(clinicId),
      sessionId: `sess-${clinicId}`,
      status: 'ready',
      ...overrides,
    })
    .returning();

  if (!row) throw new Error('insert into whatsapp_settings returned no row');

  return row;
}

/** Reads the settings row back, for assertions about what a handler wrote. */
export async function readWhatsappSettings(clinicId: string): Promise<WhatsappSettings | null> {
  const [row] = await db.select().from(whatsappSettings).where(eq(whatsappSettings.clinicId, clinicId)).limit(1);

  return row ?? null;
}

/**
 * A gateway that records instead of sending.
 *
 * The whole point of `WhatsappGateway` being an interface: the send pipeline,
 * the dedupe guarantee and the reminder scheduler are all testable without a
 * WhatsApp account, a container, or a network. Only the methods the tests exercise
 * do anything; the rest throw loudly if something reaches them unexpectedly.
 */
export type FakeGateway = WhatsappGateway & {
  sent: { sessionId: string; chatId: string; text: string }[];
  /** Set to make the next and every later send fail, as a dead gateway would. */
  failWith: Error | null;
};

export function createFakeGateway(): FakeGateway {
  const sent: FakeGateway['sent'] = [];

  const unexpected = (method: string) => (): never => {
    throw new Error(`FakeGateway.${method} was called but no test configured it.`);
  };

  const gateway: FakeGateway = {
    sent,
    failWith: null,

    async sendText(sessionId, chatId, text): Promise<GatewaySentMessage> {
      if (gateway.failWith) throw gateway.failWith;

      sent.push({ sessionId, chatId, text });

      return { messageId: `wamid-${sent.length}`, timestamp: 1_700_000_000 };
    },

    isReachable: async () => true,
    checkNumber: async () => true,
    getQr: async () => null,
    listWebhooks: async () => [],
    logoutSession: async () => undefined,
    deleteSession: async () => undefined,
    deleteWebhook: async () => undefined,

    ensureSession: unexpected('ensureSession'),
    getSession: unexpected('getSession'),
    startSession: unexpected('startSession'),
    createWebhook: unexpected('createWebhook'),
    updateWebhook: unexpected('updateWebhook'),
  };

  return gateway;
}

/**
 * Points the WhatsApp config at nothing in particular, so the feature considers
 * itself enabled. No gateway is ever contacted — every test passes a fake.
 */
export function enableWhatsappForTests(): void {
  process.env.WHATSAPP_ENABLED = 'true';
  process.env.WHATSAPP_API_KEY = 'test-api-key';
  process.env.WHATSAPP_WEBHOOK_SECRET = 'test-webhook-secret';
  process.env.WHATSAPP_PUBLIC_URL = 'http://localhost:3000';
  process.env.WHATSAPP_DEFAULT_COUNTRY_CODE = '970';
}

export function disableWhatsappForTests(): void {
  delete process.env.WHATSAPP_ENABLED;
}

/**
 * A VAPID keypair, so the push feature considers itself configured.
 *
 * A real, matched pair rather than two arbitrary strings: `web-push` validates
 * the key's shape before it signs anything, so a placeholder would make every
 * test fail for a reason that has nothing to do with what it was testing. No
 * push service is ever contacted — every test passes a fake transport, and the
 * real one is only reached through `sendWebPush`'s injectable seam.
 *
 * ⚠ This pair is **for tests and is published in the repository**. It must
 * never appear in a deployment's `.env`; generate one with
 * `bunx web-push generate-vapid-keys`.
 */
export function enableWebPushForTests(): void {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
    'BJTSq0irnDi0YL6foOPC9WZq5PGv83irRfytHgzwYIe_XK2ofUgbcFvwOzVBWBPR2T4VF6x3smKvlW3DiMrooR0';
  process.env.VAPID_PRIVATE_KEY = 'MfgBxTae__fzipy0Gc38MMan-qdgJA2nlf-P500jFzM';
  process.env.VAPID_SUBJECT = 'mailto:test@example.com';
}

export function disableWebPushForTests(): void {
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
}

/** One registered device for a client, as `savePushSubscription` would write it. */
export async function createTestPushSubscription(
  clientId: string,
  overrides: Partial<{ endpoint: string; locale: 'ar' | 'en' }> = {},
): Promise<{ id: string; endpoint: string }> {
  const endpoint = overrides.endpoint ?? `https://push.example.com/${randomUUID()}`;

  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      clientId,
      endpoint,
      // Shaped like the real thing — 65 and 16 bytes base64url — though nothing
      // in a test ever encrypts against them.
      p256dh: 'BJTSq0irnDi0YL6foOPC9WZq5PGv83irRfytHgzwYIe_XK2ofUgbcFvwOzVBWBPR2T4VF6x3smKvlW3DiMrooR0',
      auth: 'k8JV6sjdzhhFsmZTMlwsyg',
      locale: overrides.locale ?? 'ar',
    })
    .returning({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint });

  if (!row) throw new Error('insert into push_subscriptions returned no row');

  return row;
}

/**
 * Truncates every table in `public`, discovered at runtime rather than listed,
 * so adding a table never silently leaves data behind between tests.
 *
 * `scripts/database-safety.ts` already validates the connection string before
 * anything connects, but a validated string is not proof of which database
 * postgres.js actually reached (see that file for why). The server itself is
 * the only source of truth, so re-check `current_database()` right here,
 * immediately before the destructive TRUNCATE, and refuse unless its name
 * ends in `_test`.
 */
export async function resetDatabase(): Promise<void> {
  const [current] = await db.execute<{ current_database: string }>(sql`SELECT current_database()`);
  if (!current) throw new Error('SELECT current_database() returned no rows');

  if (!current.current_database.endsWith('_test')) {
    throw new Error(`Refusing to truncate database "${current.current_database}": its name must end in _test.`);
  }

  const rows = await db.execute<{ tablename: string }>(sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `);

  if (rows.length === 0) return;

  const tables = sql.join(
    rows.map((row) => sql.identifier(row.tablename)),
    sql`, `,
  );

  await db.execute(sql`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

/**
 * A canonical catalog food.
 *
 * Every recipe points at `catalog_foods` since the Phase 1 cutover, so anything
 * that builds a dish needs one of these rather than a `foods` row. Nutrition
 * defaults to round numbers so a test can assert totals by hand; pass nulls for a
 * nutrient to exercise the unmeasured path.
 */
export async function createTestCatalogFood(
  overrides: Partial<typeof catalogFoods.$inferInsert> = {},
): Promise<string> {
  const nameAr = overrides.nameAr ?? 'طعام تجريبي';
  const nameEn = overrides.nameEn ?? 'Test food';

  const [row] = await db
    .insert(catalogFoods)
    .values({
      slug: overrides.slug ?? `test-food-${randomUUID()}`,
      nameAr,
      nameEn,
      normalizedNameAr: normalizeArabic(nameAr),
      normalizedNameEn: normalizeArabic(nameEn),
      state: 'raw',
      category: 'other',
      kcal: 300,
      protein: 12,
      fat: 5,
      carbs: 50,
      sourceType: 'usda_sr_legacy',
      ...overrides,
    })
    .returning({ id: catalogFoods.id });

  if (!row) throw new Error('insert into catalog_foods returned no row');

  return row.id;
}

/**
 * A household measure for a catalog food, and what one of it weighs.
 *
 * Scope is inherited from the food, so a portion created here is visible to
 * exactly whoever the food is — which is what the cross-clinic tests rely on.
 */
export async function createTestCatalogPortion(
  foodId: string,
  portion: { labelAr: string; labelEn: string; grams: number; isDefault?: boolean; sortOrder?: number },
): Promise<string> {
  const [row] = await db
    .insert(catalogFoodPortions)
    .values({
      foodId,
      labelAr: portion.labelAr,
      labelEn: portion.labelEn,
      grams: portion.grams,
      isDefault: portion.isDefault ?? false,
      sortOrder: portion.sortOrder ?? 0,
    })
    .returning({ id: catalogFoodPortions.id });

  if (!row) throw new Error('insert into catalog_food_portions returned no row');

  return row.id;
}

/** An Arabic or English synonym for a catalog food. */
export async function createTestCatalogAlias(
  foodId: string,
  name: string,
  locale: 'ar' | 'en' = 'ar',
): Promise<void> {
  await db
    .insert(catalogFoodAliases)
    .values({ foodId, name, normalizedName: normalizeArabic(name), locale })
    .onConflictDoNothing();
}
