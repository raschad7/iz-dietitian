/**
 * The VAPID public key, and nothing else.
 *
 * Its own module so that the browser half of this feature never has to import
 * `config.ts`. That file reads `VAPID_PRIVATE_KEY`, and while Next replaces
 * `process.env.<non-public>` with `undefined` in a client bundle rather than
 * inlining it — so nothing would leak — a private key named in a file a client
 * component imports is the kind of thing that has to be re-proved safe by every
 * person who reads it. One import boundary costs less than that.
 *
 * The expression is written out literally rather than looked up: Next inlines
 * `process.env.NEXT_PUBLIC_*` by textual match at build time, so a computed key
 * would come back `undefined` in the browser.
 *
 * Empty string when unset, which is the signal the UI reads to hide the control
 * entirely — see `unconfigured` in `use-push-subscription.ts`. A client cannot
 * fix an unset environment variable, so a switch that always fails is worse
 * than no switch.
 */
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
