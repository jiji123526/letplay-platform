# Migration Plan: React + Cloudflare

## Overview

Rewrite the letsplay-platform from Vanilla JS + Supabase + Vercel to React + Cloudflare stack.

---

## New Tech Stack

| Layer | Current | New |
|---|---|---|
| Framework | Vanilla JS (ES modules) | **React 19 + Next.js 15** (App Router) |
| Styling | Single CSS file | **Tailwind CSS** |
| Database | Supabase (PostgreSQL) | **Cloudflare D1** (SQLite at the edge) |
| Realtime | Supabase Realtime (WebSocket) | **Cloudflare Durable Objects** + WebSocket |
| Auth | Supabase Auth | **Cloudflare Access** or custom JWT with D1 |
| Storage | Supabase Storage | **Cloudflare R2** (S3-compatible) |
| Serverless | Vercel Functions | **Cloudflare Workers** (Pages Functions) |
| Hosting | Vercel | **Cloudflare Pages** |
| CDN | Vercel Edge | **Cloudflare CDN** (built-in, 300+ PoPs) |

---

## Why This Migration

### Gains
- **Global edge performance**: Cloudflare runs at 300+ data centers. D1/Workers execute at the edge — lower latency worldwide
- **Cost**: Cloudflare free tier is more generous (100K worker requests/day, 5GB D1, 10GB R2). No surprise bills
- **React ecosystem**: Component reuse, rich UI libraries, easier hiring
- **SSR**: Next.js on Cloudflare Pages gives server-rendering for SEO/discovery pages
- **Unified platform**: One provider for hosting, DB, storage, realtime, auth, CDN, DNS, DDoS protection
- **No vendor lock-in on DB**: D1 is SQLite — portable, can export/import easily

### Losses
- **Full rewrite**: 3-6 weeks of work
- **Realtime complexity**: Supabase Realtime is built-in and free. Cloudflare Durable Objects require custom WebSocket code
- **Auth complexity**: Supabase Auth has OAuth built-in. On Cloudflare you'd build it yourself or use a third-party (Auth.js, Lucia)
- **Learning curve**: Durable Objects, D1 syntax, Workers KV patterns
- **Bundle size**: React adds ~150KB baseline (vs current 160KB total)

---

## Architecture

```
User → Cloudflare CDN → Cloudflare Pages (Next.js SSR)
                      → Cloudflare Workers (API)
                      → Cloudflare D1 (Database)
                      → Cloudflare R2 (Image storage)
                      → Cloudflare Durable Objects (Realtime WebSocket)
```

### Pages (Next.js App Router)
```
app/
  page.tsx              → / (landing/discovery)
  login/page.tsx        → /login
  onboarding/page.tsx   → /onboarding
  dashboard/page.tsx    → /dashboard
  ch/[slug]/page.tsx    → /ch/my-channel (chat room)
  ch/[slug]/layout.tsx  → chat layout (header, composer)
  api/
    auth/route.ts       → login, signup, OAuth
    messages/route.ts   → send, delete, edit
    init/route.ts       → consolidated page load
    admin/route.ts      → admin actions
```

### Database (D1 — SQLite)
```sql
-- Same schema, adapted for SQLite
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Channel',
  profile_image TEXT,
  bubble_color TEXT DEFAULT '#3b8df0',
  passcode TEXT,
  notice TEXT, -- JSON string (SQLite has no JSONB)
  is_frozen INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  uid TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  text TEXT DEFAULT '',
  is_admin INTEGER DEFAULT 0,
  reply_to TEXT,
  deleted INTEGER DEFAULT 0,
  edited INTEGER DEFAULT 0,
  reactions TEXT DEFAULT '{}', -- JSON string
  image TEXT,
  image_w INTEGER,
  image_h INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);

-- Similar for blocked, dm, gallery tables
```

### Realtime (Durable Objects)
```
Each channel = one Durable Object instance
  - Maintains WebSocket connections for all users in that channel
  - Broadcasts new messages, edits, deletes, reactions
  - Handles presence (who's online)
  - No database polling — events pushed directly
```

### Auth Options

**Option A: Auth.js (NextAuth.js v5)**
- Built-in Google, Kakao, Apple OAuth
- Session management, JWT tokens
- Works with Cloudflare Pages
- Most feature-complete

**Option B: Lucia Auth**
- Lightweight, framework-agnostic
- Full control over sessions
- Works with D1 directly
- More manual but flexible

**Option C: Custom JWT**
- Roll your own with Workers
- bcrypt for passwords, JWT for sessions
- Most control, most work
- Store sessions in D1 or Workers KV

**Recommendation:** Auth.js — easiest OAuth integration, well-documented, active community.

### Storage (R2)
```
- Images uploaded via presigned URLs (direct browser → R2)
- No egress fees (unlike S3/Supabase Storage)
- Public bucket for serving images via CDN
- Same upload flow: compress client-side → upload → store URL in D1
```

---

## Migration Phases

### Phase 1: Project Setup (Day 1-2)
- Initialize Next.js 15 with App Router
- Configure Cloudflare Pages deployment
- Set up Tailwind CSS
- Create D1 database, run schema
- Set up R2 bucket
- Basic page routes (landing, login, chat)

### Phase 2: Auth (Day 3-5)
- Auth.js with Google OAuth + email/password
- Signup flow with email verification
- Session management (JWT in cookie)
- Onboarding page (channel creation)
- Protected routes (middleware)

### Phase 3: Chat Core (Day 6-12)
- Message rendering (React components)
- Send/receive messages via Workers API
- Durable Object for real-time WebSocket
- Reactions, replies, editing, soft-delete
- Image upload to R2
- Long-press context menu
- Embeds (Twitter, Instagram, YouTube)

### Phase 4: Admin Features (Day 13-17)
- Channel ownership check (from session)
- Admin panel (React components)
- Channel rules, profile, color, passcode
- Banned words, blocked users
- Freeze, live mode
- DM system
- Broadcast via Durable Objects

### Phase 5: Polish & Parity (Day 18-22)
- Search (full-text on D1)
- Gallery, links panel
- Settings (font size, theme, bubble color)
- Skeleton loading, typing indicator
- Unread badge, scroll-to-bottom
- Offline awareness
- Welcome popup, admin guide
- Performance optimization

### Phase 6: Platform Features (Day 23-28)
- Dashboard page
- Channel discovery
- Multiple channels per user
- Social login (Kakao, Apple)
- Landing page with SSR

---

## Component Architecture

```
components/
  chat/
    MessageBubble.tsx
    MessageList.tsx
    Composer.tsx
    ReactionBadge.tsx
    ContextMenu.tsx
    EmojiPicker.tsx
    ReplyBar.tsx
    SearchBar.tsx
  admin/
    AdminPanel.tsx
    ChannelSettings.tsx
    ManageSettings.tsx
    BlockedPanel.tsx
    RulesEditor.tsx
    AdminGuide.tsx
  layout/
    Header.tsx
    Footer.tsx
    SkeletonLoader.tsx
  embeds/
    TwitterEmbed.tsx
    InstagramEmbed.tsx
    YouTubeEmbed.tsx
    LinkPreview.tsx
  common/
    Dialog.tsx
    Banner.tsx
    Toast.tsx

hooks/
  useMessages.ts      — subscribe to messages via WebSocket
  useChannel.ts       — channel config
  useAdmin.ts         — admin state
  useAuth.ts          — session/user

lib/
  db.ts              — D1 queries
  realtime.ts        — Durable Object client
  storage.ts         — R2 upload helpers
  auth.ts            — session helpers
```

---

## Cost Comparison

| | Supabase + Vercel (current) | Cloudflare (new) |
|---|---|---|
| **Free tier** | 500MB DB, 1GB storage, 100K functions/mo | 5GB D1, 10GB R2, 100K workers/day |
| **Pro tier** | $25 + $20 = $45/mo | $5/mo (Workers Paid) |
| **Realtime** | Included (500 connections on Pro) | Durable Objects: $0.15/million requests |
| **Storage egress** | $0.09/GB | **$0 (free)** |
| **Global latency** | US/EU only (Supabase region) | 300+ PoPs worldwide |
| **At 1000 users** | ~$45-70/mo | ~$5-15/mo |

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Durable Objects complexity | Start with polling, add WebSocket incrementally |
| D1 limitations (no JSONB, no triggers) | Use JSON strings, handle in application layer |
| Auth.js + Cloudflare compatibility | Test early in Phase 1, fallback to Lucia |
| Full-text search on SQLite | D1 supports FTS5 extension |
| Migration downtime | Run both systems in parallel during transition |
| Feature regression | Maintain feature checklist, test each before removing old system |

---

## Decision Points (Confirm Before Starting)

1. **Auth provider**: Auth.js vs Lucia vs custom?
2. **Domain**: Keep vercel.app or buy a domain for Cloudflare?
3. **Parallel or replacement**: Run both systems during migration or hard cutover?
4. **Realtime approach**: Durable Objects (complex, true WebSocket) or D1 polling + SSE (simpler, slight delay)?
5. **Timeline priority**: Feature parity first, or launch with minimal features and iterate?

---

## Estimated Timeline

| Phase | Duration | Deliverable |
|---|---|---|
| Setup | 2 days | Next.js on Cloudflare Pages, D1, R2 |
| Auth | 3 days | Login, signup, OAuth, sessions |
| Chat core | 7 days | Send/receive, reactions, replies, images |
| Admin | 5 days | Full admin panel parity |
| Polish | 5 days | All UX features (search, gallery, embeds) |
| Platform | 6 days | Dashboard, discovery, multi-channel |
| **Total** | **~28 days** | Full feature parity + platform features |

---

## Files to Reference

- Current schema: `/home/jjiwoo/letsplay-platform/schema.sql`
- Current API patterns: `/home/jjiwoo/letsplay-platform/api/`
- Current UI logic: `/home/jjiwoo/letsplay-platform/src/app.js`
- AI guide for current architecture: `/home/jjiwoo/letsplay-platform/AI_GUIDE.md`
