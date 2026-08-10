# shadcn replacement map

The working checklist for the `shadcn-revamp` branch. Strategy and root-cause
analysis live in [`shadcn-migration.md`](./shadcn-migration.md).

Format: **what you have now** → **where it appears in the app** → **what
replaces it**.

Every replacement arrives importing `lucide-react`. Those imports get rewritten
to the local `Icon` with **Solar Linear** variants on the way in. This applies
to every row in every table below.

---

## Phase 2 — The popup layer — DONE

All six reported bugs are closed. Two commits on `shadcn-revamp`:

1. `animation-fill-mode: both` → `backwards` on the dialog's entrance rules,
   which is what actually caused issues 1, 2 and 4. See
   [`shadcn-migration.md`](./shadcn-migration.md) for the full diagnosis.
2. One Base UI select replacing both the native `<select>` and `select-menu`,
   plus a ceiling on the textarea.

**Three of the items on this list turned out not to need replacing.** The
calendar is already built on `react-day-picker` with `getDefaultClassNames` and
`buttonVariants` — it *is* the registry's calendar, adapted. The date picker is
that calendar inside a Base UI popover, which is the registry's documented
date-picker pattern rather than a component of its own. The combobox already
imports `@base-ui/react/combobox`. All three looked broken for the same reason
everything else did, and all three were verified working after the CSS fix:
popups anchored to their trigger, inside the viewport, flipping when there is no
room.

Rewriting them now would be churn against working code on the right primitives.
They stay on the list only as an optional consistency pass.

| Now | Screens it appears on | Replaced by |
| --- | --- | --- |
| `ui/dialog.tsx`<br>*not the cause after all — see the migration doc* | Booking appointment dialog · Booking quick-add client · Clients add/edit · Clients intake form · Requests approve · Weekly plans board sheet, day column, new week | `@shadcn/dialog` |
| ~~`ui/select-menu.tsx`~~ **deleted** | Clients intake form · `time-field` · `time-select` | `@shadcn/select` + `SelectField` ✅ |
| `ui/time-select.tsx` | Clinic profile working hours · meal times | `@shadcn/select` ✅ |
| `ui/date-picker.tsx` | Booking appointment dialog · Booking toolbar date button · Clients add/edit · Requests approve | **already** `calendar` + Base UI `popover` — the registry pattern. Verified working. Optional. |
| `ui/popover.tsx` | Clients actions menu · Clients filter · Notifications bell · Booking date button | `@shadcn/popover` |
| `ui/calendar.tsx` | Inside `date-picker` | **already** the registry calendar (`react-day-picker` + `getDefaultClassNames` + `buttonVariants`). Optional. |
| `ui/textarea.tsx` | Booking appointment dialog · Clients intake · Portal deletion request, data update, general request · Requests approve · Weekly plans generate · WhatsApp send message | kept `.q-field`, added `max-h-64` ✅<br>*the registry's textarea has the same unbounded growth, so a swap would not have fixed it* |
| *native `<select>`* | Booking repeat field · appointment dialog · client filter · approve dialog · plan generator | `@shadcn/select` + `SelectField` ✅ |
| — *(dialog bodies scroll badly)* | All dialogs above | **add** `@shadcn/scroll-area` |

## Phase 3 — Search and feedback (fixes bug 6 + meal replace)

| Now | Screens it appears on | Replaced by |
| --- | --- | --- |
| `weekly-plans/client-picker.tsx` | Weekly plans — "search for a client" | **already** on `@base-ui/react/combobox`. Verified working. Optional — `@shadcn/command` only if it must filter hundreds of clients. |
| `ui/combobox.tsx` | Weekly plans client picker | already Base UI; keeps swatch/meta the registry version has no slot for. Optional. |
| **nothing exists** | Weekly plans meal replace · save/confirm on every dialog above | **sonner** ✅<br>*the one non-Base-UI primitive — the Base UI toast froze the planner on drop; see `shadcn-migration.md`* |

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
