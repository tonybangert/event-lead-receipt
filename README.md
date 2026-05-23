# event-lead-receipt

A tap-friendly mobile web app for **gracefully capturing leads at conferences**. You hand someone your phone, they fill in name + title + email, and both of you get a beautifully designed branded receipt by email within seconds.

It's the "I don't carry business cards" play — but instead of a QR code that nobody scans, the prospect leaves with something memorable in their inbox.

![A capture flow that takes 30 seconds and feels like a gift, not a harvest.](./public/logo.svg)

## Why this exists

Most conference lead capture treats the prospect as a name to harvest. This app inverts that: the contact gets the polished artifact (a branded receipt with topic, time, and a one-tap LinkedIn connect button); you get a quiet "New connection" notification with a Find-them-on-LinkedIn search link. No app installs, no QR codes, no follow-up DMs that get ignored.

It's also a working reference for a small but **production-grade serverless pattern**: a Vite SPA on Vercel that talks to two Vercel Functions running Resend (transactional email) and HubSpot (CRM + nurture-list enrollment), with a `Promise.allSettled` dual-track failure model so CRM hiccups never block the receipt.

## The capture flow (30 seconds per person)

1. Person walks up.
2. *"I don't carry business cards. Let me show you how I do this."*
3. Tap the home-screen icon → tap the round **Let's connect** CTA → tap a topic chip.
4. Hand the phone over. They fill name, title, email.
5. Tap **Generate receipt.** A branded farewell screen appears.
6. The receipt arrives in their inbox; you get a "New connection" notification with a LinkedIn-search link.
7. Tap **Next connection** to reset.

## Quick start

```bash
git clone https://github.com/tonybangert/event-lead-receipt.git
cd event-lead-receipt
cp .env.example .env       # then fill in at least RESEND_API_KEY + HOST_EMAIL
npm install
npm run dev                # http://localhost:5173
```

The `/api/send-receipt` serverless function does **not** run under Vite dev. The app shows a graceful "queued" state when the API is unreachable, so the UI is fully testable locally. Real email sending requires a Vercel preview deploy or `vercel dev` (see Deploy section).

## Configuration

All branding lives in two files. Edit these to make it yours.

### `src/config.js` — client-side
Drives everything the user sees in the browser: home screen brand mark, signature, event eyebrow, conversation topics, colors.

```js
export const BRAND = {
  name: 'Your Name',
  title: 'Your Title',
  company: 'Your Company',
  email: 'you@example.com',
  linkedin: 'https://linkedin.com/in/yourhandle',
  logoSrc: '/logo.svg',
  colors: { primary, accent, alert, paper, paperDim, primaryDeep, primaryMid }
};
export const EVENT = { name, venue, date, timezone };
export const TOPICS = ['Revenue Growth', 'AI Enablement', ...];
```

### `.env` — server-side
Drives the Resend + HubSpot integrations. See `.env.example` for the full list. Required at minimum:

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Resend transactional email key |
| `FROM_EMAIL` | Sender display name + address (must be on a Resend-verified domain) |
| `HOST_EMAIL` | Where the "New connection" notifications go; also the `reply_to` for receipts |

HubSpot is fully optional — set both `HUBSPOT_ACCESS_TOKEN` and `HUBSPOT_LIST_ID` to enable, otherwise that leg is silently skipped.

### Logo
Drop your logo at `public/logo.svg` (or change `BRAND.logoSrc` to point at a PNG). For the receipt **email**, mail clients vary on SVG support — set `PUBLIC_LOGO_URL` to an absolute URL of a 28×28 PNG, or leave it empty and the email falls back to a text-badge brand mark using `HOST_INITIALS`.

## Architecture

```
event-lead-receipt/
├── api/
│   ├── send-receipt.js     Vercel Function: orchestrates Resend + HubSpot
│   ├── _hubspot.js         HubSpot client (upsert + list-add + note)
│   └── _config.js          Server-side branding (reads from env)
├── public/
│   └── logo.svg            Brand mark — favicon, apple-touch-icon, in-app
├── src/
│   ├── App.jsx             All UI: Home, TopicPicker, Capture, ThankYou, Log
│   ├── main.jsx
│   └── config.js           Client-side branding (BRAND, EVENT, TOPICS)
├── index.html
├── package.json
├── vercel.json
└── vite.config.js
```

### Runtime flow

```
phone (PWA) ─► Vercel static site
                └─► /api/send-receipt  ──Promise.allSettled──┐
                      ├─► Resend → contact: branded receipt              [critical]
                      ├─► Resend → host: capture log + LinkedIn search   [critical]
                      └─► HubSpot upsertContactAndEnroll                 [best-effort]
                            ├─► Upsert contact (with derived website + LinkedIn enrichment)
                            ├─► Add to Static List ─► Workflow fires nurture sequence
                            └─► Create activity-timeline Note (event + topic + timestamp)
```

Critical ops failing → 500 + UI shows "queued". Best-effort failures are logged to Vercel runtime logs. List-add and Note creation fail independently — partial success (e.g. contact + list but note failed) is logged as `HubSpot partial enrichment failure` distinct from total failure.

## Deploy

This project is set up for one-click Vercel deploys.

1. Push to GitHub, then **Import Project** in Vercel and select the repo.
2. Framework will auto-detect as Vite. Build command: `vite build`. Output directory: `dist`.
3. Set the env vars from `.env.example` in **Project Settings → Environment Variables**.
4. (Optional) Add your Resend-verified domain.
5. Deploy. Subsequent pushes to `main` auto-deploy.

For local serverless testing, use `vercel dev` instead of `npm run dev` (requires the [Vercel CLI](https://vercel.com/cli)).

## HubSpot setup (one-time, in HubSpot UI)

Only needed if you want CRM enrichment + a nurture-sequence trigger.

1. **Create a credential.** Settings → Integrations → **Private Apps** (or **Service Keys** on Starter tier portals that don't expose Private Apps). Scopes needed: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.lists.read`, `crm.lists.write`, `crm.schemas.contacts.read`. The token starts with `pat-`.
2. **Create two custom contact properties.** Settings → Properties → Contact properties:
   - Label `Conference Topic`, internal name `conference_topic`
   - Label `LinkedIn Profile URL`, internal name `linkedin_profile_url`
   - HubSpot's autogenerator can append `_1` suffixes — verify the exact internal name at creation time. If you use different names, set `HUBSPOT_TOPIC_PROPERTY` / `HUBSPOT_LINKEDIN_PROPERTY` accordingly.
   - The obvious label `LinkedIn URL` collides with a built-in HubSpot property in the "Social media information" group, so use the more specific label/internal name above.
3. **Create a Static List** at CRM → Lists. The numeric ID in the URL is your `HUBSPOT_LIST_ID`.
4. **Create a Workflow** at Automation → Workflows with **List membership** of the list above as the enrollment trigger. Author your nurture cadence in HubSpot using `{{ contact.firstname }}` and `{{ contact.conference_topic }}` tokens.

Auth mode is auto-detected by token prefix: `pat-*` uses Bearer auth against v3 endpoints; anything else falls back to legacy hapikey query-param auth against the v1 endpoints. Notes use the v1 engagements endpoint deliberately — v3 `/crm/v3/objects/notes` requires an explicit `crm.objects.notes.write` scope that isn't exposed on Starter portals.

## Customization knobs

| Edit | To change |
| --- | --- |
| `src/config.js` BRAND | name, title, company, email, LinkedIn, colors |
| `src/config.js` EVENT | event name, venue, date shown on home screen |
| `src/config.js` TOPICS | the four topic chips (any length works) |
| `src/App.jsx` styles | look-and-feel beyond the color palette (radii, animations) |
| `api/send-receipt.js` `buildContactEmail` | receipt HTML template & copy |
| `.env` | secrets, host identity, event metadata used in emails |

## License

[MIT](./LICENSE). Use it, fork it, ship it for clients.
