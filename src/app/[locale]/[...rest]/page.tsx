import { notFound } from 'next/navigation';

/**
 * Catches every URL under a locale that no real route matched, and hands it to
 * `[locale]/not-found.tsx`.
 *
 * **Without this the 404 page never renders.** Next resolves an unmatched URL
 * against the *root* `app/not-found.tsx`, not the one inside a dynamic segment
 * — a `not-found.tsx` under `[locale]` only answers an explicit `notFound()`
 * call raised from inside that segment. So the branded page sat there unused
 * and every mistyped link still got Next's own default: unstyled, English-only
 * and left-to-right whichever locale the visitor was in.
 *
 * A root-level `app/not-found.tsx` could not replace this. It renders outside
 * `[locale]/layout.tsx`, which is where the locale provider, the fonts and the
 * `dir` attribute live — so it would have to hardcode a language, and there is
 * no correct language to hardcode.
 *
 * `[...rest]` rather than `[[...rest]]`: the optional form would also match the
 * locale root itself and shadow `page.tsx`, turning the root's sign-in / area
 * redirect into a 404.
 */
export default function CatchAllNotFound(): never {
  notFound();
}
