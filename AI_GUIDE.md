# AI Development Guide — letsplay-platform

## Project Context

This is a multi-tenant anonymous chat platform. Each registered user creates and manages their own chat channel. Anonymous visitors can join and chat without accounts.

**Forked from:** `/home/jjiwoo/letsplay/` (personal single-channel chat)
**Location:** `/home/jjiwoo/letsplay-platform/`
**Repo:** https://github.com/jiji123526/letplay-platform
**Deployed:** https://letplay-platform-seven.vercel.app

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (ES modules), single CSS file |
| Build | Vite (multi-page: index.html + login.html) |
| Backend | Supabase (PostgreSQL + Realtime + Auth + Storage) |
| Serverless API | Vercel Functions (`/api/*.js`) |
| Auth | Supabase Auth (email/password, expandable to OAuth) |

---

## Current State (What Works)

- ✅ Full chat UI (messages, reactions, replies, images, embeds, search, gallery, live mode)
- ✅ Login page with Google OAuth + email/password (`/login`)
- ✅ Signup with email verification (OTP)
- ✅ Onboarding page with admin guide (`/onboarding`)
- ✅ Channel ownership → auto admin mode (no passcode)
- ✅ Admin panel: categorized (채널/관리), guide, view toggle
- ✅ Channel rules editor (saves to `channels.notice` JSONB)
- ✅ DM toggle, petition toggle for admin
- ✅ Optimistic block/unblock (local state updates immediately)
- ✅ Welcome popup for first-time visitors
- ✅ Database schema with `channels` table + RLS
- ✅ `/api/init.js` fetches channel data from `channels` table
- ✅ `setChannelRules` API action
- ✅ Deployed and building on Vercel
- ❌ Admin API still uses passcode (JWT ownership check not done)
- ❌ No dashboard page
- ❌ Root `/` shows broken chat (needs redirect)

---

## What Needs To Be Done

### Phase 1: Make Chat Load from DB Channels (Priority)

**Problem:** The chat page (`index.html` / `src/app.js`) still expects channel config from `config.js`. The `channels` array is empty `[]`, so the app falls back to a default config object. It needs to load the channel from the `channels` DB table.

**Fix needed in `/api/init.js`:**
- Currently reads config from `config` table (key-value pairs)
- Add: fetch the `channels` row matching `channel_id` from the `channels` table
- Return channel name, profile_image, bubble_color, passcode, notice, is_frozen in the init response

**Fix needed in `src/app.js`:**
- Use the init response to populate `currentChannelConfig` instead of reading from the empty `config.js` array
- The init response already applies `channelName` and `profileImage` — extend to include bubble_color, passcode, notice

### Phase 2: JWT-Based Admin (Replace Passcode)

**Current:** Admin actions send `passcode` string to `/api/admin.js`, compared against `ADMIN_PASSCODE` env var.

**New:** Admin = the channel owner. Verify via Supabase JWT.

**Changes needed:**

1. `/api/admin.js` — replace passcode check:
```js
// Old:
if (passcode !== process.env.ADMIN_PASSCODE) return 403;

// New:
const token = req.headers.authorization?.replace("Bearer ", "");
const { data: { user }, error } = await supabase.auth.getUser(token);
if (error || !user) return res.status(401).json({ error: "unauthorized" });
const { data: channel } = await supabase.from("channels").select("owner_uid").eq("id", channelId).single();
if (!channel || user.id !== channel.owner_uid) return res.status(403).json({ error: "not_owner" });
```

2. `/api/messages.js` — same pattern for `is_admin` verification

3. `src/admin/api.js` — send JWT instead of passcode:
```js
// Old:
body: JSON.stringify({ passcode: adminPasscode, action, payload })

// New:
headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
body: JSON.stringify({ action, payload })
```

4. `src/app.js` — detect admin by checking if logged-in user owns the channel:
- After login, store session: `localStorage.setItem("supabase_session", JSON.stringify(session))`
- On page load, check: does the session user's ID match the channel's `owner_uid`?
- If yes → show admin panel. If no → normal user.

### Phase 3: Dashboard

**New page:** `dashboard.html` (add to Vite config as entry point)

**Features:**
- List user's channels (fetch from `channels` table where `owner_uid = user.id`)
- "새 채널 만들기" button → slug + name form → calls `/api/auth` `create-channel` action
- Each channel: link to `/ch/slug`, delete button

### Phase 4: Root Page Redirect

- `/` should show a landing page or redirect:
  - Not logged in → show landing or redirect to `/login`
  - Logged in → redirect to `/dashboard`

---

## File Architecture

```
api/
  auth.js        — signup, login, create-channel (DONE)
  admin.js       — admin actions (NEEDS JWT conversion)
  messages.js    — send/delete/edit/react (NEEDS JWT for is_admin)
  init.js        — consolidated page load data (NEEDS channel DB fetch)
  data.js        — reads (messages, search, live status)
  gallery.js     — image uploads
  dm.js          — direct messages
  preview.js     — OG meta scraping
  version.js     — app version check

src/
  app.js         — main orchestrator (2335 lines)
  backend/
    supabase.js  — Supabase client, subscriptions, broadcasts
    index.js     — backend abstraction
  modules/
    admin-panels.js  — admin UI (categorized: 채널/관리)
    context-menu.js  — long-press actions
    dialogs.js       — confirm/prompt/edit dialogs
    notice.js        — notice banner system
    settings.js      — user settings panel
    embeds.js        — Twitter/Instagram/YouTube
    crop.js          — square image crop
    live.js          — live mode
    search.js        — full-text search
    gallery.js       — gallery panel
    photo.js         — image compression
    links-panel.js   — shared links
    fingerprint.js   — browser fingerprint
```

---

## Database Schema (already deployed)

Key tables:
- `channels` — id (slug), owner_uid, name, profile_image, bubble_color, passcode, notice, is_frozen
- `moderators` — channel_id, uid, role
- `messages` — standard chat messages, references channels(id)
- `blocked`, `dm`, `gallery`, `config` — per-channel data

---

## Key Design Patterns

1. **Preloaded data:** `/api/init` fetches everything in one request. Subscriptions use preloaded data to skip redundant fetches. 4-second timeout fallback.

2. **Broadcast system:** Edits, deletes, freeze, profile changes, refresh — all broadcast instantly via Supabase Realtime channels. Pattern:
   - `broadcastXxx(payload)` — sender
   - `onXxxBroadcast(callback)` — receiver
   - Registered in `startChat()` inside `if (!IS_MOCK) { initBroadcast(); ... }`

3. **Admin panels:** Categorized (채널/관리) + guide + view toggle. Each sub-panel opens as an overlay. deps passed via `initAdminPanels()`. Admin detected by channel ownership (login-based, no passcode for platform). Includes DM toggle, petition toggle, freeze, live. View toggle lets admin preview as non-admin (persistent return banner).

4. **Mock mode:** `config.js` has `BACKEND = "mock"` / `USE_MOCK = true` for local dev without Supabase. Uses localStorage.

---

## Environment Variables (Vercel)

| Variable | Value |
|---|---|
| `SUPABASE_URL` | The platform's Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key (never expose to client) |

Note: `ADMIN_PASSCODE` will be removed once JWT auth is implemented.

---

## Coding Conventions

- Vanilla JS, ES modules, no framework
- Single `styles.css` (no CSS modules, no preprocessor)
- Inline styles only for dynamic values (data-driven colors, display:none toggles)
- CSS variables: `--bubble-font-size`, `--bubble-sent`, `--bubble-recv`, `--bg`, `--fg`, `--meta`, `--card`, `--hairline`
- Font sizes scale via `calc(var(--bubble-font-size, 17px) ± offset)`
- Dark mode via `[data-theme="dark"]` selectors
- Korean UI text throughout

---

## Testing

- Mock mode for local testing (no Supabase needed)
- Build: `npm run build` (must pass before deploying)
- Dev server: `npm run dev` (access at localhost:5173)
- `/ch/channel-slug` routes require Vercel rewrites (won't work in local dev)
- Pre-commit hook: auto-switches mock mode off before commit

---

---

## Moderation Hierarchy

Two levels of moderation exist in this platform:

### Channel-Level (Channel Owner)
- Users report messages → channel owner sees in admin panel
- Owner can delete messages, ban users, manage blocked list
- This is standard per-channel moderation (already implemented)

### Platform-Level (Platform Admin — the developer)
- Users report a *channel* or *channel owner* for abuse
- Channel owner cannot moderate themselves
- Platform admin (super-admin) reviews these reports
- Actions: warn owner, suspend channel, delete channel, ban account

| Report type | Who reviews | Example |
|---|---|---|
| Message in a channel | Channel owner | "이 사람이 욕함" → owner bans |
| Channel owner abusive | Platform admin | "방주인이 개인정보 유출" → suspend channel |
| Illegal content | Platform admin | CSAM, threats → delete immediately |
| Spam channels | Platform admin | Bot-created rooms → bulk delete |

### When to Build Platform-Level Reports
- Not needed until 20+ channels owned by other people
- Required by Korean law (통신사업자 신고처리 의무) at certain user thresholds
- Needs: `/report-channel` endpoint, super-admin dashboard, email notifications
- For now, channel-owner moderation is sufficient

---

## Future Features

### RSS Feed
A machine-readable XML file (`/rss.xml`) listing public channels. RSS readers, search engines, and social platforms can consume it.

**Why it matters for SEO:**
- Google discovers new pages faster (channels, posts)
- Aggregator sites can list rooms (free distribution)
- Shows search engines the site has fresh, updating content
- Naver/Daum can index Korean content through RSS

**Implementation:**
- `/api/rss.js` endpoint that generates XML:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>letsplay</title>
    <link>https://yoursite.com</link>
    <item>
      <title>Gaming Chat Room</title>
      <link>https://yoursite.com/ch/gaming</link>
      <pubDate>Mon, 21 Jul 2026 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
```
- Add `<link rel="alternate" type="application/rss+xml" href="/api/rss">` to HTML head
- Query `channels` table for public rooms, ordered by `created_at`
- ~30 minutes of work, runs forever, helps SEO passively

### Social Login (Google, Kakao, Apple)
All handled by Supabase Auth built-in OAuth providers.

**Setup per provider:**
1. Enable in Supabase Dashboard → Authentication → Providers
2. Get Client ID + Secret from provider's developer console
3. Add redirect URI: `https://<SUPABASE_PROJECT_ID>.supabase.co/auth/v1/callback`
4. Paste credentials in Supabase

**Client-side code (same for all providers):**
```js
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google', // or 'kakao', 'apple'
  options: { redirectTo: 'https://yoursite.com/dashboard' }
});
```

**Priority:** Google + Kakao first (covers 99% of Korean users). Apple only if App Store is planned ($99/year developer account required).

### Room Privacy Toggle
- `is_private` boolean on `channels` table
- Not logged in → "로그인 후 이용할 수 있는 채널입니다"
- Logged in but not member → "멤버만 입장할 수 있습니다" + request access
- Needs `members` table: channel_id, uid, role (member/blocked)
- Owner approves/rejects from admin panel

### Report System (Channel-Level → Platform-Level)
See "Moderation Hierarchy" section above.

---

## Common Pitfalls

1. `config.js` exports `channels = []` — any code expecting channel data from this array will get empty/undefined. Always fall back to defaults.
2. Connection monitor uses `publicRealtime.realtime?.socket` — the Supabase SDK structure can vary between versions.
3. `subscribe` callback merges incoming messages with existing (not replaces) to preserve scroll-up history.
4. Admin verification on page load (`verifyAdmin`) is skipped in mock mode.
5. Gallery items need `formatGalleryItem()` applied (converts `created_at` string to Date).
