import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

/**
 * The 404 page, for the whole locale.
 *
 * The `errors.notFound` strings have been in both message files for a while
 * with nothing rendering them — an unmatched URL fell through to Next's own
 * default, which is unstyled, English-only and left-to-right whichever locale
 * you were in.
 *
 * It sits inside `[locale]` rather than at `src/app/`, so it renders inside the
 * locale layout and has a language, a direction and the app's fonts. Every
 * request reaches it with a prefix already on it — `src/proxy.ts` redirects
 * anything without one — so there is no unprefixed path left for a root-level
 * copy to catch.
 *
 * ## The figure
 *
 * `4`, a ghost, `4` — the number split around a drawing rather than sitting on
 * one. The ghost is what carries the tone: this screen is a wrong turn, not a
 * fault, and a character that drifts is a friendlier way to say so than a
 * warning glyph.
 *
 * The three of them are **one SVG**, not an HTML row. Two reasons, and both are
 * about keeping promises this repository already makes:
 *
 *  - The digits need no CSS font size. `docs/design-system.md` says to use the
 *    type scale rather than arbitrary sizes, and the scale stops at
 *    `text-display-lg`/40px — a third of what a figure this size needs. Inside
 *    a viewBox the size is a drawing dimension in user units, so the row scales
 *    with its column at every width and the digits and the ghost cannot drift
 *    out of proportion with each other.
 *  - Nothing here is a hosted image. The reference this is modelled on pulled
 *    its ghost from a personal GitHub Pages URL; the drawing below reads the
 *    theme's own tokens, costs no request, and cannot 404 on the 404 page.
 */
export default async function NotFound() {
  const t = await getTranslations('errors');

  /*
   * Where "out of here" goes depends on who is asking.
   *
   * A signed-out visitor sent to `/app` would land on a login screen, which is
   * a second dead end wearing a form — so they get the public landing page. A
   * signed-in one sent to `/` would land on the marketing page for a product
   * they are already inside. Neither is wrong exactly; both are useless.
   *
   * The role split is the same one `requireRole` in `src/lib/session.ts`
   * enforces, read here rather than left to it. A portal client pointed at
   * `/app` does arrive somewhere sensible — that guard bounces them to
   * `/portal` — but by way of a login-shaped redirect they did not need. Aiming
   * at their own home in the first place skips it.
   *
   * `getSession` and not a look at the cookie: the cookie is opaque, so it can
   * say *that* someone is signed in but not which of the two areas is theirs.
   * The cost is a session lookup on every 404, including the ones crawlers
   * generate. That is a real cost and worth knowing about; it buys a link that
   * is right rather than one that is right two thirds of the time.
   *
   * Note this is not a guard and grants nothing. A stale session resolves to
   * `null` and the visitor gets the public link; a forged one would still meet
   * the real check on arrival.
   */
  const session = await getSession();
  const staff = session?.user.role === 'staff';

  const destination = session ? (staff ? '/app' : '/portal') : '/';

  /*
   * Two labels for three destinations, and they line up: "home page" is honest
   * for both the portal's own home and the public one, where "dashboard" is a
   * word only the staff area uses for itself (`nav.dashboard`) — the portal
   * calls its equivalent screen Home (`nav.portalHome`).
   */
  const cta = staff ? t('notFoundCtaDashboard') : t('notFoundCtaHome');

  return (
    <main className="q-route-stage mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      {/*
        Decoration, all of it — `aria-hidden` covers the digits as well as the
        ghost. A screen reader that announced "44" here would be reading two
        glyphs that only mean anything as a picture, in front of a heading that
        already says the thing in words.
      */}
      <div className="w-full max-w-md" aria-hidden="true">
        <GhostFigure />
      </div>

      <div className="q-404-enter q-404-enter-2 space-y-3">
        <h1 className="font-heading text-heading-lg font-semibold">{t('notFound')}</h1>
        <p className="text-pretty text-body-md leading-relaxed text-muted-foreground">
          {t('notFoundDescription')}
        </p>
      </div>

      {/*
        Forwards, not "back". The browser's own back button already does back,
        and the history entry behind a mistyped link is as likely to be another
        dead end as it is to be somewhere useful. Where forwards *is* was
        decided above, from the session.

        For staff that is `/app`, the same destination `app/error.tsx` offers
        when a screen fails, so the two dead ends in this product agree about
        where recovery starts.

        A link styled as a control rather than `<Button render={<Link/>}>` —
        Base UI's Button warns when it renders anything but a real `<button>`.
        Same reasoning as the landing page.

        ## The colours

        White ground, black label — which is the `neutral` variant exactly, not
        something built here: `bg-card` is `--n-0`/`#FFFFFF` and `text-foreground`
        is `--n-900`/`#1C1B17`, at 16.6:1. Taking the variant rather than
        writing the two colours also brings the `border-border` edge with it,
        and on a white page a white control without one is not a control.

        The one thing overridden is the hover, and only its strength. The
        variant's own is `bg-accent` — `--c-200`/`#E5E7EB`, a grey with enough
        blue in it to read as tinted next to the warm neutrals this page is
        otherwise built from. `bg-accent/50` is the same token at half, which
        over the white ground composites to `#F2F2F4` — measured, not guessed.
        Its chroma is 2 where the full token's is 6, so two thirds of the tint
        is gone and it lands as plain light grey.

        Half the token rather than a different one, deliberately. The obvious
        alternative was `bg-muted`, but `--muted` and `--card` are both
        `--green-900` in dark mode, so that hover would have been invisible
        there. An alpha keeps a real step between ground and hover in both
        themes.

        No `hover:text-*`: `--accent-foreground` and `--foreground` are the same
        stop in both themes, so the label has nothing to change to.
      */}
      <Link
        href={destination}
        className={cn(
          buttonVariants({ variant: 'neutral' }),
          'q-404-enter q-404-enter-3 gap-2',
          'hover:bg-accent/50',
        )}
      >
        {cta}

        {/*
          `chevronEnd` is the registry's forward-pointing glyph and is on
          `Icon`'s directional allowlist, so it mirrors itself in Arabic —
          pointing right in English and left in Arabic, which is "onward" in
          each. A call site must not add its own `rtl:-scale-x-100`; the two
          would cancel and leave it pointing backwards.

          It does not move on hover. It carried a one-step nudge, mirrored per
          script, and it is gone on purpose: the button already answers the
          pointer by changing ground, and a second answer on top of that is the
          kind of motion `Button`'s own note argues against. The glyph is a
          direction marker, not a moving part.
        */}
        <Icon name="chevronEnd" />
      </Link>
    </main>
  );
}

/**
 * `4` — ghost — `4`, drawn as one picture.
 *
 * ## Colour
 *
 * Every fill is a semantic utility, most of them at low alpha — no `fill="#…"`,
 * which `eslint-rules/no-raw-hex.mjs` would reject anyway. The ghost is a wash
 * of `--primary` rather than a flat white body, so it holds its shape on the
 * dark ground as well as the light one: an alpha over whatever is behind it
 * moves with the theme, where a baked light fill would become a bright hole in
 * dark mode. The digits take `--muted-foreground`, which is the app's token for
 * de-emphasised ink and gives the reference's faded numerals without an opacity
 * on text.
 *
 * ## Direction
 *
 * Nothing here mirrors, and that is not an oversight. The row is symmetric — a
 * `4` at each end of a centred drawing — so a flip would produce the identical
 * picture, and the one asymmetric thing in it, the digits themselves, must
 * never mirror in either script. Compare the landscape this replaced, which did
 * need mirroring because it had a direction to state.
 *
 * ## Motion
 *
 * The classes are in `globals.css`; see "The 404 page's entrance" there. The
 * animations move `translate` and `opacity` only, never `transform`, because
 * `transform-origin` on an SVG *child* does not resolve to the viewBox the way
 * it does on the root element — measured here, a CSS flip on a `<text>` inside
 * this frame pivoted on x = 0 instead of its own centre. The `translate`
 * property needs no origin, so it cannot be got wrong that way.
 */
function GhostFigure() {
  return (
    <svg
      viewBox="0 0 320 150"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-auto w-full"
      aria-hidden
    >
      {/*
        The digit baselines sit at 112 and the ghost's crown at 26, which is
        also where a 120-unit Readex Pro figure tops out. The two are aligned by
        arithmetic rather than by eye, so a change to one size shows up as a
        mismatch instead of drifting quietly.
      */}
      <g className="q-404-digit-out-left">
        <text
          x="42"
          y="112"
          textAnchor="middle"
          fontSize="120"
          className="font-heading fill-muted-foreground font-semibold"
        >
          4
        </text>
      </g>

      {/*
        The ghost's shadow stays behind while the ghost drifts above it. That is
        the whole trick of the float: a shadow that rose and fell with the body
        would read as the *page* moving rather than the ghost.
      */}
      <ellipse cx="160" cy="146" rx="34" ry="5" className="fill-muted-foreground/15" />

      <g className="q-404-ghost">
        {/*
          A dome on six scallops. The arc is 50 × 62 rather than a circle, so
          the head is taller than it is round — a semicircle reads as a bell.
        */}
        <path
          d="M110 88a50 62 0 0 1 100 0v36l-16.7 12-16.7-12-16.6 12-16.7-12-16.6 12-16.7-12z"
          className="fill-primary/12 stroke-primary/35"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <ellipse cx="126" cy="96" rx="8" ry="5" className="fill-primary/30" />
        <ellipse cx="194" cy="96" rx="8" ry="5" className="fill-primary/30" />
        <ellipse cx="143" cy="78" rx="7.5" ry="9.5" className="fill-foreground" />
        <ellipse cx="177" cy="78" rx="7.5" ry="9.5" className="fill-foreground" />
        <ellipse cx="160" cy="101" rx="6.5" ry="8" className="fill-foreground/60" />
      </g>

      <g className="q-404-digit-out-right">
        <text
          x="278"
          y="112"
          textAnchor="middle"
          fontSize="120"
          className="font-heading fill-muted-foreground font-semibold"
        >
          4
        </text>
      </g>
    </svg>
  );
}
