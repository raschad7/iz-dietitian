import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { AUDIT_PAGE_SIZE, countAuditEntries, listAuditEntries } from '@/features/admin/audit';
import { ADMIN_ACTIONS } from '@/features/admin/audit-rules';
import { actionMessageKey, AuditTable } from '@/features/admin/components/audit-table';
import { Pager } from '@/features/admin/components/pager';
import { AdminToolbar, FilterSelect } from '@/features/admin/components/toolbar';
import { resolveLocale } from '@/i18n/params';

type AuditPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; action?: string; target?: string; page?: string }>;
};

export async function generateMetadata({ params }: AuditPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'admin.audit' });
  return { title: t('title') };
}

/**
 * The record of what the platform operator did.
 *
 * ## The screen the panel did not have
 *
 * The first version of this area could suspend a practice, disable a dietitian,
 * hand somebody the platform role and rewrite a food every clinic reads — and
 * kept no record of any of it. "Who suspended this clinic, when, and why" had no
 * answer at all. Every source on internal admin tooling puts an audit trail
 * first, and they are right for a reason that has nothing to do with compliance:
 * the party affected by a privileged action cannot see it happen, so the only
 * check on it is a record somebody else can read.
 *
 * ## Paginated, unlike every other screen here
 *
 * The registry and the catalog are bounded by how many clinics and foods exist.
 * This table is bounded by how much has been done, and only ever grows — so it
 * is the one screen with a real page control rather than a cap and a note.
 *
 * ## Filters, and what they are for
 *
 * By verb, because "show me every suspension" is a question with an obvious
 * shape. By target type, because a support question is usually about a clinic or
 * an account and not both. And the search matches the operator's address, the
 * target's name **and the reason text** — an operator looking a decision up six
 * months later has whichever of the three they happen to remember.
 */
export default async function AuditPage({ params, searchParams }: AuditPageProps) {
  const locale = await resolveLocale(params);
  const query = await searchParams;

  const t = await getTranslations('admin.audit');
  const tFilters = await getTranslations('admin.filters');

  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const filters = {
    query: query.q?.trim() || undefined,
    action: query.action || undefined,
    targetType: query.target || undefined,
  };

  const [rows, total] = await Promise.all([
    listAuditEntries({ ...filters, limit: AUDIT_PAGE_SIZE, offset: (page - 1) * AUDIT_PAGE_SIZE }),
    countAuditEntries(filters),
  ]);

  /*
    The verb filter is built from `ADMIN_ACTIONS`, not from the distinct values
    in the table. That is deliberate: a verb nobody has used yet should still be
    offered — its absence from the list is the answer to "has this ever
    happened", and building the options from the data would make that question
    unaskable.
  */
  const actionOptions = [
    { value: '', label: tFilters('any') },
    ...ADMIN_ACTIONS.map((spec) => ({
      value: spec.key,
      // Through the map rather than a template: the message keys are camelCase
      // because next-intl reads a dot as nesting. See `ACTION_KEY`.
      label: t((actionMessageKey(spec.key) ?? 'empty') as 'actions.clinicSuspend'),
    })),
  ];

  const targetOptions = [
    { value: '', label: tFilters('any') },
    { value: 'clinic', label: t('targets.clinic') },
    { value: 'account', label: t('targets.account') },
    { value: 'food', label: t('targets.food') },
  ];

  return (
    <div className="space-y-4 text-start">
      <header className="space-y-1">
        <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('title')}</h1>
        <p className="max-w-3xl text-body-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <AdminToolbar
        action={`/${locale}/admin/audit`}
        path="/admin/audit"
        searchValue={filters.query}
        searchLabel={t('searchLabel')}
        hasFilters={Boolean(filters.query || filters.action || filters.targetType)}
      >
        <FilterSelect
          name="action"
          label={tFilters('action')}
          value={filters.action}
          options={actionOptions}
        />
        <FilterSelect
          name="target"
          label={tFilters('target')}
          value={filters.targetType}
          options={targetOptions}
        />
      </AdminToolbar>

      <AuditTable rows={rows} locale={locale} />

      <Pager
        page={page}
        pageSize={AUDIT_PAGE_SIZE}
        total={total}
        locale={locale}
        basePath="/admin/audit"
        params={{ q: filters.query, action: filters.action, target: filters.targetType }}
      />
    </div>
  );
}
