import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import { DisableAccountButton, PromoteAccountButton } from '@/features/admin/components/account-controls';
import { Pager } from '@/features/admin/components/pager';
import { AdminToolbar, FilterSelect } from '@/features/admin/components/toolbar';
import { ACCOUNTS_PAGE_SIZE, countAccounts, listAccounts } from '@/features/admin/queries';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { formatDateLtr } from '@/lib/format';

type AccountsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }>;
};

export async function generateMetadata({ params }: AccountsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'admin.accounts' });
  return { title: t('title') };
}

/** A role the screen has a word for; anything else is printed as stored. */
const ROLE_KEY = {
  admin: 'roles.admin',
  staff: 'roles.staff',
  client: 'roles.client',
} as const;

/**
 * Everyone who can sign in, across every clinic.
 *
 * ## It is paginated now, and it was not
 *
 * The first version read **every** account on the deployment — including every
 * patient, of whom a ten-dietitian practice has hundreds — sorted them in
 * JavaScript and rendered the lot. Correct on a development database with eight
 * rows; the slowest page in the application on a real one. The read is bounded
 * in SQL and so is the ordering, because sorting after a `limit` sorts whichever
 * rows the database happened to return, which is not the same list.
 *
 * ## Filters, and why these three
 *
 * **Role**, because "show me the admins" is the question this screen answers
 * fastest and it is the one worth checking regularly. **Status**, because a
 * disabled account and an unverified dietitian are both support cases and
 * neither is findable by name. And the **search**, which now matches in SQL with
 * `LIKE` wildcards escaped — before, a search containing `%` matched every row
 * and looked like the filter had failed to apply.
 *
 * ## Promotion is offered only on an enabled dietitian
 *
 * The action re-checks the role, the clinic's patient count and the reason, and
 * refuses with a sentence the reader can act on. The button is hidden here to
 * save a click that was always going to fail, not to enforce anything —
 * enforcement is the action's, because the action is a public endpoint.
 */
export default async function AccountsPage({ params, searchParams }: AccountsPageProps) {
  const locale = await resolveLocale(params);
  const query = await searchParams;

  const [t, tFilters] = await Promise.all([
    getTranslations('admin.accounts'),
    getTranslations('admin.filters'),
  ]);

  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const filters = {
    query: query.q?.trim() || undefined,
    role: query.role || undefined,
    status: query.status || undefined,
  };

  const [accounts, total] = await Promise.all([
    listAccounts({ ...filters, limit: ACCOUNTS_PAGE_SIZE, offset: (page - 1) * ACCOUNTS_PAGE_SIZE }),
    countAccounts(filters),
  ]);

  return (
    <div className="space-y-4 text-start">
      <header className="space-y-1">
        <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('title')}</h1>
        <p className="max-w-3xl text-body-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <AdminToolbar
        action={`/${locale}/admin/accounts`}
        path="/admin/accounts"
        searchValue={filters.query}
        searchLabel={t('searchLabel')}
        hasFilters={Boolean(filters.query || filters.role || filters.status)}
      >
        <FilterSelect
          name="role"
          label={tFilters('role')}
          value={filters.role}
          options={[
            { value: '', label: tFilters('any') },
            { value: 'admin', label: t('roles.admin') },
            { value: 'staff', label: t('roles.staff') },
            { value: 'client', label: t('roles.client') },
          ]}
        />
        <FilterSelect
          name="status"
          label={tFilters('status')}
          value={filters.status}
          options={[
            { value: '', label: tFilters('any') },
            { value: 'active', label: t('status.active') },
            { value: 'disabled', label: t('status.disabled') },
            { value: 'unverified', label: t('status.unverified') },
          ]}
        />
      </AdminToolbar>

      <TableRoot>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.account')}</TableHead>
              <TableHead>{t('columns.role')}</TableHead>
              <TableHead>{t('columns.clinic')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead numeric>{t('columns.lastSeen')}</TableHead>
              <TableHead numeric>{t('columns.joined')}</TableHead>
              <TableHead>{t('columns.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 ? (
              <TableEmpty colSpan={7}>{t('empty')}</TableEmpty>
            ) : (
              accounts.map((account) => (
                <TableRow key={account.id} zebra>
                  <TableCell>
                    <span className="block font-medium">{account.name}</span>
                    <span className="block text-caption text-muted-foreground" dir="ltr">
                      {account.email}
                    </span>
                  </TableCell>

                  <TableCell>
                    <Badge variant={account.role === 'admin' ? 'accent' : 'muted'}>
                      {ROLE_KEY[account.role as keyof typeof ROLE_KEY]
                        ? t(ROLE_KEY[account.role as keyof typeof ROLE_KEY])
                        : account.role}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {account.clinicId && account.clinicName ? (
                      /*
                        A link, which the first version did not have. An account
                        row that names a clinic and cannot open it makes the
                        reader go back to the registry and search for a name they
                        are already looking at.
                      */
                      <Link
                        href={`/admin/clinics/${account.clinicId}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {account.clinicName}
                      </Link>
                    ) : (
                      t('noClinic')
                    )}
                    {account.clinicSuspendedAt ? (
                      <span className="block text-caption text-status-attention-fg">
                        {t('clinicSuspended')}
                      </span>
                    ) : null}
                  </TableCell>

                  <TableCell>
                    {account.disabledAt ? (
                      <Badge variant="attention">{t('status.disabled')}</Badge>
                    ) : (
                      <Badge variant="muted">{t('status.active')}</Badge>
                    )}
                    {/*
                      Only for staff. A portal client's address is a synthetic
                      `@portal.invalid` that nobody ever mails, so flagging it as
                      unverified would put a warning on every patient row for a
                      state that is correct by design.
                    */}
                    {account.role === 'staff' && !account.emailVerified ? (
                      <span className="block text-caption text-muted-foreground">
                        {t('status.unverified')}
                      </span>
                    ) : null}
                  </TableCell>

                  <TableCell numeric className="whitespace-nowrap text-muted-foreground">
                    {account.lastSeenAt ? formatDateLtr(locale, account.lastSeenAt) : t('neverSeen')}
                  </TableCell>

                  <TableCell numeric className="whitespace-nowrap text-muted-foreground">
                    {formatDateLtr(locale, account.createdAt)}
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-wrap items-start gap-1">
                      <DisableAccountButton
                        userId={account.id}
                        name={account.name}
                        locale={locale}
                        disabled={Boolean(account.disabledAt)}
                      />
                      {account.role === 'staff' && !account.disabledAt ? (
                        <PromoteAccountButton userId={account.id} name={account.name} locale={locale} />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableRoot>

      <Pager
        page={page}
        pageSize={ACCOUNTS_PAGE_SIZE}
        total={total}
        locale={locale}
        basePath="/admin/accounts"
        params={{ q: filters.query, role: filters.role, status: filters.status }}
      />
    </div>
  );
}
