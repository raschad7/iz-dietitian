import type { ReactNode } from 'react';

/** Keep portal navigation fixed while the selected destination changes. */
export default function PortalTabsTemplate({ children }: { children: ReactNode }) {
  return <div className="q-route-stage min-w-0">{children}</div>;
}
