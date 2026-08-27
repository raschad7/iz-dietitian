/**
 * Writes the four offline fallback pages in `public/`.
 *
 * Run it with `bun run offline:build` after changing the copy, the layout, or
 * the mark's face. The output is committed, not generated at build time, for
 * the same reason `build-brand-assets.tsx` commits its SVGs: the consumer
 * cannot run a build step. These pages are served by a service worker at the
 * moment the network is gone, so nothing about them may depend on the server
 * being reachable — no stylesheet, no font request, no image request.
 *
 * The four differ only in locale and in which app they name, so writing them by
 * hand means keeping four copies of one layout in step. They are one template
 * here instead.
 *
 * ## Why the fonts are embedded
 *
 * Every other page gets its faces from `next/font`, which injects `@font-face`
 * into the app's CSS bundle. A standalone file in `public/` has no bundle, so
 * naming `'Almarai'` in a font stack matches nothing unless the *device* has
 * Almarai installed — which is why these pages used to render in Segoe UI while
 * the rest of the app rendered in the real thing.
 *
 * A page that appears when the network is down cannot fetch a font, so the only
 * fix that always works is carrying the bytes.
 *
 * They live in `scripts/offline-fonts/`, vendored — the exact subset files
 * `next/font` self-hosts for Almarai and IBM Plex Sans Arabic, lifted out of a
 * build once. Reading them from `.next` on every run was the first attempt and
 * is not viable: those chunk filenames change on every rebuild and vanish when
 * the directory is cleared, so the generator broke the first time a dev server
 * restarted. Vendoring costs a manual refresh if `layout.tsx` ever changes
 * which faces the app loads, and buys a script that runs from a fresh clone.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(import.meta.dir, '..');
const FONT_DIR = path.join(import.meta.dir, 'offline-fonts');

/* ── The mark ─────────────────────────────────────────────────────────────── */

/**
 * The brand mark at the 743-unit grid `public/brand/mark.svg` uses, with the
 * logo's two eye ellipses swapped for closed arcs. Same silhouette, same fills:
 * only the face differs, which is the point — this is the app's own mark,
 * waiting.
 */
const MARK = `<svg
            width="168"
            height="168"
            viewBox="0 0 743 743"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M371.5 0C421.797 0 469.759 9.99605 513.508 28.1089C520.466 30.9895 522.551 39.7041 518.553 46.0856C504.918 67.848 497.035 93.5815 497.035 121.156C497.035 199.356 560.429 262.749 638.629 262.749C662.921 262.749 685.784 256.63 705.762 245.851C712.393 242.273 720.958 244.92 723.379 252.054C736.1 289.54 743 329.714 743 371.5C743 576.674 576.674 743 371.5 743C166.326 743 0 576.674 0 371.5C0 166.326 166.326 0 371.5 0Z"
              fill="#75CF48"
            />
            <g stroke="#266805" stroke-width="26" stroke-linecap="round" fill="none">
              <path d="M214 356 A 46 46 0 0 1 306 356" />
              <path d="M440 356 A 46 46 0 0 1 532 356" />
            </g>
          </svg>`;

/** Phosphor's `arrow-clockwise`, at the 256 grid it is drawn on. */
const RETRY_ICON = `<svg width="21" height="21" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
            <path
              d="M240 56v48a8 8 0 0 1-8 8h-48a8 8 0 0 1 0-16h27.4l-23.7-21.7a80 80 0 1 0-1.7 114.6 8 8 0 0 1 11.1 11.6A96 96 0 1 1 128 32a95.4 95.4 0 0 1 67.6 27.8L224 85.8V56a8 8 0 0 1 16 0Z"
            />
          </svg>`;

/* ── Fonts, vendored in scripts/offline-fonts ─────────────────────────────── */

type Subset = 'arabic' | 'latin';

/**
 * One vendored subset file, as `subsets.json` records it.
 *
 * `range` is the `unicode-range` the face was declared with upstream, and it is
 * kept rather than dropped: without it the browser would claim Almarai covers
 * Latin punctuation it has no glyph for, and every full stop would take a
 * fallback trip it could have skipped.
 */
type FaceRequest = {
  /** The CSS family name, which `next/font` keeps unhashed. */
  family: string;
  weight: number;
  subset: Subset;
  file: string;
  range: string;
};

type Face = FaceRequest & { base64: string; bytes: number };

let manifest: FaceRequest[] | undefined;

async function subsets(): Promise<FaceRequest[]> {
  if (manifest) return manifest;

  const raw = await readFile(path.join(FONT_DIR, 'subsets.json'), 'utf8').catch(() => {
    throw new Error(`No subsets.json in ${FONT_DIR}. See the header of this file.`);
  });

  manifest = JSON.parse(raw) as FaceRequest[];
  return manifest;
}

/** Reads one vendored subset and returns it base64-encoded. */
async function readFace(family: string, weight: number, subset: Subset): Promise<Face> {
  const entry = (await subsets()).find(
    (f) => f.family === family && f.weight === weight && f.subset === subset,
  );

  if (!entry) {
    throw new Error(`No vendored ${subset} face at weight ${weight} for "${family}".`);
  }

  const bytes = await readFile(path.join(FONT_DIR, entry.file));

  return { ...entry, base64: bytes.toString('base64'), bytes: bytes.byteLength };
}

function faceCss(face: Face): string {
  return `      @font-face {
        font-family: '${face.family}';
        font-style: normal;
        font-weight: ${face.weight};
        font-display: swap;
        src: url(data:font/woff2;base64,${face.base64}) format('woff2');
        unicode-range: ${face.range};
      }`;
}

/* ── The apps ─────────────────────────────────────────────────────────────── */

type Copy = { title: string; heading: string; body: string; retry: string };

type App = {
  slug: 'portal' | 'app';
  name: string;
  the: string;
  brandModule: string;
  copy: Record<'ar' | 'en', Copy>;
};

const APPS: App[] = [
  {
    slug: 'portal',
    name: 'The client portal',
    the: 'the portal',
    brandModule: 'src/features/portal/pwa/brand.ts',
    copy: {
      ar: {
        title: 'لا يوجد اتصال — بوابة المشتركين',
        heading: 'لا يوجد اتصال بالإنترنت',
        body: 'تعذّر الوصول إلى بوابة المشتركين الآن. تحقّق من اتصالك ثم أعد المحاولة.',
        retry: 'إعادة المحاولة',
      },
      en: {
        title: 'Offline — Client Portal',
        heading: 'You’re offline',
        body: 'The client portal can’t be reached right now. Check your connection and try again.',
        retry: 'Try again',
      },
    },
  },
  {
    slug: 'app',
    name: 'The staff app',
    the: 'the staff app',
    brandModule: 'src/features/app-pwa/brand.ts',
    copy: {
      ar: {
        title: 'لا يوجد اتصال — العيادة الغذائية',
        heading: 'لا يوجد اتصال بالإنترنت',
        body: 'تعذّر الوصول إلى نظام إدارة العيادة الآن. تحقّق من اتصالك ثم أعد المحاولة.',
        retry: 'إعادة المحاولة',
      },
      en: {
        title: 'Offline — Dietitian Clinic',
        heading: 'You’re offline',
        body: 'The clinic management app can’t be reached right now. Check your connection and try again.',
        retry: 'Try again',
      },
    },
  },
];

/**
 * The faces each locale needs, and no more. Only two weights are painted: 400
 * for the supporting line, 600 for the heading — which Almarai, having no 600
 * file, resolves upward to its real 700 outlines, exactly as it does in the app.
 *
 * The Arabic pages deliberately carry no Latin subset. The only Latin character
 * in their visible text is the full stop, and a full stop from the fallback face
 * is indistinguishable from Almarai's while a Latin subset would add ~19 KB to
 * every Arabic page.
 */
const FACES: Record<'ar' | 'en', [family: string, weight: number, subset: Subset][]> = {
  ar: [
    ['Almarai', 400, 'arabic'],
    ['Almarai', 700, 'arabic'],
  ],
  en: [
    ['IBM Plex Sans Arabic', 400, 'latin'],
    ['IBM Plex Sans Arabic', 600, 'latin'],
  ],
};

function page(app: App, locale: 'ar' | 'en', faces: Face[]): string {
  const ar = locale === 'ar';
  const twin = `${app.slug}-offline-${ar ? 'en' : 'ar'}.html`;
  const t = app.copy[locale];

  /*
   * The stacks globals.css resolves to, spelled out. Arabic leads with Almarai
   * because `:lang(ar)` re-points `--script-ui-font` at it; English leads with
   * IBM Plex Sans Arabic, whose Latin glyphs are the app's default UI face.
   */
  const stack = ar
    ? `'Almarai', 'IBM Plex Sans Arabic', 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif`
    : `'IBM Plex Sans Arabic', 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif`;

  return `<!doctype html>
<!--
  ${app.name}'s offline fallback, in ${ar ? 'Arabic' : 'English'}.

  ⚠ Generated by \`bun run offline:build\` — edit scripts/build-offline-pages.ts,
  not this file. It is one of four written from a single template.

  A static file rather than a Next.js route on purpose: this page has to render
  when the network is gone, which rules out anything that needs the server. It
  is precached by \`${app.slug}-sw.js\` at install time and served only when a
  navigation inside ${app.the} fails. Its ${ar ? 'English' : 'Arabic'} twin is \`${twin}\`;
  the worker picks between them by reading the locale out of its own
  registration scope, so neither file has to know how it was chosen.

  ⚠ Changing this file is not enough on its own. The worker precaches it during
  \`install\`, which only runs when the worker's own bytes change — so bump
  \`SHELL_CACHE\` in \`public/${app.slug}-sw.js\` too, or every already-installed
  client keeps serving the old copy indefinitely.

  Nothing here makes a second request: no stylesheet, no image, and no font
  file. The two faces below are the app's own, base64'd out of next/font's build
  output so they are the same bytes the rest of the app serves.

  ## The colours

  Written as literals for the same reason \`${app.brandModule}\` exists: a file
  outside the build cannot read \`var(--primary)\`. Each one below is a token
  value copied by hand, and the comment beside it names the token it came from,
  so a change to the palette has somewhere to land. The two greens on the mark
  itself are the exception — those are \`public/brand/mark.svg\`'s own fills,
  because this *is* the mark.
-->
<html lang="${locale}" dir="${ar ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#72AE34" />
    <title>${t.title}</title>
    <style>
${faces.map(faceCss).join('\n\n')}

      :root {
        --bg: #ffffff; /* --background / --n-0 */
        --fg: #1c1b17; /* --foreground / --n-900 */
        --muted: #605d50; /* --muted-foreground / --n-600 */
        --border: #e2dfd3; /* --border / --n-200 */
        --tint: #f1fbea; /* --green-50, the hover wash */
        --brand: #75cf48; /* --primary / --green-400, and the mark's own fill */
        --ink: #266805; /* the mark's own ink — eyes and the control glyph */

        /* Motion tokens, from the same block in globals.css. */
        --ease-sweep: cubic-bezier(0.2, 0.6, 0.2, 1);
        --duration-arc: 220ms;

        /* The drift's period. Slow enough to read as breathing rather than as
           something waiting to be tapped. */
        --breath: 3.2s;
        --breath-ease: cubic-bezier(0.45, 0, 0.55, 1);
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
      }

      body {
        min-height: 100dvh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: calc(1.5rem + env(safe-area-inset-top, 0px)) calc(1.5rem + env(safe-area-inset-right, 0px))
          calc(1.5rem + env(safe-area-inset-bottom, 0px)) calc(1.5rem + env(safe-area-inset-left, 0px));
        background: var(--bg);
        color: var(--fg);
        font-family: ${stack};
        line-height: 1.6;
        -webkit-text-size-adjust: 100%;
      }

      main {
        width: 100%;
        max-width: 22rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      /*
        A fixed box the mark floats inside, sized so the drift at the top of the
        cycle has somewhere to go. Without it the rise pushes the heading down
        and the whole page breathes along with the mark.
      */
      .stage {
        width: 12.5rem;
        height: 13.75rem;
        margin-bottom: 2.5rem;
        display: flex;
        align-items: flex-end;
        justify-content: center;
      }

      /*
        The --qiwam-shadow-3 values, as a drop-shadow so they follow the mark's
        outline rather than a box. The mock's own shadow was heavier on every
        axis (22px down, 0.18 alpha) and read as a halo at this size; the token
        is the app's existing answer for something lifted off the page.
      */
      .mark {
        filter: drop-shadow(0 12px 32px rgba(34, 52, 20, 0.12));
      }

      .mark svg {
        display: block;
      }

      h1 {
        margin: 0;
        font-size: 1.5rem; /* --text-heading-lg */
        line-height: 1.35; /* --lh-heading-lg */
        font-weight: 600;
      }

      p {
        margin: 0.5rem 0 0;
        max-width: 20rem;
        font-size: 0.875rem; /* --text-body-sm */
        line-height: 1.55; /* --lh-body-sm */
        color: var(--muted);
      }

      .retry {
        margin-top: 1.625rem;
        width: 2.75rem;
        height: 2.75rem;
        display: grid;
        place-items: center;
        border-radius: 50%; /* icon buttons are circular */
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--ink);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .retry:hover {
        background: var(--tint);
        border-color: var(--brand);
      }

      .retry:active {
        border-color: var(--ink);
      }

      .retry:focus-visible {
        outline: 2px solid var(--brand);
        outline-offset: 3px;
      }

      @keyframes float {
        0% {
          transform: translateY(10px) scale(1.015, 0.985);
        }
        50% {
          transform: translateY(-26px) scale(0.99, 1.01);
        }
        100% {
          transform: translateY(10px) scale(1.015, 0.985);
        }
      }

      @keyframes rise {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      /*
        Decoration only. The spinner below is deliberately outside this block:
        it reports state rather than adding travel, and reduced motion takes the
        travel away without taking the feedback with it.
      */
      @media (prefers-reduced-motion: no-preference) {
        .mark {
          animation: float var(--breath) var(--breath-ease) infinite;
          will-change: transform;
        }

        h1 {
          animation: rise 600ms var(--ease-sweep) both;
        }

        p {
          animation: rise 600ms var(--ease-sweep) 60ms both;
        }

        .retry {
          animation: rise 600ms var(--ease-sweep) 120ms both;
          transition:
            background var(--duration-arc) var(--ease-sweep),
            border-color var(--duration-arc) var(--ease-sweep);
        }
      }

      .retry[aria-busy='true'] {
        cursor: default;
      }

      .retry[aria-busy='true'] svg {
        animation: spin 800ms linear infinite;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="stage">
        <div class="mark">
          ${MARK}
        </div>
      </div>

      <h1>${t.heading}</h1>
      <p>${t.body}</p>

      <button id="retry" type="button" class="retry" aria-label="${t.retry}" title="${t.retry}">
        ${RETRY_ICON}
      </button>
    </main>

    <script>
      (function () {
        var retry = document.getElementById('retry');
        var busy = false;

        /*
          A reload, not a fetch-and-check. If the network is still down the
          service worker's navigate handler catches the failure and serves this
          same page again, which resets the button for free; if it is back, the
          real page loads. Either way the answer comes from the one request that
          actually matters.
        */
        function again() {
          if (busy) return;
          busy = true;
          retry.setAttribute('aria-busy', 'true');

          /*
            A beat of spinner before the reload. Offline, the worker answers
            from cache fast enough that an instant reload reads as a page that
            ignored the tap.
          */
          window.setTimeout(function () {
            window.location.reload();
          }, 600);
        }

        retry.addEventListener('click', again);

        /*
          The connection returning is the answer this page is waiting for, so it
          does not wait to be asked. \`online\` can fire on a captive portal that
          still goes nowhere — harmless here, since the worst case is this page
          being served to itself again.
        */
        window.addEventListener('online', again);
      })();
    </script>
  </body>
</html>
`;
}

/* ── Write ────────────────────────────────────────────────────────────────── */

const faceCache = new Map<'ar' | 'en', Face[]>();

for (const locale of ['ar', 'en'] as const) {
  faceCache.set(
    locale,
    await Promise.all(FACES[locale].map(([family, weight, subset]) => readFace(family, weight, subset))),
  );
}

for (const app of APPS) {
  for (const locale of ['ar', 'en'] as const) {
    const faces = faceCache.get(locale) ?? [];
    const name = `${app.slug}-offline-${locale}.html`;
    const html = page(app, locale, faces);

    await writeFile(path.join(ROOT, 'public', name), html, 'utf8');

    const embedded = faces.reduce((total, face) => total + face.bytes, 0);
    console.log(
      `${name.padEnd(24)} ${(html.length / 1024).toFixed(1).padStart(6)} KB` +
        `  (${(embedded / 1024).toFixed(1)} KB of font in ${faces.length} faces)`,
    );
  }
}
