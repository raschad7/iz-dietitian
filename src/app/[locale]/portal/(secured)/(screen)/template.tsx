import type { ReactNode } from 'react';

/** Account screens replace one another inside the persistent portal shell. */
export default function PortalScreenTemplate({ children }: { children: ReactNode }) {
  return <div className="q-route-stage flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>;
}
