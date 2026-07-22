# Rebuild Plan: Next.js (Vercel) + Cloudflare Backend

## Overview

Rebuild letsplay-platform as a **React/Next.js** app deployed on **Vercel**, with
**Cloudflare** providing the entire backend layer: **D1** (database), **Durable Objects**
(realtime), and **R2** (storage). This is a **greenfield rebuild** — no data to migrate,
no users to protect. The existing vanilla JS + Supabase prototype is the behavioral spec.

> The prior code is a working reference implementation. We reimplement its behavior on
> the new stack and test against the feature checklist — we don't port files.

---

## Why This Stack

### Why React/Next.js
1. **Declarative state → UI.** The reference `app.js` is 2,400+ lines of imperative DOM
   manipulation. Realtime lists with optimistic updates, reactions, edits, replies, and
   embeds are exactly what React's model solves.
2. **Enforceable component structure.** The reference already thinks in components
   (admin panels, dialogs, embeds, context menu). React makes that structural.
3. **Proven for this use case.** Spacesheep (spacesheep.co.kr) — a nearly identical
   Korean group chat platform — runs Next.js App Router + Tailwind in production.

### Why Vercel for hosting
- Next.js works **perfectly** on Vercel — zero compatibility issues.
- SSR, server actions, middleware, image optimization all work out of the box.
- Preview deployments, instant rollbacks, git-push deploys.

### Why Cloudflare for the backend
- **Single vendor** for DB + realtime + storage. One dashboard, one billing.
- **D1** — SQLite at the edge with replicated reads. $5/mo Workers Paid includes 5GB.
- **Durable Objects** — purpose-built for stateful WebSocket + presence per channel.
- **R2** — S3-compatible, zero egress fees, 10GB free.
- **Cost:** ~$5/mo total for the entire backend at small-to-medium scale.

### Why Auth.js (on Vercel)
- Cloudflare has no managed auth. Auth.js runs natively on Vercel with zero friction.
- Supports email/password + OAuth (Google, Kakao, Apple).
- Fallback: Lucia if Auth.js is problematic.

---

## Target Stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 15** (App Router) |
| Hosting | **Vercel** |
| Styling | **Tailwind CSS** |
| Database | **Cloudflare D1** (SQLite) |
| Realtime | **Cloudflare Durable Objects** + WebSocket |
| Auth | **Auth.js (NextAuth v5)** on Vercel |
| Storage | **Cloudflare R2** |
| Backend API | **Cloudflare Workers** (D1 queries, R2 access, DO orchestration) |
| Frontend API | **Next.js Route Handlers** (auth, proxying to Worker) |

---

## Architecture

```
┌─────────────────┐        WebSocket        ┌──────────────────────────┐
│                 │◄───────────────────────►│                          │
│     Browser     │                         │   Cloudflare Worker      │
│                 │◄──── HTTP (data) ──────►│   + Durable Objects      │
└─────────────────┘                         │   + D1 + R2              │
        │                                   └──────────────────────────┘
        │ HTTP (auth, SSR)                           │
        ▼                                            │
┌─────────────────┐                                  │
│  Vercel         │◄──── HTTP (internal) ────────────┘
│  Next.js App    │
│  (auth + SSR)   │
└─────────────────┘
```

### Two API layers

1. **Cloudflare Worker** — handles all data operations (messages, channels, gallery,
   admin, DM, search) + realtime (DO) + storage (R2). This is the "backend."
2. **Vercel (Next.js)** — handles auth (Auth.js sessions), SSR pages, and proxies
   authenticated requests to the Worker with verified identity.

### Data flow (sending a message)

1. Client calls Worker `/api/messages` with message + visitor UID
2. Worker validates (banned words, freeze, rate limit) → writes to D1
3. Worker triggers DO broadcast → signal sent to all WebSocket clients
4. Clients receive "message-changed" → re-fetch from Worker `/api/data`

### Auth flow

1. Owner logs in via Vercel (Auth.js handles OAuth/credentials)
2. Vercel issues a session cookie
3. Admin actions: client calls Vercel API → Vercel verifies session → calls Worker
   with a signed internal token proving identity
4. Anonymous visitors: call Worker directly (no auth needed for reads/sends)

---

## Reference Architecture (reproduce exactly)

### Auth model (lopsided — keep it)
- **Anonymous visitors never authenticate.** Stable `localStorage` identifier.
- **Only channel owners authenticate.** Owner login → session → ownership check.
- **All writes go through the Worker**, validated server-side.

### Realtime: dual-path signal + fetch
- **Signal path (WebSocket via DO):** invalidation signals broadcast to all clients.
- **Fetch path (HTTP via Worker):** clients re-fetch authoritative data from D1.

Events to reproduce (~11):
```
message-changed   gallery-changed   dm-changed        (invalidation signals)
msg-edit          msg-delete        force-refresh      (broadcast payloads)
freeze-change     profile-change    emoji-fx
status-changed (live)               live-presence (presence counting)
```

---

## D1 Schema (SQLite adaptation)

Adaptation rules from the reference Postgres schema:
- `jsonb` → TEXT (store JSON strings)
- `boolean` → INTEGER (0/1)
- `uuid` → TEXT
- `gen_random_uuid()` → `lower(hex(randomblob(16)))`
- `timestamptz` → TEXT with `datetime('now')`
- `to_tsvector` GIN index → FTS5 virtual table

```sql
-- ============================================================
-- D1 Schema (SQLite)
-- ============================================================

CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Channel',
  profile_image TEXT,
  bubble_color TEXT DEFAULT '#3b8df0',
  passcode TEXT,
  notice TEXT DEFAULT '[]',
  is_frozen INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE moderators (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  role TEXT DEFAULT 'mod',
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (channel_id, uid)
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
  reported INTEGER DEFAULT 0,
  reactions TEXT DEFAULT '{}',
  image TEXT,
  image_w INTEGER,
  image_h INTEGER,
  fingerprint TEXT,
  channel_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (channel_id) REFERENCES channels(id),
  FOREIGN KEY (reply_to) REFERENCES messages(id) ON DELETE SET NULL
);

CREATE TABLE blocked (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  uid TEXT NOT NULL,
  reason TEXT DEFAULT '',
  fingerprint TEXT,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE dm (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  uid TEXT NOT NULL,
  auth_uid TEXT,
  nick TEXT,
  text TEXT DEFAULT '',
  image TEXT,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE gallery (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  image TEXT NOT NULL,
  auth_uid TEXT,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE config (
  id TEXT PRIMARY KEY,
  text TEXT DEFAULT '',
  channel_id TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX messages_channel_idx ON messages(channel_id, created_at);
CREATE INDEX blocked_channel_idx ON blocked(channel_id);
CREATE INDEX gallery_channel_idx ON gallery(channel_id, created_at);

-- ============================================================
-- Full-Text Search (replaces Postgres GIN + to_tsvector)
-- ============================================================

CREATE VIRTUAL TABLE messages_fts USING fts5(
  text,
  content='messages',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES('delete', old.rowid, old.text);
END;

CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES('delete', old.rowid, old.text);
  INSERT INTO messages_fts(rowid, text) VALUES (new.rowid, new.text);
END;
```

### D1 caveats
- **Reads** replicate to the edge (fast globally).
- **Writes** go to a single primary region (choose the region closest to most users — likely `apac` for a Korean app).
- Don't over-promise "edge writes" — write latency is ~50-100ms from other regions.

---

## Cloudflare Worker Structure

```
worker/
  src/
    index.ts              — Worker entry, request router
    routes/
      messages.ts         — send / delete / edit / react
      data.ts             — reads (messages, search, gallery, blocked, dm, live)
      init.ts             — consolidated page load
      admin.ts            — admin actions (verified via internal token)
      gallery.ts          — image upload to R2
      dm.ts               — direct messages
      preview.ts          — OG meta scraping
    realtime/
      chat-room.ts        — Durable Object (WebSocket + presence + broadcast)
    lib/
      db.ts               — D1 query helpers
      storage.ts          — R2 helpers
      auth.ts             — internal token verification
      validation.ts       — banned words, rate limiting, freeze check
  wrangler.toml           — D1 binding, R2 binding, DO binding, routes
```

### Durable Object (per-channel realtime)

```ts
export class ChatRoom {
  connections: Map<WebSocket, { uid: string; joinedAt: number }> = new Map();

  async fetch(req: Request) {
    const url = new URL(req.url);

    // Client WebSocket upgrade
    if (url.pathname.endsWith("/ws")) {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.connections.set(server, {
        uid: url.searchParams.get("uid") || "anon",
        joinedAt: Date.now(),
      });
      server.addEventListener("close", () => this.handleClose(server));
      server.addEventListener("message", (e) => this.handleMessage(server, e));
      this.broadcastPresence();
      return new Response(null, { status: 101, webSocket: client });
    }

    // Internal broadcast trigger (from Worker routes after D1 write)
    if (url.pathname.endsWith("/broadcast")) {
      const event = await req.json();
      this.broadcast(JSON.stringify(event));
      return new Response("ok");
    }

    // Presence query
    if (url.pathname.endsWith("/presence")) {
      return Response.json({ count: this.connections.size });
    }

    return new Response("not found", { status: 404 });
  }

  broadcast(message: string) {
    for (const [ws] of this.connections) {
      try { ws.send(message); } catch { this.connections.delete(ws); }
    }
  }

  broadcastPresence() {
    this.broadcast(JSON.stringify({ type: "presence", count: this.connections.size }));
  }

  handleClose(ws: WebSocket) {
    this.connections.delete(ws);
    this.broadcastPresence();
  }

  handleMessage(ws: WebSocket, event: MessageEvent) {
    const data = JSON.parse(event.data as string);
    if (data.type === "emoji-fx" || data.type === "typing") {
      this.broadcast(event.data as string);
    }
  }
}
```

### Worker route example (send message)

```ts
// routes/messages.ts
export async function sendMessage(req: Request, env: Env) {
  const body = await req.json();
  const { uid, nick, text, channel_id, image, reply_to, fingerprint } = body;

  // Validation
  const channel = await env.DB.prepare("SELECT * FROM channels WHERE id = ?").bind(channel_id).first();
  if (!channel) return new Response("channel not found", { status: 404 });
  if (channel.is_frozen) return new Response("channel frozen", { status: 403 });

  const blocked = await env.DB.prepare("SELECT 1 FROM blocked WHERE uid = ? AND channel_id = ?")
    .bind(uid, channel_id).first();
  if (blocked) return new Response("blocked", { status: 403 });

  // Insert
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO messages (id, uid, auth_uid, nick, text, channel_id, image, reply_to, fingerprint)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, uid, body.auth_uid || uid, nick, text, channel_id, image || null, reply_to || null, fingerprint || null).run();

  // Broadcast via DO
  const doId = env.CHAT_ROOM.idFromName(channel_id);
  const stub = env.CHAT_ROOM.get(doId);
  await stub.fetch(new Request("http://internal/broadcast", {
    method: "POST",
    body: JSON.stringify({ type: "message-changed", channel_id }),
  }));

  return Response.json({ id, created_at: new Date().toISOString() });
}
```

---

## Vercel (Next.js) Responsibilities

Vercel handles **only** auth + SSR + static serving:

```
app/
  page.tsx                  → / (landing / redirect)
  login/page.tsx            → /login
  onboarding/page.tsx       → /onboarding
  dashboard/page.tsx        → /dashboard (SSR, fetch channels for owner)
  ch/[slug]/page.tsx        → /ch/my-channel (SSR shell, hydrates with realtime)
  api/
    auth/[...nextauth]/     → Auth.js handlers
    admin/route.ts          → verify session → proxy to Worker with signed token

components/
  chat/       MessageList, MessageBubble, Composer, ReactionBadge,
              ContextMenu, EmojiPicker, ReplyBar, SearchBar
  admin/      AdminPanel, ChannelSettings, ManageSettings,
              BlockedPanel, RulesEditor, AdminGuide
  embeds/     TwitterEmbed, InstagramEmbed, YouTubeEmbed, LinkPreview
  layout/     Header, Footer, SkeletonLoader
  common/     Dialog, Banner, Toast

hooks/
  useMessages     — subscribe via DO WebSocket + re-fetch from Worker
  useChannel      — channel config from Worker /api/init
  useAdmin        — ownership + admin state (Auth.js session)
  useAuth         — Auth.js session hook
  usePresence     — live user count from DO
  useRealtime     — WebSocket connection manager

lib/
  realtime.ts     — DO WebSocket client (connect, subscribe, reconnect)
  api.ts          — fetch helpers for Worker endpoints
  auth.ts         — session / ownership helpers
```

### Client API calls go directly to the Worker

```ts
// lib/api.ts
const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL; // e.g. https://api.letplay.app

export async function fetchMessages(channelId: string, cursor?: string) {
  const res = await fetch(`${WORKER_URL}/api/data?type=messages&channel=${channelId}&cursor=${cursor || ""}`);
  return res.json();
}

export async function sendMessage(payload: MessagePayload) {
  const res = await fetch(`${WORKER_URL}/api/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}
```

### Admin calls go through Vercel (for session verification)

```ts
// app/api/admin/route.ts
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });

  const body = await req.json();

  // Forward to Worker with signed identity
  const res = await fetch(`${process.env.WORKER_URL}/api/admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": process.env.INTERNAL_SECRET!,
      "X-User-Id": session.user.id!,
    },
    body: JSON.stringify(body),
  });

  return new Response(res.body, { status: res.status });
}
```

---

## Phases

### Phase 0 — Realtime spike (~2 days) ⚠️ gate before committing

Prove the Durable Object model in isolation:
- Deploy Worker + DO class.
- Client connects via WebSocket, receives broadcast signals.
- Worker route writes to D1 → triggers DO broadcast.
- Presence counting works.

**Exit criteria:** Working signal + refetch loop with presence.
**Fallback:** SSE from Worker if DO is harder than expected (upgrade later).

### Phase 1 — Project setup (~2 days)
- `npx create-next-app@latest` with App Router + Tailwind → deploy to Vercel.
- Worker project with `wrangler init` → D1 database created, schema applied.
- R2 bucket created.
- Wire Worker to custom domain (e.g., `api.letplay.app`).
- Stub all routes on both Vercel and Worker sides.

### Phase 2 — Auth & onboarding (~3 days)
- Auth.js on Vercel: email/password + Google OAuth.
- Email verification (OTP).
- Session management.
- Internal token pattern for admin calls (Vercel → Worker).
- Onboarding flow (channel creation → D1 insert).
- Anonymous visitor identity (`localStorage`).

### Phase 3 — Chat core (~7 days)
- Message components: `MessageList`, `MessageBubble`, `Composer`.
- Send/receive via Worker + DO realtime.
- `useMessages` + `useRealtime` hooks.
- Reactions, replies, editing, soft-delete.
- Image upload: client-side compression → R2 → store URL in D1.
- Long-press context menu.
- Embeds (Twitter, Instagram, YouTube, link previews).
- Optimistic updates via React state.

### Phase 4 — Admin (~5 days)
- Ownership-based admin (session → internal token → Worker verifies).
- Admin panel (channel settings: profile/square-crop, color, rules).
- Management: banned words, blocked users, freeze, live mode, DM toggle.
- Admin/user view toggle.
- Broadcasts (edit/delete/freeze/profile) via DO.

### Phase 5 — Polish & parity (~5 days)
- Full-text search via FTS5 on D1.
- Gallery, links panel.
- Settings (font size, theme, bubble color).
- Skeleton loading, typing indicator.
- Unread badge, scroll-to-bottom, offline/reconnect.
- Welcome popup, admin guide, auto-reload stale tabs.
- **Feature-parity pass against README checklist.**

### Phase 6 — Platform features (~6 days)
- Dashboard (list/create/delete channels).
- Root `/` redirect logic.
- Channel discovery, multi-channel per owner.
- Social login (Kakao, Apple).
- SSR landing page for SEO.
- RSS feed.

---

## Cost

| Service | Free tier | Paid ($5/mo Workers) |
|---|---|---|
| Vercel | 100GB bandwidth, functions included | — |
| D1 | 5GB storage, 5M reads/day, 100K writes/day | 25GB, 50B reads, 50M writes |
| R2 | 10GB storage, 0 egress | $0.015/GB beyond 10GB |
| Durable Objects | Included in Workers Paid | $0.15/M requests |
| Workers | 100K requests/day (free) | 10M requests/mo |

**Total at small scale: $5/mo** (Workers Paid plan).
**At ~1000 users: ~$5-10/mo** (vs $45-70/mo on Supabase + Vercel).

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| DO must handle signal/fetch + presence + ~11 events | **High** | Phase 0 spike; SSE fallback |
| Rewrite re-introduces solved bugs | **High** | Reference as spec; parity pass in Phase 5 |
| D1 write latency (single primary region) | Medium | Choose `apac` region; acceptable for chat |
| FTS5 differs from Postgres full-text search | Low | Simpler API, works well for Korean text |
| Cross-origin (Worker domain ≠ Vercel domain) | Low | CORS headers; standard pattern |
| Auth.js session → Worker trust boundary | Low | Signed internal token with shared secret |

---

## Testing Strategy

- **E2E (Playwright):** Feature-parity pass against README checklist.
- **Integration:** Signal/refetch loop, presence, reconnection, admin flow.
- **Worker tests (`vitest` + `miniflare`):** D1 queries, validation, rate limiting.
- **DO tests:** Broadcast delivery, presence, connection cleanup.
- **CI:** GitHub Actions → build + test on PR, Vercel preview + Wrangler deploy.

---

## Deployment & CI

| Service | Deploy method |
|---|---|
| Vercel (Next.js) | Git push → auto-deploy (preview on PR, prod on main) |
| Cloudflare Worker | `wrangler deploy` via GitHub Actions on changes to `worker/` |
| D1 migrations | SQL migration files applied via `wrangler d1 migrations apply` |

**Repo structure:**
```
/
├── app/                  ← Next.js (Vercel)
├── components/
├── hooks/
├── lib/
├── worker/              ← Cloudflare Worker (separate deploy)
│   ├── src/
│   ├── migrations/      ← D1 SQL migrations
│   └── wrangler.toml
├── package.json
└── next.config.ts
```

**Environments:**
- `preview` — Vercel preview + Worker dev environment + D1 preview DB
- `production` — Vercel prod + Worker prod + D1 prod DB

---

## Decision Points (confirm before starting)

1. **Auth** — Auth.js (default) vs Lucia?
2. **Realtime fallback** — SSE from Worker if DO spike struggles?
3. **Domain** — custom domain for app + `api.` subdomain for Worker + `ws.` for WebSocket?
4. **i18n** — Korean only, or Korean + English from day one?
5. **D1 region** — `apac` (closest to Korean users)?
6. **Timeline priority** — Full parity before launch, or ship MVP chat and iterate?

---

## Estimated Timeline

| Phase | Duration | Deliverable |
|---|---|---|
| 0 Spike | 2 days | DO realtime + D1 writes proven |
| 1 Setup | 2 days | Next.js on Vercel, Worker + D1 + R2, routes stubbed |
| 2 Auth & onboarding | 3 days | Owner login/OAuth, sessions, channel creation |
| 3 Chat core | 7 days | Send/receive, reactions, replies, images, embeds |
| 4 Admin | 5 days | Ownership-based admin panel, broadcasts |
| 5 Polish & parity | 5 days | Search/gallery/settings + feature-parity pass |
| 6 Platform | 6 days | Dashboard, discovery, multi-channel, social login |
| **Total** | **~30 days** | Full feature parity |

---

## Files to Reference (as spec, not to port)

- **Behavioral spec / feature checklist:** `README.md`, `AI_GUIDE.md`
- **Realtime model:** `src/backend/supabase.js` (dual-path signals + presence)
- **Business logic:** `api/` (validation, rate limiting, banned words, freeze)
- **Visual spec:** `styles.css`, `index.html`, `login.html`, `onboarding.html`
- **Data model:** `schema.sql` (adapted to SQLite for D1)
