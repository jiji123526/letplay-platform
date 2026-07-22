# Rebuild Plan: React + Cloudflare (greenfield)

## Overview

Rebuild letsplay-platform fresh on **React + Cloudflare**. The current app is
pre-production (nothing live), so this is a **greenfield rebuild**, not a migration:
no data to move, no parallel-running, no cutover, no users to protect. The asset we keep
is the **documented design and the working reference implementation**, not the code.

> The prior code (vanilla JS + Supabase + Vercel) is a working prototype we treat as the
> spec. We reimplement its behavior on the new stack and test against the feature
> checklist — we don't port files.

---

## Why React (and why not just "everyone uses it")

"Most sites use React" is a weak argument on its own — much of the web's React is
marketing pages where it's overkill. The reasons that *do* apply here are specific:

1. **Declarative state → UI.** The reference `app.js` is 2,405 lines of imperative DOM
   manipulation: subscription callbacks mutate a `messageCache` and re-render by hand,
   with special care to preserve embeds across re-renders. A realtime list with
   optimistic updates, reactions, edits, replies, and embeds is exactly the problem
   React's model removes. This is the real win for "further development."
2. **Enforceable component structure.** `AI_GUIDE.md` already thinks in components
   (admin panels, dialogs, embeds, context menu). React makes that structural, not
   conventional.
3. **Ecosystem + hiring.** Tiebreakers, not primary reasons.

**Alternatives considered:** SvelteKit / Solid give the same declarative win with smaller
bundles and deploy cleanly on Cloudflare. React is chosen here for ecosystem and
familiarity. (If this stays solo/small, SvelteKit remains a reasonable swap — noted, not
recommended over React for this plan.)

---

## Two Hard Truths to Budget For

1. **Realtime is framework-independent and it's the hard part.** React does nothing to
   make Durable Objects easier. The reference backend uses a **dual-path signal/fetch
   model** (see below) plus presence and ~11 event types. This is the make-or-break
   piece regardless of UI. **Phase 0 spike proves it before anything else.**
2. **We're re-implementing ~6,900 lines of working, feature-rich behavior.** Image
   compression, long-press menus, embeds, live mode, gallery, welcome popups — subtle
   behavior the original already got right. Rewrites re-introduce solved bugs. Budget
   real time for **feature-parity testing against the README checklist**.

---

## Target Stack

| Layer | New |
|---|---|
| Framework | **React 19 + Next.js 15** (App Router) on Cloudflare Pages |
| Styling | **Tailwind CSS** (reference `styles.css` as the visual spec) |
| Database | **Cloudflare D1** (SQLite) |
| Realtime | **Durable Objects** + WebSocket (one instance per channel) |
| Auth | **Auth.js (NextAuth v5)** — owners only; anon visitors never auth |
| Storage | **Cloudflare R2** (S3-compatible, no egress fees) |
| Serverless | **Pages Functions** (Workers) |
| Hosting / CDN | **Cloudflare Pages** + built-in CDN |

---

## Reference Architecture (the spec to reproduce)

### Auth model is lopsided — reproduce it exactly
- **Anonymous visitors never authenticate.** They get a stable `localStorage`
  identifier. No session, no token.
- **Only channel owners authenticate.** Owner login → session → ownership check gates
  admin APIs.
- **All writes go through trusted server endpoints**, never client-side DB access.

This keeps the auth surface small: owner login + session + ownership check. Don't
over-build it.

### Realtime is a dual-path signal + fetch system (the make-or-break piece)
The reference runs two realtime paths because RLS suppressed `postgres_changes` for
anonymous visitors:
- Authenticated path (owners) via row-change events.
- **Broadcast-signal path (everyone)**: a realtime event is treated as an
  **invalidation signal**; the client then **re-fetches the changed rows through a
  protected read endpoint** rather than trusting the payload.

Events/channels to reproduce (~11):
```
message-changed   gallery-changed   dm-changed        (invalidation signals)
msg-edit          msg-delete        force-refresh      (broadcast payloads)
freeze-change     profile-change    emoji-fx
status-changed (live)               live-presence (presence counting)
```

**Durable Object design:** one DO instance per channel, holding the WebSocket
connections for that channel. It broadcasts signals + payloads and tracks presence.
Clients re-fetch authoritative data through Pages Functions. This split (signal vs
trusted payload) is deliberate — keep it.

### API surface to rebuild (as Pages Functions)
```
auth        signup / login / create-channel
admin       admin actions (ownership-gated)
messages    send / delete / soft-delete / edit / react
init        consolidated single-request page load
data        protected reads (messages, blocked, dm, gallery, search, live)
dm          direct messages
gallery     gallery writes
preview     OG meta scraping (link previews)
version     app version check
```

---

## Phases

### Phase 0 — Realtime + auth spike (~2-3 days) ⚠️ before committing to the build
Prove the two unknowns in isolation, throwaway code:
- **Durable Object realtime for one channel** — reproduce the signal + re-fetch model and
  presence counting. This is make-or-break; if it's harder than expected, reconsider
  scope now, not after building UI on top of it.
- **Auth.js on Cloudflare Pages** — confirm OAuth + session works on the Workers runtime.
  Fallback: Lucia.

Exit criteria: two working prototypes. Nothing downstream starts until these pass.

### Phase 1 — Project setup (~2 days)
- Next.js 15 App Router on Cloudflare Pages, Tailwind configured.
- D1 database created + schema applied (see D1 Schema Notes).
- R2 bucket created.
- Base routes stubbed: `/`, `/login`, `/onboarding`, `/dashboard`, `/ch/[slug]`.
- Auth.js wired from the Phase 0 spike.

### Phase 2 — Auth & onboarding (~3 days)
- Owner login/signup (email/password + Google OAuth), email verification.
- Session management, ownership checks on admin APIs.
- Onboarding (channel creation) + admin guide.
- Anonymous visitor identity (localStorage), no auth path.

### Phase 3 — Chat core (~7 days)
- Message list + composer as React components (declarative, no manual DOM).
- Send / receive via Pages Functions + Durable Object realtime.
- Reactions, replies, editing, soft-delete.
- Image upload to R2 (client-side compression → upload → store URL).
- Long-press context menu; embeds (Twitter, Instagram, YouTube, link previews).
- Optimistic updates via React state (replaces the manual `messageCache` machinery).

### Phase 4 — Admin (~5 days)
- Ownership-based admin (no passcode — do it right from the start, unlike the reference
  which still had a half-finished passcode→JWT migration).
- Admin panel (channel settings: profile/square-crop, color, passcode, rules).
- Management: banned words, blocked users, freeze, live mode, DM toggle, petition toggle.
- Admin/user view toggle (preview as non-admin).
- Broadcasts (edit/delete/freeze/profile) via Durable Objects.

### Phase 5 — Polish & parity (~5 days)
- Search (D1 **FTS5**), gallery, links panel.
- Settings (font size, theme, bubble color), skeleton loading, typing indicator.
- Unread badge, scroll-to-bottom, offline/reconnect awareness.
- Welcome popup, admin guide, auto-reload stale tabs.
- **Feature-parity pass against the README checklist** — the critical anti-regression step.

### Phase 6 — Platform features (~6 days)
- Dashboard (list/create/delete channels), root `/` redirect logic.
- Channel discovery, multi-channel per owner.
- Social login (Kakao, Apple), SSR landing page for SEO.

---

## D1 Schema Notes (SQLite adaptations from the reference Postgres schema)

```sql
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Channel',
  profile_image TEXT,
  bubble_color TEXT DEFAULT '#3b8df0',
  passcode TEXT,
  notice TEXT DEFAULT '[]',          -- JSON string (no JSONB)
  is_frozen INTEGER DEFAULT 0,       -- no boolean
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  uid TEXT NOT NULL,
  auth_uid TEXT NOT NULL,
  nick TEXT,
  text TEXT DEFAULT '',
  is_admin INTEGER DEFAULT 0,
  reply_to TEXT,
  report INTEGER DEFAULT 0,
  reported_msg_id TEXT,
  gallery_id TEXT,
  dm INTEGER DEFAULT 0,
  deleted INTEGER DEFAULT 0,
  edited INTEGER DEFAULT 0,
  reactions TEXT DEFAULT '{}',       -- JSON string
  image TEXT,
  image_w INTEGER,
  image_h INTEGER,
  fingerprint TEXT,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  created_at TEXT DEFAULT (datetime('now'))
);
-- Similar for blocked, dm, gallery, config, moderators.

-- Full-text search: replace Postgres GIN/to_tsvector with FTS5
CREATE VIRTUAL TABLE messages_fts USING fts5(text, content='messages', content_rowid='rowid');
```

Adaptation rules: `jsonb`→TEXT JSON string, `boolean`→INTEGER 0/1, `uuid`→TEXT,
`gen_random_uuid()`→`lower(hex(randomblob(16)))`, `now()`→`datetime('now')`.

**Caveat on "edge performance":** D1 replicates **reads** to the edge; **writes go to a
single primary region**. The latency win is real for reads and Workers/DO compute, not
for writes. Don't over-promise "edge writes."

---

## Component Architecture (target)

```
app/
  page.tsx                → / (landing / redirect)
  login/page.tsx          → /login
  onboarding/page.tsx     → /onboarding
  dashboard/page.tsx      → /dashboard
  ch/[slug]/page.tsx      → /ch/my-channel (chat room)
  api/                    → Pages Functions (auth, messages, init, data, admin, dm, gallery, preview)

components/
  chat/    MessageList, MessageBubble, Composer, ReactionBadge, ContextMenu,
           EmojiPicker, ReplyBar, SearchBar
  admin/   AdminPanel, ChannelSettings, ManageSettings, BlockedPanel, RulesEditor, AdminGuide
  embeds/  TwitterEmbed, InstagramEmbed, YouTubeEmbed, LinkPreview
  layout/  Header, Footer, SkeletonLoader
  common/  Dialog, Banner, Toast

hooks/
  useMessages   — subscribe via Durable Object WebSocket + re-fetch on signal
  useChannel    — channel config
  useAdmin      — ownership + admin state
  useAuth       — owner session

lib/
  db.ts         — D1 queries
  realtime.ts   — Durable Object client (signal/payload split)
  storage.ts    — R2 upload helpers
  auth.ts       — session / ownership helpers
```

---

## Cost Comparison (vs the abandoned Supabase/Vercel prototype)

| | Supabase + Vercel | Cloudflare |
|---|---|---|
| Free tier | 500MB DB, 1GB storage, 100K fn/mo | 5GB D1, 10GB R2, 100K workers/day |
| Paid | ~$45/mo | ~$5/mo (Workers Paid) |
| Storage egress | $0.09/GB | **$0** |
| Realtime | Included | Durable Objects: $0.15/M requests |
| At ~1000 users | ~$45-70/mo | ~$5-15/mo |

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Durable Object must reproduce dual-path signal/fetch + presence + ~11 events | **High** | Phase 0 spike first; make-or-break gate |
| Rewrite re-introduces bugs the reference already solved | **High** | Treat reference as spec; feature-parity pass in Phase 5 against README checklist |
| Auth.js on Workers runtime | Medium | Phase 0 spike; Lucia fallback |
| Scope creep on 6,900 lines of behavior | Medium | Feature checklist as definition of done; resist gold-plating |
| FTS5 differs from Postgres full-text | Low | Rebuild search on FTS5 virtual table |
| D1 write latency (single primary) | Low | Don't over-promise "edge writes" |

---

## Decision Points (confirm before starting)

1. **Framework** — React/Next confirmed? (SvelteKit was the alternative.)
2. **Repo target** — this is a personal GitHub repo, not a Brazil package. Confirm
   Cloudflare/GitHub is intended and there's no internal equivalent.
3. **Auth** — Auth.js (default) vs Lucia (fallback)?
4. **Realtime** — commit to Durable Objects, or start with polling/SSE and add WebSocket
   later? (The reference already tolerates a signal+refetch model, so polling is a viable
   MVP fallback if the Phase 0 DO spike struggles.)
5. **Timeline priority** — full parity before launch, or ship MVP chat and iterate?
6. **Domain** — buy one, or use the Pages default?

---

## Estimated Timeline

| Phase | Duration | Deliverable |
|---|---|---|
| 0 Spike | 2-3 days | DO realtime + Auth.js proven |
| 1 Setup | 2 days | Next.js on Pages, D1, R2, routes stubbed |
| 2 Auth & onboarding | 3 days | Owner login/OAuth, sessions, channel creation |
| 3 Chat core | 7 days | Send/receive, reactions, replies, images, embeds |
| 4 Admin | 5 days | Ownership-based admin panel, broadcasts |
| 5 Polish & parity | 5 days | Search/gallery/settings + **feature-parity pass** |
| 6 Platform | 6 days | Dashboard, discovery, multi-channel, social login, SSR landing |
| **Total** | **~30-31 days** | Full feature parity on React + Cloudflare |

No data-migration or cutover phases — greenfield, nothing to preserve.

---

## Files to Reference (as spec, not to port)

- Behavioral spec / feature checklist: `README.md`, `AI_GUIDE.md`
- Realtime model to reproduce: `src/backend/supabase.js` (dual-path signals + presence)
- Business logic reference: `api/` (validation, rate limiting, banned words, freeze)
- Visual spec: `styles.css`, `index.html`, `login.html`, `onboarding.html`
- Data model: `schema.sql`
