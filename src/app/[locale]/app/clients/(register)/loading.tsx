import { PageLoading } from '@/components/layout/page-loading';

/**
 * The register's own wait.
 *
 * The group is what scopes it. Without `(register)`, this boundary would sit on
 * `/clients` itself and a click through to a client record would show the list
 * loading before the record's — two waits, the first of them wrong.
 */
export default function ClientRegisterLoading() {
  return <PageLoading />;
}
