import type { ReactNode } from 'react';

/** Full-screen flow screens (no tab bar). Pages added in later phases. */
export default function V2FlowLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh flex-1 flex-col">{children}</div>;
}
