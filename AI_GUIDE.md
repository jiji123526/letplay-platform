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
- ✅ Login/signup page (`/login`)
- ✅ Auth API (`/api/auth.js` — signup creates user + channel, login returns session)
- ✅ Database schema with `channels` table + RLS
- ✅ Deployed and building on Vercel
- ✅ `/api/init.js` — consolidated initial data endpoint

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

3. **Admin panels:** Categorized (채널/관리). Each sub-panel opens as an overlay. deps passed via `initAdminPanels()`.

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

## Common Pitfalls

1. `config.js` exports `channels = []` — any code expecting channel data from this array will get empty/undefined. Always fall back to defaults.
2. Connection monitor uses `publicRealtime.realtime?.socket` — the Supabase SDK structure can vary between versions.
3. `subscribe` callback merges incoming messages with existing (not replaces) to preserve scroll-up history.
4. Admin verification on page load (`verifyAdmin`) is skipped in mock mode.
5. Gallery items need `formatGalleryItem()` applied (converts `created_at` string to Date).
