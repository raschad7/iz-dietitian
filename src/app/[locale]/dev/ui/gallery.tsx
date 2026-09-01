'use client';

import * as React from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Badge, StatusDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, FieldError, FieldHint } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneField } from '@/components/ui/phone-field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Segmented } from '@/components/ui/segmented';
import { Separator } from '@/components/ui/separator';
import { SelectField } from '@/components/ui/select-field';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Spokes } from '@/components/ui/spokes';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { TimeInput } from '@/components/ui/time-input';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import type { Locale } from '@/i18n/routing';
import { AVATAR_PALETTE } from '@/lib/avatar-color';
import { toIsoDate } from '@/lib/iso-date';

const BUTTON_VARIANTS = [
  'default',
  'outline',
  'ghost',
  'neutral',
  'neutralGhost',
  'accent',
  'destructive',
  'destructiveGhost',
  'secondary',
  'primarySubtle',
  'link',
] as const;

const BADGE_VARIANTS = [
  'default',
  'muted',
  'outline',
  'accent',
  'onTrack',
  'attention',
  'incomplete',
  'medical',
  'rest',
] as const;

const CARD_VARIANTS = ['default', 'tinted', 'empty', 'listRow', 'tile', 'archived'] as const;

const CALLOUT_TONES = ['neutral', 'attention', 'medical'] as const;

const STATUS_DOTS = ['onTrack', 'attention', 'incomplete', 'medical', 'rest'] as const;

const SELECT_OPTIONS = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Lightly active' },
  { value: 'moderate', label: 'Moderately active' },
  { value: 'active', label: 'Active' },
  { value: 'veryActive', label: 'Very active' },
] as const;

type ClientOption = { value: 'hamza' | 'rani' | 'lina'; label: string; meta?: React.ReactNode };

const CLIENT_OPTIONS: ClientOption[] = [
  { value: 'hamza', label: 'Hamza Al-Taweel', meta: <Badge size="sm">Draft</Badge> },
  { value: 'rani', label: 'Rani Shweiki', meta: <Badge size="sm">Draft</Badge> },
  { value: 'lina', label: 'Lina Haddad' },
];

/** A titled block with a rule above it, so the page reads as a list of groups. */
function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-heading-sm font-semibold">{title}</h2>
        {note ? <p className="text-caption text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** One labelled row of specimens. The label is the variant name, not prose. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-label text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/**
 * Every shared control, in every variant, on one page.
 *
 * Nothing here is a product screen and nothing here should grow into one. When
 * a component is replaced by its shadcn counterpart, its block moves with it —
 * the page is the diff, and a swap that leaves a variant unaccounted for shows
 * up as a gap here rather than in a screen nobody thought to open.
 */
export function UiGallery({ locale }: { locale: Locale }) {
  const [theme, setTheme] = React.useState<'system' | 'light' | 'dark'>('system');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [activity, setActivity] = React.useState('moderate');
  const [client, setClient] = React.useState<'hamza' | 'rani' | 'lina' | null>(null);
  const [date, setDate] = React.useState('');
  const [view, setView] = React.useState<'day' | 'week' | 'month'>('week');
  const [notify, setNotify] = React.useState(true);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [agreed, setAgreed] = React.useState(true);
  const [plan, setPlan] = React.useState('weekly');

  /*
   * `data-theme` rather than the `.dark` class: globals.css answers to both, but
   * only the attribute has a `light` value that can out-rank the
   * `prefers-color-scheme` block. Removing it entirely is what "system" means.
   */
  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
      return;
    }
    root.setAttribute('data-theme', theme);
    return () => root.removeAttribute('data-theme');
  }, [theme]);

  const otherLocale = locale === 'ar' ? 'en' : 'ar';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-4 pb-24 sm:p-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-heading-lg font-semibold">UI gallery</h1>
          <p className="text-caption text-muted-foreground">
            Dev only. Check every swap here in both locales, both themes and both widths before
            calling it done.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Theme"
            role="radiogroup"
            size="sm"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />

          {/*
            A plain anchor, not the i18n `Link`: this is a full document load on
            purpose, because the locale layout re-runs and re-sets both `dir` on
            <html> and the direction Base UI reads. A client transition would
            prove less than the thing being tested.
          */}
          <a
            href={`/${otherLocale}/dev/ui`}
            className="text-body-sm text-secondary-foreground underline underline-offset-4"
          >
            Switch to {otherLocale === 'ar' ? 'Arabic' : 'English'} ({otherLocale})
          </a>

          <Badge variant="muted" size="sm">
            dir: {locale === 'ar' ? 'rtl' : 'ltr'}
          </Badge>
        </div>
      </header>

      <Section title="Button" note="11 variants, 4 sizes.">
        <Row label="variants">
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </Row>
        <Row label="sizes">
          <Button size="default">default</Button>
          <Button size="sm">sm</Button>
          <Button size="icon" aria-label="Add">
            <Icon name="add" />
          </Button>
          <Button size="icon-sm" aria-label="Edit">
            <Icon name="edit" />
          </Button>
        </Row>
        <Row label="with icon / disabled">
          <Button>
            <Icon name="add" />
            Add client
          </Button>
          <Button variant="outline">
            Next
            <Icon name="chevronEnd" />
          </Button>
          <Button disabled>disabled</Button>
          <Button variant="outline" disabled>
            disabled
          </Button>
        </Row>
      </Section>

      <Section title="Badge" note="Status variants carry meaning; check them in dark.">
        <Row label="variants">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </Row>
        <Row label="small">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant} size="sm">
              {variant}
            </Badge>
          ))}
        </Row>
        <Row label="status dot">
          {STATUS_DOTS.map((status) => (
            <span key={status} className="flex items-center gap-2 text-caption">
              <StatusDot status={status} />
              {status}
            </span>
          ))}
        </Row>
      </Section>

      <Section title="Card">
        <div className="grid gap-4 sm:grid-cols-2">
          {CARD_VARIANTS.map((variant) => (
            <Card key={variant} variant={variant}>
              <CardHeader>
                <CardTitle>{variant}</CardTitle>
                <CardDescription>Card description sits under the title.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-body-sm text-muted-foreground">
                  Body copy, so the surface has something to hold.
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Row label="interactive / selected">
          <Card variant="tile" interactive className="w-40">
            <CardContent>interactive</CardContent>
          </Card>
          <Card variant="tile" interactive selected className="w-40">
            <CardContent>selected</CardContent>
          </Card>
        </Row>
      </Section>

      <Section
        title="Text fields"
        note="All of these share .q-field. Hover, focus, invalid, disabled and readonly are the five states to check."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <Label htmlFor="g-name">Full name</Label>
            <Input id="g-name" placeholder="Placeholder" />
            <FieldHint>A hint sits under the field.</FieldHint>
          </Field>

          <Field>
            <Label htmlFor="g-invalid">Invalid</Label>
            <Input id="g-invalid" aria-invalid defaultValue="not an email" />
            <FieldError>That is not an email address.</FieldError>
          </Field>

          <Field>
            <Label htmlFor="g-disabled">Disabled</Label>
            <Input id="g-disabled" disabled defaultValue="Disabled" />
          </Field>

          <Field>
            <Label htmlFor="g-readonly">Read only</Label>
            <Input id="g-readonly" readOnly defaultValue="Read only" />
          </Field>
        </div>

        <Field>
          <Label htmlFor="g-textarea">Textarea</Label>
          {/*
            Type into this one. It carries `field-sizing-content` with a minimum
            and no maximum, which is the reported bug: it grows past the bottom
            of whatever contains it. Phase 2 gives it a ceiling.
          */}
          <Textarea id="g-textarea" placeholder="Type several lines to see it grow without a ceiling." />
        </Field>
      </Section>

      <Section
        title="Selects"
        note="Select and combobox, both on Base UI. Open each one near the bottom of the viewport."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <Label htmlFor="g-select">Select</Label>
            <SelectField
              id="g-select"
              value={activity}
              onValueChange={setActivity}
              options={SELECT_OPTIONS}
              aria-label="Activity level"
            />
            <FieldHint>Base UI: flips, shifts and clamps to the room available.</FieldHint>
          </Field>

          <Field>
            <Label htmlFor="g-select-sm">Select, small</Label>
            <SelectField
              id="g-select-sm"
              size="sm"
              value={activity}
              onValueChange={setActivity}
              options={SELECT_OPTIONS}
              aria-label="Activity level, small"
            />
            <FieldHint>Disabled and placeholder states below.</FieldHint>
          </Field>

          <Field>
            <Label htmlFor="g-select-placeholder">Placeholder</Label>
            <SelectField
              id="g-select-placeholder"
              value={""}
              onValueChange={() => {}}
              placeholder="Nothing chosen"
              options={SELECT_OPTIONS}
              aria-label="Placeholder example"
            />
          </Field>

          <Field>
            <Label htmlFor="g-select-disabled">Disabled</Label>
            <SelectField
              id="g-select-disabled"
              disabled
              value={activity}
              onValueChange={setActivity}
              options={SELECT_OPTIONS}
              aria-label="Disabled example"
            />
          </Field>
        </div>

        <div className="max-w-sm">
          <Combobox
            items={CLIENT_OPTIONS}
            value={CLIENT_OPTIONS.find((option) => option.value === client) ?? null}
            isItemEqualToValue={(a, b) => a?.value === b?.value}
            itemToStringLabel={(option) => option.label}
            onValueChange={(option) => setClient(option ? option.value : null)}
          >
            <ComboboxInput aria-label="Search for a client" placeholder="Search for a client" />
            <ComboboxContent>
              <ComboboxEmpty>No clients match.</ComboboxEmpty>
              <ComboboxList>
                {(option: ClientOption) => (
                  <ComboboxItem key={option.value} value={option}>
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.meta}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      </Section>

      <Section title="Date and time">
        <Row label="date picker">
          <div className="w-64">
            <DatePicker
              value={date}
              onChange={(next) => setDate(next)}
              locale={locale}
              placeholder="Pick a date"
            />
          </div>
          <DatePicker
            value={date}
            onChange={(next) => setDate(next)}
            locale={locale}
            trigger="icon"
            label="Pick a date"
          />
        </Row>
      </Section>

      <Section title="Overlays" note="The layer that Phase 2 replaces. Open the dialog, then open the select inside it.">
        <Row label="dialog">
          <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
        </Row>

        <Row label="popover / tooltip">
          <Popover>
            <PopoverTrigger render={<Button variant="outline">Open popover</Button>} />
            <PopoverContent className="w-64 p-4">
              <p className="text-body-sm">
                Popover content. Check which edge it anchors to in Arabic.
              </p>
            </PopoverContent>
          </Popover>

          <TooltipHint label="Tooltip copy">
            <Button variant="ghost">Hover me</Button>
          </TooltipHint>
        </Row>

        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} label="Gallery dialog">
          <DialogHeader
            title="Add client"
            description="A dialog with a select and a date picker inside it."
            onClose={() => setDialogOpen(false)}
            closeLabel="Close"
          />
          <DialogBody>
            <Field>
              <Label htmlFor="g-dialog-name">Full name</Label>
              <Input id="g-dialog-name" placeholder="Full name" />
            </Field>

            <Field>
              <Label htmlFor="g-dialog-date">Date of birth</Label>
              {/* The counter form's own picker: a month list and a year list
                  rather than the caption ring. See `ClientIdentityFields`. */}
              <DatePicker
                id="g-dialog-date"
                value={date}
                onChange={(next) => setDate(next)}
                locale={locale}
                placeholder="Pick a date"
                caption="dropdowns"
                selectedTone="primary"
                max={toIsoDate(new Date())}
              />
            </Field>

            <Field>
              <Label htmlFor="g-dialog-activity">Activity level</Label>
              <SelectField
                id="g-dialog-activity"
                value={activity}
                onValueChange={setActivity}
                options={SELECT_OPTIONS}
                aria-label="Activity level"
              />
            </Field>

            {/*
              The 240-country list is the tallest popup in the app, and this
              dialog is the surface it was being clipped by. Open it here
              before trusting a change to `phone-field` or `select`.
            */}
            <Field>
              <Label htmlFor="g-dialog-phone">Phone</Label>
              <PhoneField id="g-dialog-phone" locale={locale} countryLabel="Country code" />
            </Field>

            {/*
              A textarea that grows under `field-sizing-content` is what makes
              this dialog overflow, which is how the layout shift was found:
              type several lines and nothing beside it may move sideways.
            */}
            {/*
              Both grids the app validates to: a meal accepts any whole minute,
              the clinic's opening hours only quarter hours.
            */}
            <Field>
              <Label htmlFor="g-dialog-time">Meal time (any minute)</Label>
              <TimeInput id="g-dialog-time" defaultValue="07:35" />
            </Field>

            <Field>
              <Label htmlFor="g-dialog-time-quarter">Opens (quarter hours)</Label>
              <TimeInput id="g-dialog-time-quarter" defaultValue="08:00" step={900} />
            </Field>

            <Field>
              <Label htmlFor="g-dialog-notes">Notes</Label>
              <Textarea id="g-dialog-notes" placeholder="Type several lines to overflow the dialog" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setDialogOpen(false)}>Save</Button>
          </DialogFooter>
        </Dialog>
      </Section>

      <Section title="Feedback">
        <div className="flex flex-col gap-3">
          {CALLOUT_TONES.map((tone) => (
            <Callout key={tone} tone={tone} title={`${tone} callout`}>
              The body of the callout explains what to do about it.
            </Callout>
          ))}
        </div>

        <EmptyState
          icon="clients"
          title="No clients yet"
          description="Clients you add will show up here."
        >
          <Button size="sm">
            <Icon name="addClient" />
            Add client
          </Button>
        </EmptyState>

        {/*
          The page loader, at the size `PageLoading` draws it and in the colour
          it draws it in. `PageLoading` itself is not mounted here — it claims
          60dvh and would push the rest of this section off the fold — so what
          is shown is the mark it centres.
        */}
        <Row label="loading mark (Spokes)">
          <Spokes className="size-10 text-spinner" role="status" aria-label="Loading" />
          <Spokes className="size-6 text-spinner" aria-hidden />
          <Spokes className="size-4 text-muted-foreground" aria-hidden />
        </Row>
      </Section>

      <Section title="Menus, sheets and choices" note="Added in phase 5. Open the menu near a viewport edge.">
        <Row label="dropdown menu">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline">Open menu</Button>} />
            <DropdownMenuContent className="w-48">
              {/*
                The label goes *inside* the group, not above it. Base UI backs
                it with `MenuGroupContext` and throws without one — a label
                names a group, so there has to be a group for it to name.
              */}
              <DropdownMenuGroup>
                <DropdownMenuLabel>Client</DropdownMenuLabel>
                <DropdownMenuItem>
                  <Icon name="edit" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Icon name="copy" />
                  Duplicate
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive">
                  <Icon name="trash" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" onClick={() => setSheetOpen(true)}>
            Open sheet
          </Button>
        </Row>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Sheet</SheetTitle>
              <SheetDescription>
                Slides in from the inline-end edge, so it mirrors in Arabic.
              </SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>

        <Row label="checkbox">
          <label className="flex items-center gap-2 text-body-sm">
            <Checkbox checked={agreed} onCheckedChange={(next) => setAgreed(next === true)} />
            Send a reminder
          </label>
          <label className="flex items-center gap-2 text-body-sm text-muted-foreground">
            <Checkbox disabled />
            Disabled
          </label>
        </Row>

        <div className="flex flex-col gap-2">
          <span className="text-label text-muted-foreground">radio group</span>
          <RadioGroup value={plan} onValueChange={(next) => setPlan(String(next))}>
            {['weekly', 'fortnightly', 'monthly'].map((option) => (
              <label key={option} className="flex items-center gap-2 text-body-sm">
                <RadioGroupItem value={option} />
                {option}
              </label>
            ))}
          </RadioGroup>
        </div>

        <Row label="separator">
          <div className="flex w-full flex-col gap-2">
            <span className="text-body-sm">Above</span>
            <Separator />
            <span className="text-body-sm">Below</span>
          </div>
        </Row>

        <Row label="spinner / progress">
          <Spinner />
          <Button disabled>
            <Spinner />
            Saving
          </Button>
          <div className="w-56">
            <Progress value={62} />
          </div>
        </Row>
      </Section>

      <Section title="Data display">
        <StatGrid columns={3}>
          <StatTile label="Daily target" value="2769" unit="kcal" />
          <StatTile label="BMI" value="32.8" note="overweight" flagged />
          <StatTile label="Protein" value="176" unit="g" note="suggested" />
        </StatGrid>

        <TableRoot>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead numeric sorted="asc">
                  Weight
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Hamza Al-Taweel</TableCell>
                <TableCell>
                  <Badge variant="onTrack">On track</Badge>
                </TableCell>
                <TableCell numeric>92.4</TableCell>
              </TableRow>
              <TableRow zebra>
                <TableCell>Rani Shweiki</TableCell>
                <TableCell>
                  <Badge variant="attention">Attention</Badge>
                </TableCell>
                <TableCell numeric>78.1</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableRoot>

        <Row label="avatar">
          <Avatar name="Hamza Al-Taweel" color={AVATAR_PALETTE[0]} size="sm" />
          <Avatar name="Rani Shweiki" color={AVATAR_PALETTE[4]} />
          <Avatar name="Lina Haddad" color={AVATAR_PALETTE[1]} size="lg" />
        </Row>

        <Row label="switch">
          <Switch checked={notify} onClick={() => setNotify((on) => !on)} aria-label="Notifications" />
          <Switch checked={!notify} onClick={() => setNotify((on) => !on)} aria-label="Reminders" />
          <Switch checked disabled aria-label="Disabled" />
        </Row>

        <Row label="segmented">
          <Segmented
            label="Calendar view"
            value={view}
            onChange={setView}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
        </Row>
      </Section>
    </div>
  );
}
