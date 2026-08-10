# shadcn replacement map

The working checklist for the `shadcn-revamp` branch. Strategy and root-cause
analysis live in [`shadcn-migration.md`](./shadcn-migration.md).

Format: **what you have now** → **where it appears in the app** → **what
replaces it**.

Every replacement arrives importing `lucide-react`. Those imports get rewritten
to the local `Icon` with **Solar Linear** variants on the way in. This applies
to every row in every table below.

---

## Phase 2 — The popup layer (fixes 5 of the 6 reported bugs)

These move together in one PR. Splitting them leaves two competing layers and
the bugs survive.

| Now | Screens it appears on | Replaced by |
| --- | --- | --- |
| `ui/dialog.tsx`<br>*native `<dialog>`, wrong stacking layer* | Booking appointment dialog · Booking quick-add client · Clients add/edit · Clients intake form · Requests approve · Weekly plans board sheet, day column, new week | `@shadcn/dialog` |
| `ui/select-menu.tsx`<br>*369 lines, **bug: menu opens detached*** | Clients intake form · and via `time-field` / `time-select` | `@shadcn/select` |
| `ui/time-select.tsx`<br>***bug: menu opens detached** — same defect, built on `select-menu`* | Clinic profile working hours · meal times | `@shadcn/select` |
| `ui/date-picker.tsx`<br>*386 lines, **bug: calendar overflows dialog*** | Booking appointment dialog · Booking toolbar date button · Clients add/edit · Requests approve | `@shadcn/calendar` + `@shadcn/popover`<br>*(shadcn's documented date-picker pattern — there is no single `date-picker` item)* |
| `ui/popover.tsx` | Clients actions menu · Clients filter · Notifications bell · Booking date button | `@shadcn/popover` |
| `ui/calendar.tsx` | Inside `date-picker` | `@shadcn/calendar` |
| `ui/textarea.tsx`<br>***bug: grows with no max height*** | Booking appointment dialog · Clients intake · Portal deletion request, data update, general request · Requests approve · Weekly plans generate · WhatsApp send message | `@shadcn/textarea` + max height |
| *native `<select>` in* `booking/repeat-field.tsx`<br>***bug: browser's own blue menu*** | Booking repeat/recurrence field | `@shadcn/select` |
| — *(dialog bodies scroll badly)* | All dialogs above | **add** `@shadcn/scroll-area` |

## Phase 3 — Search and feedback (fixes bug 6 + meal replace)

| Now | Screens it appears on | Replaced by |
| --- | --- | --- |
| `weekly-plans/client-picker.tsx`<br>*hand-rolled search field* | Weekly plans — "search for a client" | `@shadcn/combobox`<br>*or `@shadcn/command` in a popover if it needs to filter many clients* |
| `ui/combobox.tsx` | Weekly plans client picker | `@shadcn/combobox` |
| **nothing exists** | Weekly plans meal replace · save/confirm on every dialog above | **add** `@shadcn/toast`<br>*Base UI project — **not** sonner* |

## Phase 4 — Low blast radius swaps (1–5 files each)

| Now | Screens it appears on | Replaced by |
| --- | --- | --- |
| `ui/select.tsx` *(native)* | Booking appointment dialog · Clients filter · Requests approve · Weekly plans generate | `@shadcn/native-select`<br>*keeps the native behaviour, maintained source* |
| `ui/confirm-dialog.tsx` | Booking calendar · Clinic profile editor · `confirm-submit-button` | `@shadcn/alert-dialog` |
| `ui/callout.tsx` | Clients nutrition · Clients portal credentials · Onboarding wizard · Profile editor | `@shadcn/alert` |
| `ui/empty-state.tsx` | Portal notifications, appointments, meal plan · Notifications list · Requests inbox · Weekly plans cards, portal plan | `@shadcn/empty` |
| `ui/segmented.tsx` | Login screen · Booking view switcher · Portal appointment tabs · Portal settings | `@shadcn/toggle-group` |
| `ui/tooltip.tsx` | Clients table · Weekly plans context panel · `copy-button`, `confirm-submit-button` | `@shadcn/tooltip` |
| `ui/table.tsx` | Clients table · Weekly plans plans card, dish table | `@shadcn/table` |
| `ui/tabs.tsx` | Clients tabs · Clinic profile editor | `@shadcn/tabs` |
| `ui/switch.tsx` | Clinic profile working hours · Portal settings | `@shadcn/switch` |
| `ui/skeleton.tsx` | Portal appointments loading · Weekly plans generation screen | `@shadcn/skeleton` |
| `ui/avatar.tsx` | Sidebar profile | `@shadcn/avatar` *(needs `AvatarFallback`)* |
| `ui/field.tsx` | 6 forms | `@shadcn/field` *(registry version adds `FieldGroup`, `FieldSet`, validation states)* |

## Phase 5 — Components you don't have at all

Pure additions. Nothing breaks.

| Add | Where it will be used |
| --- | --- |
| `@shadcn/dropdown-menu` | Clients actions menu · header menus · locale switcher |
| `@shadcn/sidebar` | `components/layout/sidebar.tsx` — the `--sidebar-*` tokens already exist and are unused |
| `@shadcn/sheet` | Weekly plans board sheet · mobile panels |
| `@shadcn/checkbox` · `@shadcn/radio-group` | Clients intake form · onboarding wizard |
| `@shadcn/separator` | Replaces `<div className="border-t">` in several places |
| `@shadcn/spinner` · `@shadcn/progress` | Weekly plans generation · every submit button |
| `@shadcn/direction` | RTL direction provider — app root |
| `@shadcn/input-group` | Rebuilds `phone-field` and `time-field` |
| `@shadcn/item` | Could rebuild `stat-tile` |

## Phase 6 — Recompose (keep your API, rebuild the inside)

| Now | Screens it appears on | Rebuilt from |
| --- | --- | --- |
| `ui/confirm-submit-button.tsx` | Clients archive, delete, portal credentials · WhatsApp send, settings | `alert-dialog` + `button` + `spinner` |
| `ui/phone-field.tsx` | Booking quick-add client · Clients add/edit | `input-group` |
| `ui/time-field.tsx` | Clients intake form | `input-group` |
| `ui/copy-button.tsx` | Clients profile · portal credentials | `button` + `tooltip` |

## Phase 7 — High blast radius (one PR each, last)

| Now | Files affected | Replaced by |
| --- | ---: | --- |
| `ui/button.tsx` | 65 | `@shadcn/button` — reconcile variant names first |
| `ui/card.tsx` | 51 | `@shadcn/card` — 372 lines local, biggest single rewrite |
| `ui/input.tsx` | 22 | `@shadcn/input` |
| `ui/label.tsx` | 19 | `@shadcn/label` |
| `ui/badge.tsx` | 19 | `@shadcn/badge` |

---

## Not replacing

| Keep | Files | Why |
| --- | ---: | --- |
| `ui/icon.tsx` | **76** | Your Solar icon system. Highest blast radius in the repo. Everything else adapts to it. |
| `ui/stat-tile.tsx` | 2 | Domain KPI tile |
| `ui/chart-tip.tsx` | 1 | Domain chart tooltip |

## Delete

| File | Why |
| --- | --- |
| `ui/comfort-band.tsx` | **Zero imports.** Dead code. |

---

## Totals

- **33** local components → **19** direct swaps, **5** recompositions, **3** kept, **1** deleted
- **~14** new components added that don't exist today
- Reported bugs closed: **5 in Phase 2**, **1 in Phase 3**
