# Client Portal Credentials — Design

**Date:** 2026-07-29
**Status:** Approved
**Supersedes:** the magic-link portal sign-in described in
`2026-07-29-authentication-hardening-design.md`

---

## Goal

Replace magic-link sign-in for clients with credentials the dietitian issues:
a username and a temporary password, handed to the client directly.

## Why

Magic links assume every client has an email address they can reach. Most do not:
`clients.email` is nullable and deliberately **not** unique, because walk-ins,
children, and family members sharing one inbox are first-class in this schema.
Under magic links, none of them could have portal access at all.

Issued credentials remove the email dependency entirely — which also means the
client portal no longer depends on a mail provider being configured.

## Decisions

| Decision | Choice |
| --- | --- |
| Login identifier | Name-based username, generated and **editable by the dietitian** |
| Password origin | Generated temporary password, shown once |
| First sign-in | Client **must** set their own password before reaching the portal |
| Client minimum length | 6 characters |
| Staff minimum length | 10 characters (unchanged) |
| Magic links | Removed entirely |
| Forgotten password | Dietitian re-issues; no self-service path |

---

## Identity

Better Auth's built-in `username` plugin provides `/sign-in/username`,
`minUsernameLength`, and a `usernameValidator` hook.

### The synthetic email

`users.email` is `NOT NULL UNIQUE`, so every account needs an address even when
the person has none. Each portal account therefore gets a **non-routable
synthetic address** derived from its username:

```
ahmad-4821  ->  ahmad-4821@portal.invalid
```

`.invalid` is reserved by RFC 2606 and can never resolve. Two consequences, both
wanted: a shared family inbox can never collide on the unique index, and nothing
in the system can accidentally send mail to a patient.

The client's real address, when they have one, stays on `clients.email` for
contact only. It is never used to sign in.

### The synthetic address must be created already verified

`emailVerified` is set **true** on every portal account at creation. This is not
a shortcut — it is required twice over, and getting it wrong breaks the feature
in two different ways:

1. **`requireEmailVerification: true` is global.** It was turned on for staff in
   the authentication-hardening work. An unverified account cannot sign in at
   all, so a portal account left unverified could never reach the portal — and
   there is no way to verify an address that does not exist.
2. **`purgeUnverifiedAccounts()` would delete it.** That job removes accounts
   with `emailVerified = false` older than 24 hours, along with the clinic they
   own. Portal accounts created unverified would silently vanish the next day,
   taking the client's portal access with them.

Verification means "this address was proven to belong to this person". A
`.invalid` address belongs to nobody and can never receive anything, so there is
nothing to prove and no security lost by marking it so. The comment in the code
must say this, because `emailVerified: true` on an unverified address looks like
a bug to anyone reading it cold.

### Username generation

The app suggests a username; the dietitian may edit it before the account is
created.

Suggestion algorithm:

1. Transliterate the client's name from Arabic to Latin (table below), reusing
   the folding already in `src/features/clients/search.ts` for alef variants and
   taa marbuta.
2. Lowercase, strip anything outside `a-z0-9`, collapse runs of `-`.
3. If nothing usable remains (a name written entirely in symbols), fall back to
   `client`.
4. Append `-` and four random digits.
5. Check availability; on collision, redraw the digits. Give up after 10
   attempts and surface an error rather than looping.

**Transliteration is approximate, and the edit field is the fix.** Arabic script
does not write short vowels, so a mechanical mapping produces `ahmd` from `أحمد`
and `sarh` from `سارة`. No algorithm recovers the missing vowels; a human
glancing at the suggestion corrects it in seconds. This is why the field is
editable rather than generated-and-final.

Mapping: `ا→a ب→b ت→t ث→th ج→j ح→h خ→kh د→d ذ→dh ر→r ز→z س→s ش→sh ص→s ض→d
ط→t ظ→z ع→a غ→gh ف→f ق→q ك→k ل→l م→m ن→n ه→h و→w ي→y`, with `ء` dropped.

**Accepted trade-off:** a name-based username reveals the patient's name to
anyone who sees it. A numeric portal number would not. This was chosen
deliberately for memorability.

### Temporary password

Ten characters drawn from an alphabet with the ambiguous glyphs removed — no
`0`/`O`, no `1`/`l`/`I`. It is read aloud or written down, so shape confusion is
the failure mode worth designing out.

---

## Flows

### Issuing

The dietitian opens the client's page and clicks *Create portal access*. A form
shows the suggested username, editable. On submit:

1. Validate the username: allowed characters, length, and not already taken.
2. Generate the temporary password and hash it with Better Auth's own hasher
   (`(await auth.$context).password.hash`) — the same approach `scripts/seed.ts`
   already uses.
3. In **one transaction**: insert the `users` row (role `client`, synthetic
   email, `must_change_password` true), insert the matching `accounts` row
   (`providerId: 'credential'`), and set `clients.user_id`.
4. Return the username and temporary password so the UI can show them **once**.

One transaction for the same reason the current invite uses one: a `users` row
written without its `accounts` row is an account that exists and cannot sign in,
and a `users` row written without the `clients` link is an account that can sign
in and belongs to no patient.

The credentials are shown once and never retrievable. Re-issuing is the path if
they are lost — which is also the forgotten-password path, so it is one mechanism
rather than two.

### First sign-in

`users.must_change_password` gates the portal. `requireClientSession` returns it,
and the portal layout redirects to `/[locale]/portal/set-password` while it is
true. That page is the only reachable one until a new password is set, at which
point the flag clears.

After this, nobody at the clinic knows the client's password. That is the point:
staff cannot sign in as a patient, and actions taken in the portal are genuinely
the patient's.

### Forgotten password

The dietitian re-issues. A new temporary password is generated and shown once,
the `accounts` password is replaced, `must_change_password` returns to true, and
**existing sessions are revoked** — a re-issue is what happens when the old
credentials may be compromised.

The username does not change on re-issue.

### Revoking

Unchanged from today: delete the `users` row, which cascades to sessions and
accounts. `clients.user_id` returns to null via `on delete set null`, leaving the
clinical record untouched.

---

## Password policy

Better Auth exposes a single global `minPasswordLength`, so it cannot express
two minimums. The library floor drops to **6**, and the **staff** schema enforces
10 in its own Zod validation. The asymmetry matches the exposure: a client sees
one record; a staff account sees every client's medical notes.

### Compensating controls for a 6-character minimum

Six characters is only defensible with the following, all of which are required
parts of this design:

1. **Portal sign-in is rate limited** on its own `portal_sign_in` kind: 5
   attempts per username per 15 minutes, 20 per IP. The existing
   `src/features/auth/rate-limit.ts` machinery covers this; only a new kind and
   its limits are added.
2. **A blocklist rejects trivially guessable passwords** — `123456`, `111111`,
   `password`, `qwerty`, `abcdef` and similar, compared after trimming and
   lowercasing. At six characters this matters more than length: throttling
   defeats brute force, but `123456` is guessed on the first attempt.
3. **The temporary password stays long and random.** Only the client's chosen
   replacement may be six characters.

---

## What is removed

- The `magicLink` plugin from `src/lib/auth.ts`
- `requestMagicLink` from `src/features/auth/actions.ts`
- The `magicLink` mail template and the `magic_link` rate-limit kind
- `MAGIC_LINK_TTL_*` constants
- `invitePortalAccess` in its current form, replaced by the issuing flow above

`/[locale]/client-login` becomes a username + password form.

The mailer stays, now serving staff email verification and staff password reset
only.

---

## Schema changes

| Table | Change |
| --- | --- |
| `users` | `username` and `display_username` (required by the plugin), `must_change_password boolean not null default false` |

One generated migration. No change to `clients`.

`must_change_password` is also declared in `user.additionalFields` in
`src/lib/auth.ts` with `input: false`, so it rides on the session object and the
portal layout can read it without a second query — and so it can never be set
from a submitted payload.

---

## Testing

**Unit** (no database):

- Transliteration: Arabic input yields Latin output; diacritics and alef variants
  fold; a symbols-only name falls back to `client`
- Generated usernames contain only `[a-z0-9-]`
- Temporary passwords never contain `0`, `O`, `1`, `l`, or `I`
- The blocklist matches regardless of case and surrounding whitespace

**Integration** (test database):

- Issuing creates exactly one `users` row, one `accounts` row, and links the
  client
- A username collision redraws rather than throwing
- The issued temporary password actually authenticates
- `must_change_password` blocks the portal until a new password is set
- Re-issuing invalidates the previous password and revokes existing sessions
- Revoking removes the account and leaves the `clients` row intact
- A client of one clinic can never be issued credentials by another

**Manual:**

- Issue credentials for a seeded Arabic-named client, check the suggested
  username is sensible and editable
- Sign in, confirm the forced password change, confirm the portal opens after
- Re-issue and confirm the old password stops working
