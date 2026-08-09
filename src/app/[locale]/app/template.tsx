import type { ReactNode } from 'react';

/** The app shell persists; only the working canvas enters on navigation. */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="q-route-stage h-full min-h-0 min-w-0">{children}</div>;
}
