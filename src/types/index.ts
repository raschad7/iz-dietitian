import type { Locale } from '@/i18n/routing';

/**
 * Cross-cutting types only — anything that belongs to a single feature lives in
 * `src/features/<feature>/`, and anything derived from the database schema
 * should be inferred from Drizzle rather than hand-written here.
 */
export type { Direction, Locale } from '@/i18n/routing';
export type { Session, SessionUser, UserRole } from '@/lib/auth';

/** Shape of the `params` every page and layout under `[locale]` receives. */
export type LocaleParams = { locale: Locale };

export type LocalePageProps<TParams = Record<never, never>> = {
  params: Promise<LocaleParams & TParams>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};
