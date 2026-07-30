# CLAUDE.md

Guidance for Claude Code sessions working in this repo. See `README.md` for
stack and setup.

## Design system — read before any UI work

This app's visual language is Qiwam / قوام. Before writing or editing any
component, page, or style:

1. Read **`design-system.md`** (repo root) — the plain-language rules for
   colour, type, radius, spacing, and RTL. It links to the full spec at
   `docs/Qiwam Design System.html` for anything it doesn't cover.
2. **Check `src/components/ui/` first.** If a button, card, form field, or
   badge already exists there, use it and add a `variant` prop if it needs
   to differ. Do not rebuild a local version of an existing shared component
   inside a `src/features/<feature>/` folder — that's how the token system
   drifts.

Hard rules, enforced by lint where possible:

- **No raw hex colour literals** in `.tsx`/`.jsx` outside
  `src/app/globals.css`. `eslint-rules/no-raw-hex.mjs` errors on this.
  Reach for a semantic Tailwind class (`bg-primary`,
  `text-status-attention-fg`, ...) instead. (Genuinely arbitrary per-record
  colours — a client's calendar colour, the avatar palette — are the one
  exception, and they live in `.ts` data files, not component markup; see
  `design-system.md`.)
- **No raw Tailwind `gray-*`/`slate-*`/`zinc-*`/`neutral-*` or
  `blue-*`/`sky-*`/`indigo-*` utilities.** This app's neutrals are warm
  (`n-*`/`muted`/`background`/`foreground`), and blue does not appear
  anywhere in the brand — not links, not focus, not "info" states.
- **Logical properties only** for direction (`ms-*`/`pe-*`/`text-start`/
  `border-s-*`, never `ml-*`/`pr-*`/`text-left`/`border-l-*`). Already
  enforced by `eslint-rules/logical-properties.mjs`.
- **Lime is not a general-purpose accent.** It appears once per screen, on
  the single thing that matters most (`<Button variant="accent">`), and
  never as text or an icon on a light surface.

## Shared UI components

All reusable UI lives in `src/components/ui/` and is built with
`class-variance-authority` (`cva`) + `cn()` from `@/lib/utils`, consuming
only the semantic tokens defined in `src/app/globals.css`. When a feature
needs a variant of an existing component that doesn't exist yet, add the
variant to the shared component — don't fork it into the feature folder.
