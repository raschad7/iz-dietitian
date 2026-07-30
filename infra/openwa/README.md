# WhatsApp gateway (OpenWA)

The clinic's WhatsApp messages go out through [OpenWA](https://github.com/rmyndharis/OpenWA),
a self-hosted HTTP API in front of WhatsApp. It runs as one container next to the
app and owns everything WhatsApp-specific: QR pairing, session data, reconnects,
delivery receipts. The app only ever speaks HTTP to it, so nothing in
`src/features/whatsapp/` knows what a WhatsApp protocol frame looks like.

```
Next.js app  ──HTTP (X-API-Key)──▶  OpenWA gateway  ──▶  WhatsApp
     ▲                                    │
     └──── webhook (HMAC-signed) ─────────┘
```

---

## Read this before you connect a number

OpenWA is **not** Meta's official Cloud API. It drives a reverse-engineered
WhatsApp Web client, and WhatsApp's anti-abuse systems look for exactly that.

- **Use a dedicated clinic number you can afford to lose.** Never the dietitian's
  personal phone. A restricted number cannot be un-restricted by anyone here —
  that is an appeal to WhatsApp.
- **Warm a new number up.** Exchange a few normal messages, set a profile photo,
  and let it sit for a few days before the automation starts sending.
- **The automation is already conservative.** Reminders go to people who booked an
  appointment at your clinic — opted-in recipients, not cold outreach — and they
  are sent one at a time with a pause between them, capped per run. That is the
  single biggest factor in staying unrestricted, so do not "optimise" it into a
  burst.
- **Keep a fallback.** WhatsApp is an extra courtesy, not the clinic's system of
  record. Every reminder that goes out is visible in Settings → WhatsApp, and the
  calendar is the truth regardless of whether a message was delivered.
- **Regulated deployments should not use this.** If the clinic is subject to
  healthcare or EU data rules, use the official WhatsApp Cloud API instead. The
  app's side of this integration is a thin HTTP client; pointing it at a different
  gateway is a change to one file (`src/features/whatsapp/gateway.ts`).

---

## Setup

### 1. Start the gateway

```bash
cp infra/openwa/.env.example infra/openwa/.env
```

Put a random secret in `API_MASTER_KEY`:

```bash
openssl rand -hex 32
```

```bash
docker compose -f infra/openwa/docker-compose.yml up -d
```

The dashboard is at <http://localhost:2785> and the API docs at
<http://localhost:2785/api/docs>. First boot pulls a large image and starts a
Chromium, so give it a minute; `docker compose -f infra/openwa/docker-compose.yml logs -f`
shows progress.

### 2. Configure the app

In `.env.local`:

```bash
WHATSAPP_ENABLED=true
WHATSAPP_API_URL=http://localhost:2785
WHATSAPP_API_KEY=<the API_MASTER_KEY from step 1>
WHATSAPP_WEBHOOK_SECRET=<openssl rand -hex 32>
WHATSAPP_PUBLIC_URL=http://host.docker.internal:3000
WHATSAPP_CRON_SECRET=<openssl rand -hex 32>
```

`WHATSAPP_PUBLIC_URL` is **how the gateway reaches the app**, which is not how the
browser reaches it. Inside the container, `localhost` is the container. On Docker
Desktop (macOS/Windows) use `http://host.docker.internal:3000`; on Linux use the
host's LAN address, or add
`extra_hosts: ['host.docker.internal:host-gateway']` to the compose service.

Restart `bun run dev` — the app reads these at request time, but the settings page
caches nothing and a stale process is the most common cause of "it says disabled".

### 3. Pair the phone

Open **Settings → WhatsApp** in the app and press **Connect WhatsApp**. A QR code
appears; on the clinic phone go to WhatsApp → Settings → Linked devices → Link a
device and scan it. The page polls while pairing, so the code refreshes itself as
it expires.

The status goes `initializing → qr_ready → authenticating → ready`. At `ready` the
number is live.

### 4. Schedule the reminders

The reminder tick has to come from outside the app. Either:

```bash
bun run wa:reminders
```

from cron/Task Scheduler, or an HTTP call, which is what a hosted deployment
usually wants:

```bash
curl -X POST -H "Authorization: Bearer $WHATSAPP_CRON_SECRET" http://localhost:3000/api/whatsapp/reminders
```

Every five minutes is a good schedule. The run is idempotent — overlapping ticks,
retries and manual runs all converge on exactly one message per appointment — so
there is nothing to co-ordinate.

---

## Verifying it works

1. **Gateway alive:** `curl http://localhost:2785/api/health/ready` → `200`.
2. **The app can authenticate:**
   ```bash
   curl -H "X-API-Key: $WHATSAPP_API_KEY" http://localhost:2785/api/sessions
   ```
   A `401` here means the key is wrong; that is the single most common setup error.
3. **The webhook round-trips:** in the gateway dashboard, open the session's
   webhook and press **Test**. The app answers `{"ok":true,...}`. A `401` there
   means `WHATSAPP_WEBHOOK_SECRET` differs between the two sides — press
   **Reconnect** in the app, which rewrites the gateway's copy of the secret.
4. **End to end:** book an appointment for a client whose phone number is your
   own, with confirmations enabled. The message arrives, and the send shows up in
   Settings → WhatsApp with its delivery state.

## Operating notes

- **The session data is state.** `infra/openwa/data/` holds the WhatsApp session;
  deleting it means re-pairing by QR. Include it in backups, and never commit it
  (it is git-ignored).
- **Upgrades:** the image is pinned to a minor version deliberately. Read OpenWA's
  changelog before bumping it, and expect that an engine change may require a
  re-pair — do it when someone can hold the clinic phone.
- **`action_required` / `failed`:** the gateway could not keep the session alive.
  The app surfaces the gateway's own message on the settings page; the usual cure
  is **Disconnect** then **Connect WhatsApp** and a fresh scan.
- **A message stuck at `sent`** is not necessarily broken: WhatsApp reports
  `delivered` only once the recipient's device comes online. A message to a number
  that is not on WhatsApp at all also stays at `sent` — the gateway accepts it and
  WhatsApp drops it silently.
