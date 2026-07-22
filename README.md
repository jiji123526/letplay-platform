# letsplay-platform

Multi-tenant anonymous chat platform. Each registered user gets their own channel to manage.

## Status: In Development

Core chat + auth + onboarding working. JWT-based admin and dashboard in progress.

## Architecture

```
Registered user (channel owner) = admin of their channel
Anonymous visitors = chat participants (no login needed)
```

## What's Done

### Auth & Onboarding
- ✅ Login page (email/password + Google OAuth)
- ✅ Signup with email verification (OTP)
- ✅ Password requirements (8+ chars, at least one number)
- ✅ Onboarding page (channel creation for new users)
- ✅ Admin guide (step 2 of onboarding, expandable feature details)
- ✅ Channel ownership → auto admin mode
- ✅ Skip param for testing (`?skip=true`)

### Chat Features (from personal project)
- ✅ Real-time messaging via Supabase Realtime
- ✅ Reactions, replies, editing, soft-delete
- ✅ Image sharing with compression, GIFs, multi-photo
- ✅ Embeds (Twitter, Instagram, YouTube, link previews)
- ✅ Live mode, search, gallery, links panel
- ✅ Dark/light theme, font size, bubble color
- ✅ Long messages (>1000 chars) truncated with expandable overlay
- ✅ Typing indicator for loading images
- ✅ Skeleton loading screen
- ✅ Unread message count badge

### Admin Panel (Channel Owner)
- ✅ Categorized: 채널 / 관리
- ✅ Channel settings: profile (square crop), color, passcode, rules
- ✅ Management: banned words, blocked users, petition toggle, DM toggle
- ✅ Chat freeze (users can only DM when frozen)
- ✅ Live mode (temporary sessions, auto-delete)
- ✅ Admin/user view toggle (preview as non-admin)
- ✅ In-app admin guide
- ✅ Channel rules editor (multi-section, saved to DB)
- ✅ Welcome popup for first-time visitors

### Performance & Broadcasting
- ✅ `/api/init` consolidated loading (single request)
- ✅ Preloaded data for subscriptions
- ✅ Embed preservation during re-renders
- ✅ Broadcast: edits, deletes, freeze, profile changes
- ✅ Optimistic deletion for admin
- ✅ Offline/reconnection banner
- ✅ Auto-reload stale tabs (>5min background)

### Security
- ✅ Admin determined by channel ownership (login-based, no passcode)
- ✅ Server-side: banned words, rate limiting, message length cap (5000)
- ✅ Server-side: freeze enforcement, ban check on every message
- ✅ Non-admin blocked data privacy (no full list exposed)

## What's Remaining

- [ ] JWT-based admin API auth (replace passcode with ownership check)
- [ ] Dashboard page (list channels, create new, delete)
- [ ] Root `/` redirect (login or dashboard)
- [ ] Channel discovery (optional)
- [ ] Monetization hooks (optional)
- [ ] Social login: Kakao, Apple (Google done)

## Setup

### Prerequisites
- Node.js 18+
- A Supabase project
- A Vercel account

### Steps
1. Create Supabase project, run `schema.sql`
2. Enable Anonymous Auth + Google OAuth in Supabase
3. Update `config.js` with Supabase URL + anon key
4. Set Vercel env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
5. `npm install && npm run dev`

### Local Development
- Set `BACKEND = "mock"` and `USE_MOCK = true` in `config.js`
- Admin mode: `localStorage.setItem("isAdmin", "true")` in console
- Onboarding test: visit `/onboarding.html?skip=true`

## License

Private project.
