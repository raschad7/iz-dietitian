/**
 * Plain data shapes shared with client components.
 *
 * This module deliberately imports nothing. `verbatimModuleSyntax` is on, so
 * `import { type X } from './queries'` in a client component still emits a real
 * `import {} from './queries'` — which would pull `@/db`, and with it the
 * Postgres driver, into the browser bundle. Types crossing the server/client
 * boundary live here instead.
 */
export type ClientFormValues = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  preferredLocale: string;
  dateOfBirth: string | null;
  sex: string | null;
  heightCm: number | null;
  goal: string | null;
  activityLevel: string | null;
  medicalNotes: string | null;
  allergies: string | null;
  notes: string | null;
};
