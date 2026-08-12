export function SettingsPageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="space-y-1">
      <h2 className="font-heading text-heading-md font-semibold tracking-tight">{title}</h2>
      <p className="max-w-2xl text-body-sm text-muted-foreground">{description}</p>
    </header>
  );
}
