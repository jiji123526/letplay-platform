# letsplay-platform

Multi-tenant anonymous chat platform. Each registered user gets their own channel to manage.

## Status: Rebuilding

The vanilla JS + Supabase prototype is complete and serves as the behavioral spec.
Currently rebuilding on **Next.js (Vercel) + Cloudflare (D1, Durable Objects, R2)**.

See [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) for the full rebuild plan.

---

## Architecture

```
Registered user (channel owner) = admin of their channel
Anonymous visitors = chat participants (no login needed)
```

### Target Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router) + Tailwind CSS |
| Hosting | Vercel |
| Database | Cloudflare D1 (SQLite) |
| Realtime | Cloudflare Durable Objects + WebSocket |
| Auth | Auth.js (NextAuth v5) on Vercel |
| Storage | Cloudflare R2 |
| Backend API | Cloudflare Workers |

### System Design

```
Browser ←──WebSocket──→ Cloudflare DO (per-channel, presence + signals)
Browser ←──HTTP──→ Cloudflare Worker (data reads/writes, D1, R2)
Browser ←──HTTP──→ Vercel (auth, SSR, admin proxy)
```

---

## Feature Checklist (parity target from reference prototype)

### Auth & Onboarding
- [ ] Login page (email/password + Google OAuth)
- [ ] Signup with email verification (OTP)
- [ ] Password requirements (8+ chars, at least one number)
- [ ] Onboarding page (channel creation for new users)
- [ ] Admin guide (step 2 of onboarding)
- [ ] Channel ownership → auto admin mode

### Chat Features
- [ ] Real-time messaging via Durable Objects
- [ ] Reactions, replies, editing, soft-delete
- [ ] Image sharing with compression, GIFs, multi-photo
- [ ] Embeds (Twitter, Instagram, YouTube, link previews)
- [ ] Live mode, search, gallery, links panel
- [ ] Dark/light theme, font size, bubble color
- [ ] Long messages (>1000 chars) truncated with expandable overlay
- [ ] Typing indicator for loading images
- [ ] Skeleton loading screen
- [ ] Unread message count badge

### Admin Panel (Channel Owner)
- [ ] Categorized: 채널 / 관리
- [ ] Channel settings: profile (square crop), color, passcode, rules
- [ ] Management: banned words, blocked users, petition toggle, DM toggle
- [ ] Chat freeze (users can only DM when frozen)
- [ ] Live mode (temporary sessions, auto-delete)
- [ ] Admin/user view toggle (preview as non-admin)
- [ ] In-app admin guide
- [ ] Channel rules editor (multi-section, saved to DB)
- [ ] Welcome popup for first-time visitors

### Performance & Broadcasting
- [ ] `/api/init` consolidated loading (single request)
- [ ] Broadcast: edits, deletes, freeze, profile changes
- [ ] Optimistic deletion for admin
- [ ] Offline/reconnection banner
- [ ] Auto-reload stale tabs (>5min background)

### Security
- [ ] Admin determined by channel ownership (JWT, no passcode)
- [ ] Server-side: banned words, rate limiting, message length cap (5000)
- [ ] Server-side: freeze enforcement, ban check on every message
- [ ] Non-admin blocked data privacy

### Platform
- [ ] Dashboard (list/create/delete channels)
- [ ] Root `/` redirect (login or dashboard)
- [ ] Channel discovery
- [ ] Social login: Kakao, Apple (Google in initial build)
- [ ] RSS feed
- [ ] SSR landing page

---

## Project Structure (target)

```
/
├── app/                    ← Next.js pages (Vercel)
│   ├── page.tsx            → / (landing/redirect)
│   ├── login/
│   ├── onboarding/
│   ├── dashboard/
│   ├── ch/[slug]/
│   └── api/auth/          → Auth.js handlers
├── components/
│   ├── chat/              → MessageList, Composer, ContextMenu, etc.
│   ├── admin/             → AdminPanel, Settings, BlockedPanel, etc.
│   ├── embeds/            → Twitter, Instagram, YouTube, LinkPreview
│   ├── layout/            → Header, Footer, SkeletonLoader
│   └── common/            → Dialog, Banner, Toast
├── hooks/                  → useMessages, useRealtime, useAuth, etc.
├── lib/                    → api client, auth helpers, realtime client
├── worker/                ← Cloudflare Worker (separate deploy)
│   ├── src/
│   │   ├── index.ts       → request router
│   │   ├── routes/        → messages, data, admin, gallery, dm, preview
│   │   ├── realtime/      → ChatRoom Durable Object
│   │   └── lib/           → D1 helpers, R2 helpers, validation
│   ├── migrations/        → D1 SQL migrations
│   └── wrangler.toml
├── package.json
└── next.config.ts
```

---

## Development

### Prerequisites
- Node.js 18+
- Vercel account
- Cloudflare account (Workers Paid, $5/mo)
- Wrangler CLI (`npm i -g wrangler`)

### Local Development
```bash
# Frontend (Next.js)
npm install
npm run dev              # localhost:3000

# Worker (Cloudflare)
cd worker
npm install
wrangler dev             # localhost:8787 (local D1 + DO)
```

### Environment Variables

**Vercel:**
| Variable | Description |
|---|---|
| `NEXTAUTH_SECRET` | Auth.js secret |
| `NEXTAUTH_URL` | App URL |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `WORKER_URL` | Cloudflare Worker URL |
| `INTERNAL_SECRET` | Shared secret for Vercel → Worker auth |

**Cloudflare (wrangler.toml):**
| Binding | Description |
|---|---|
| `DB` | D1 database |
| `MEDIA` | R2 bucket |
| `CHAT_ROOM` | Durable Object namespace |
| `INTERNAL_SECRET` | Shared secret for Vercel → Worker auth |

### Deployment
```bash
# Vercel — auto-deploys on git push to main
git push origin main

# Worker — manual or via CI
cd worker && wrangler deploy
```

---

## Reference Implementation

The `prototype/` branch contains the original vanilla JS + Supabase code used as the
behavioral spec. Key files:

- `src/app.js` — main orchestrator (2,400+ lines, the behavior to reproduce)
- `src/backend/supabase.js` — realtime model (dual-path signal + fetch)
- `api/` — all business logic (validation, rate limiting, admin)
- `styles.css` — visual spec (70K lines of CSS)
- `schema.sql` — original Postgres schema (adapted to SQLite for D1)
- `AI_GUIDE.md` — detailed feature documentation

---

## License

Private project.
