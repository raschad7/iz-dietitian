/**
 * Where each thing sits in the two free areas at the top of a bill.
 *
 * ## Two zones, and only two
 *
 * The head of the page — the clinic, the mark, the document's title — and the
 * details under it are *blocks of a fixed height at the top of page one*.
 * Nothing below them is: the table grows with the ledger, the totals follow it
 * wherever it ends, and the footer prints at the foot of every page. So these
 * two are the parts of a bill that can honestly be a canvas, and they are the
 * parts a clinic actually rearranges — a letterhead is a header.
 *
 * ⚠ **This is why "drag anything anywhere on the page" is not what this does.**
 * An item pinned 340pt down a document that paginates is an item a long account
 * prints over. Inside a zone the height is known and the same on every bill, so
 * a position means something.
 *
 * ## Percentages, not points
 *
 * A placement is `x` and `y` as percentages of its zone. The editor draws the
 * zone at whatever width the dialog gives it and the PDF draws it at 499pt;
 * percentages are what let one arrangement mean the same thing in both.
 *
 * ⚠ **`x` runs from the reading edge, not from the left.** A bill prints
 * right-to-left in Arabic and left-to-right in English from one stored value,
 * so `x: 0` is "where the text starts" in either. The PDF resolves it to a
 * physical edge at the last moment — see `zoneInset`.
 */

/** The two free areas, in the order they print. */
export const ZONES = ['header', 'details'] as const;
export type Zone = (typeof ZONES)[number];

/**
 * How tall each zone is, in points, on the printed page.
 *
 * Fixed rather than fitted to its contents: a zone whose height depended on
 * what was in it would move everything under it every time a clinic dragged
 * something down, and the y a clinic chose would mean something different on
 * every bill. These are the heights the blocks they replaced occupied.
 */
export const ZONE_HEIGHT: Record<Zone, number> = { header: 96, details: 74 };

/**
 * The width a zone is drawn at on the page: A4 less the page's own padding.
 *
 * Stated here rather than measured, because `x` is resolved against it in the
 * PDF and there is nothing to measure at render time — react-pdf lays out from
 * these numbers. It has to agree with `styles.page` in `bill-document.tsx`.
 */
export const ZONE_WIDTH = 595.28 - 48 * 2;

/**
 * Everything a clinic can place, and what it is.
 *
 * `text` items draw a string the app already knows — the clinic's name, the
 * subscriber's, the date. `label` items draw a word the clinic can rewrite in
 * the same editor. `logo` draws the mark. `custom` items draw whatever the
 * clinic typed into them.
 *
 * The ids are stored, so they are a contract: renaming one orphans a clinic's
 * arrangement, which `placementsFrom` handles by dropping what it does not know
 * and appending what the arrangement is missing.
 */
export const ZONE_ITEMS = [
  'logo',
  'clinicName',
  'doctorName',
  'clinicPhone',
  'clinicAddress',
  'docTitle',
  'billNo',
  'subscriberLabel',
  'subscriberValue',
  'issuedLabel',
  'issuedValue',
] as const;

export type ZoneItem = (typeof ZONE_ITEMS)[number];

/** A custom item's id — `custom:` and a number the editor hands out. */
export function isCustomItem(id: string): boolean {
  return id.startsWith('custom:');
}

/**
 * How tall the mark may be printed, in points, and where it starts.
 *
 * The floor is a mark that is still a mark at a glance; the ceiling is the
 * header zone's own height, because a logo taller than the band it sits in
 * would print over the details below it.
 */
export const LOGO_SIZE = { min: 16, max: 88, default: 40 } as const;

/**
 * How big a word on the page may be set, in points.
 *
 * The floor is the smallest print worth putting on a document somebody has to
 * read; the ceiling is a line that still fits the band it is in rather than
 * running under the next one. Between them the clinic decides — a practice that
 * wants its name at 22pt and its address at 7 is describing a letterhead, not
 * making a mistake.
 */
export const TEXT_SIZE = { min: 6, max: 28 } as const;

/**
 * What each thing is set at before anybody resizes it.
 *
 * These are the sizes `bill-document.tsx` already draws them at, so a clinic
 * that resizes nothing gets exactly the bill it had. ⚠ They have to keep
 * matching that file's `styles`: a default here that disagrees is a page that
 * changes size the first time somebody opens the editor and saves.
 */
export const DEFAULT_SIZE: Record<string, number> = {
  logo: LOGO_SIZE.default,
  clinicName: 16,
  doctorName: 10,
  clinicPhone: 9,
  clinicAddress: 9,
  docTitle: 13,
  billNo: 9,
  subscriberLabel: 9,
  subscriberValue: 10,
  issuedLabel: 9,
  issuedValue: 10,
};

/** What a custom line is set at: the body size the details block is in. */
export const DEFAULT_CUSTOM_SIZE = 10;

/** The range a thing may be sized within — the mark's, or a word's. */
export function sizeRange(id: string): { min: number; max: number } {
  return id === 'logo' ? LOGO_SIZE : TEXT_SIZE;
}

/**
 * The size the clinic set for a thing, or `undefined` for one it has left alone.
 *
 * ⚠ **The two are different states and both renderers treat them so.** A thing
 * with no size of its own is drawn by the page's own type scale — the styles in
 * `bill-document.tsx` — rather than by a number this file chose. So a clinic
 * that never touches the grip keeps the bill it had, and the app can still
 * improve its typography for everyone who has not overridden it.
 */
export function storedSize(item: Placement): number | undefined {
  if (typeof item.size !== 'number' || !Number.isFinite(item.size)) return undefined;

  return itemSize(item);
}

/**
 * How big a thing is, as a number, falling back to the size the page draws it
 * at — see {@link DEFAULT_SIZE}.
 *
 * For the grip, which has to start somewhere, and for the mark, which is drawn
 * from a height either way. Everything that *renders a word* should ask
 * {@link storedSize} instead and leave the page's own scale alone.
 */
export function itemSize(item: Placement): number {
  const fallback = isCustomItem(item.id) ? DEFAULT_CUSTOM_SIZE : (DEFAULT_SIZE[item.id] ?? 10);
  const range = sizeRange(item.id);

  return Math.min(range.max, Math.max(range.min, Math.round(item.size ?? fallback)));
}

/** One thing, somewhere in a zone. */
export type Placement = {
  id: string;
  zone: Zone;
  /**
   * From the reading edge, as a percentage of the zone's width.
   *
   * Ignored while `centred` — a centred thing has no offset, it has a middle.
   */
  x: number;
  /** From the top, as a percentage of the zone's height. */
  y: number;
  /** A custom item's words. Ignored for everything else. */
  text?: string;
/**
   * How big this thing is printed, in points.
   *
   * The mark reads it as a *height*, free in the other direction — a wordmark
   * is wide and a monogram is square, and sizing either by width makes the
   * other wrong. Everything else reads it as a font size.
   *
   * Absent means the size the page has always drawn it at — see
   * {@link DEFAULT_SIZE}, and {@link itemSize}, which is what readers should
   * ask rather than reading this directly.
   */
  size?: number;
  /**
   * Centred across the zone rather than offset from its edge.
   *
   * ⚠ **A flag and not an `x` of 50.** Centring means "half of *this thing* on
   * either side of the middle", and nothing that places it knows how wide it is
   * — a clinic's name is as wide as the clinic's name, in a script the layout
   * engine has not measured yet. Both renderers answer it the same way: a
   * full-width row that centres its child, which is a question the engine can
   * answer because by then it has.
   */
  centred?: boolean;
  /** Placed once and since taken off the bill. Kept so it can come back. */
  hidden?: boolean;
};

/**
 * The arrangement a clinic gets before it has moved anything.
 *
 * **The clinic's identity leads at the top of the reading edge** — the top
 * right of an Arabic bill, the top left of an English one — with the
 * practitioner and the contact lines under it, and the mark opposite. That is
 * where these have always printed, and it is a starting point rather than a
 * rule: everything here can be dragged anywhere in the band, and a thing
 * dropped near the middle snaps to centred, which is how a clinic that wants a
 * letterhead makes one.
 *
 * The document's title and its number take the far edge. They are what the
 * *page* is, not who it is from.
 *
 * ⚠ Takes `hasLogo` and does not read it. It is here because the reader —
 * `placementsFrom` — has the answer and a future default may want it again;
 * the last one did, and forced a name under an uploaded mark, which is exactly
 * the deciding a default should not do.
 */
export function defaultPlacements(_hasLogo = false): Placement[] {
  return [
    { id: 'clinicName', zone: 'header', x: 0, y: 4 },
    { id: 'doctorName', zone: 'header', x: 0, y: 32 },
    { id: 'clinicPhone', zone: 'header', x: 0, y: 52 },
    { id: 'clinicAddress', zone: 'header', x: 0, y: 70 },
    /* The mark takes the middle of the band, not the far edge: it is the one
       thing on a bill that belongs to no column — the clinic's lines lead the
       reading edge and the document's own title takes the other, and the space
       between them is where a letterhead puts its mark. Centred rather than an
       `x` near 50, because nothing placing it knows how wide a mark is — see
       `Placement.centred`. */
    { id: 'logo', zone: 'header', x: 0, y: 4, centred: true, size: LOGO_SIZE.default },
    { id: 'docTitle', zone: 'header', x: 74, y: 4 },
    { id: 'billNo', zone: 'header', x: 74, y: 30 },
    { id: 'subscriberLabel', zone: 'details', x: 0, y: 6 },
    { id: 'subscriberValue', zone: 'details', x: 0, y: 34 },
    { id: 'issuedLabel', zone: 'details', x: 74, y: 6 },
    { id: 'issuedValue', zone: 'details', x: 74, y: 34 },
  ];
}

/** The arrangement to fall back on when nothing is stored. */
export const DEFAULT_PLACEMENTS: Placement[] = defaultPlacements();

/** As many things as one clinic may place. A guard, not a design limit. */
export const MAX_PLACEMENTS = 32;
/** How long a line a clinic may type into an item it added. */
export const MAX_CUSTOM_TEXT = 120;

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

/**
 * The clinic's arrangement, read out of what is stored.
 *
 * Forgiving in both directions, and for the same reason `billOrderFrom` is:
 * ids it does not know are dropped, and app items the arrangement never
 * mentioned are appended at their default position. So an arrangement saved
 * before an item existed still prints a whole bill, and a new item appears
 * where the app would have put it rather than vanishing.
 *
 * A malformed value yields the default arrangement — a correct bill — rather
 * than throwing while somebody waits for a document.
 */
export function placementsFrom(stored: string | undefined, hasLogo = false): Placement[] {
  const fallback = defaultPlacements(hasLogo);

  if (!stored) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return fallback;
  }

  if (!Array.isArray(parsed)) return fallback;

  const placed = parsed
    .filter((item): item is Placement => {
      if (typeof item !== 'object' || item === null) return false;
      const candidate = item as Placement;

      return (
        typeof candidate.id === 'string' &&
        (ZONE_ITEMS.includes(candidate.id as ZoneItem) || isCustomItem(candidate.id)) &&
        ZONES.includes(candidate.zone) &&
        typeof candidate.x === 'number' &&
        typeof candidate.y === 'number'
      );
    })
    .slice(0, MAX_PLACEMENTS)
    .map((item) => ({
      id: item.id,
      zone: item.zone,
      x: clamp(item.x),
      y: clamp(item.y),
      centred: item.centred === true,
      hidden: item.hidden === true,
      ...(isCustomItem(item.id)
        ? { text: String(item.text ?? '').slice(0, MAX_CUSTOM_TEXT) }
        : null),
      /* Kept only when it is a number: absent means "the size it has always
         been", which survives a change to the defaults. */
      ...(typeof item.size === 'number' && Number.isFinite(item.size)
        ? { size: itemSize(item as Placement) }
        : null),
    }));

  const seen = new Set(placed.map((item) => item.id));

  return [...placed, ...fallback.filter((item) => !seen.has(item.id))];
}

/** The arrangement, as it is stored. */
export function placementsTo(placements: readonly Placement[]): string {
  return JSON.stringify(placements);
}

/**
 * A placement's physical offset on the printed page.
 *
 * `x` is stored from the reading edge, so it becomes `right` in Arabic and
 * `left` in English. Resolved here, once, rather than stored physically — an
 * arrangement made in Arabic must not print mirrored in English.
 */
export function zoneInset(
  placement: Placement,
  zone: Zone,
  rtl: boolean,
): { top: number; left?: number; right?: number } {
  const top = (placement.y / 100) * ZONE_HEIGHT[zone];

  /* A centred thing spans the zone and centres its own content — see
     `Placement.centred` for why this cannot be an offset. */
  if (placement.centred) return { top, left: 0, right: 0 };

  const offset = (placement.x / 100) * ZONE_WIDTH;

  return rtl ? { top, right: offset } : { top, left: offset };
}

/**
 * Where the totals block sits across the page: physically left, centred, or
 * physically right.
 *
 * ⚠ **Physical, where a placement's `x` is logical, and deliberately so.** A
 * placement is a position *within* a band that the clinic arranged while looking
 * at its own bill, and mirroring it keeps the arrangement meaning the same thing
 * in both scripts. This is one block with three stops, and a clinic that says
 * "put the totals on the left" means the left — the side of the paper, not the
 * side the reading starts on. Nothing else on the page reads it, so nothing else
 * is affected by the difference.
 *
 * It is not a placement for the reason nothing below the table is: the totals
 * follow a table whose height the ledger decides, so they have no fixed spot to
 * be dropped at. What they have is a side.
 */
export const TOTALS_ALIGNMENTS = ['left', 'center', 'right'] as const;
export type TotalsAlignment = (typeof TOTALS_ALIGNMENTS)[number];

/** Where the totals have always printed: the reading edge's opposite side. */
export const DEFAULT_TOTALS_ALIGNMENT: Record<'ltr' | 'rtl', TotalsAlignment> = {
  ltr: 'right',
  rtl: 'left',
};

/**
 * The clinic's choice, or the side the totals have always taken in this script.
 *
 * The default depends on the language because the block was `alignSelf:
 * flex-end` before it could be moved — the far side of the page, which is the
 * left of an Arabic bill and the right of an English one.
 */
export function totalsAlignmentFrom(
  forms: Record<string, string>,
  rtl: boolean,
): TotalsAlignment {
  const stored = forms['layout.totals'];

  return TOTALS_ALIGNMENTS.includes(stored as TotalsAlignment)
    ? (stored as TotalsAlignment)
    : DEFAULT_TOTALS_ALIGNMENT[rtl ? 'rtl' : 'ltr'];
}

/**
 * How a block is pinned to that side, given the direction the page runs in.
 *
 * `flex-start` is the *reading* edge, so it is the right of an RTL page — which
 * is why a physical choice has to be resolved against the script rather than
 * handed to the layout engine as it stands.
 */
export function totalsAlignSelf(
  alignment: TotalsAlignment,
  rtl: boolean,
): 'flex-start' | 'center' | 'flex-end' {
  if (alignment === 'center') return 'center';

  const atReadingEdge = rtl ? alignment === 'right' : alignment === 'left';

  return atReadingEdge ? 'flex-start' : 'flex-end';
}
