import { PageLoading } from '@/components/layout/page-loading';

/**
 * The wait for the clients section as a whole.
 *
 * The register and Bills sit one level down behind the `(register)` group and
 * the `bills` segment, each with a boundary of its own, so this one covers the
 * shell above them and the routes that have nothing closer.
 */
export default function ClientsLoading() {
  return <PageLoading />;
}
