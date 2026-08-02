/**
 * Generates `src/lib/icons.generated.ts` from the Solar icon set.
 *
 * The app's icon language is Solar Bold — rounded, filled, one weight
 * everywhere. Rather than pull `@iconify/react` into the client bundle (it
 * ships an API loader that fetches icons over the network at runtime), this
 * copies the handful of SVG bodies the app actually uses into a generated
 * module. The result is offline, tree-shakeable, and about 6 KB instead of the
 * ~1.2 MB the full Solar collection would cost.
 *
 * `@iconify-json/solar` is a devDependency for exactly this reason: it is a
 * build input, never a runtime one.
 *
 * To add an icon: put it in ICONS below, run `bun run icons:generate`, and use
 * it as `<Icon name="..." />`. The name union is regenerated with it, so a
 * typo is a type error rather than an empty box.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import solar from '@iconify-json/solar/icons.json' with { type: 'json' };

/**
 * Local name → Solar icon. Local names describe the *role* the icon plays in
 * this app, not the picture, so swapping the underlying glyph later is a
 * one-line change here rather than a sweep through every call site.
 */
const ICONS = {
  // Navigation — staff
  dashboard: 'widget-4-bold',
  clients: 'users-group-rounded-bold',
  calendar: 'calendar-bold',
  weeklyPlans: 'clipboard-list-bold',
  mealPlans: 'chef-hat-bold',
  dishes: 'cup-hot-bold',
  foods: 'donut-bold',
  whatsapp: 'chat-round-dots-bold',
  security: 'shield-keyhole-bold',

  // Navigation — client portal
  portalHome: 'home-2-bold',
  myAppointments: 'calendar-bold',
  myPlan: 'chef-hat-bold',
  profile: 'user-bold',

  // Direction — these mirror in RTL, see DIRECTIONAL in icon.tsx
  chevronDown: 'alt-arrow-down-bold',
  chevronUp: 'alt-arrow-up-bold',
  chevronStart: 'alt-arrow-left-bold',
  chevronEnd: 'alt-arrow-right-bold',
  signOut: 'logout-2-bold',

  // Actions
  search: 'magnifer-bold',
  add: 'add-circle-bold',
  close: 'close-circle-bold',
  trash: 'trash-bin-trash-bold',
  edit: 'pen-2-bold',
  copy: 'copy-bold',
  refresh: 'refresh-bold',
  archive: 'archive-bold',

  // Field affordances
  eye: 'eye-bold',
  eyeOff: 'eye-closed-bold',
  check: 'check-circle-bold',

  /**
   * The navigation node — the mark that travels to the active item. A leaf
   * rather than a plain dot: this is a nutrition product, and the shape is the
   * one place in the chrome where the brand gets to say so.
   */
  navNode: 'leaf-bold',

  // Status — pairs with the status token of the same name
  attention: 'danger-triangle-bold',
  medical: 'danger-circle-bold',
  info: 'info-circle-bold',

  // Dashboard
  notifications: 'bell-bing-bold',
  topClients: 'cup-star-bold',
  clock: 'clock-circle-bold',
  addClient: 'user-plus-bold',
  bookAppointment: 'calendar-add-bold',
  trend: 'graph-up-bold',
} as const satisfies Record<string, string>;

type SolarIcon = { body: string; width?: number; height?: number };

const collection = solar as unknown as {
  width?: number;
  height?: number;
  icons: Record<string, SolarIcon>;
  aliases?: Record<string, { parent: string }>;
};

function resolve(name: string): SolarIcon {
  const direct = collection.icons[name];
  if (direct) return direct;

  // Solar expresses some names as aliases of another icon's body.
  const alias = collection.aliases?.[name];
  if (alias) return resolve(alias.parent);

  throw new Error(`Icon "${name}" is not in @iconify-json/solar.`);
}

const defaultWidth = collection.width ?? 24;
const defaultHeight = collection.height ?? 24;

const entries = Object.entries(ICONS).map(([local, solarName]) => {
  const icon = resolve(solarName);
  const width = icon.width ?? defaultWidth;
  const height = icon.height ?? defaultHeight;

  return `  ${local}: {
    // solar:${solarName}
    viewBox: '0 0 ${width} ${height}',
    body: ${JSON.stringify(icon.body)},
  },`;
});

const output = `/**
 * GENERATED FILE — do not edit.
 *
 * Run \`bun run icons:generate\` to regenerate. The icon list lives in
 * scripts/generate-icons.ts; see that file for how to add one.
 *
 * Source: Solar Bold (https://icon-sets.iconify.design/solar/), MIT.
 */

export type IconName = keyof typeof QIWAM_ICONS;

export const QIWAM_ICONS = {
${entries.join('\n')}
} as const satisfies Record<string, { viewBox: string; body: string }>;
`;

const target = join(import.meta.dirname, '..', 'src', 'lib', 'icons.generated.ts');
await mkdir(dirname(target), { recursive: true });
await writeFile(target, output, 'utf8');

console.log(`Wrote ${Object.keys(ICONS).length} icons to ${target}`);
