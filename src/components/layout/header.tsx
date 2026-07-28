import { LocaleSwitcher } from '@/components/layout/locale-switcher';

export function Header({ title, userName }: { title: string; userName?: string }) {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-border px-4">
      <h1 className="truncate text-sm font-semibold">{title}</h1>

      <div className="ms-auto flex items-center gap-3">
        {userName ? <span className="hidden text-sm text-muted-foreground sm:inline">{userName}</span> : null}
        <LocaleSwitcher />
      </div>
    </header>
  );
}
