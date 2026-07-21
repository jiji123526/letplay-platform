# letsplay-platform

Multi-tenant anonymous chat platform. Each registered user gets their own channel to manage.

## Status: In Development

Forked from the personal `letsplay` project. Core chat features work; multi-tenant auth layer in progress.

## Architecture

```
Registered user (channel owner) = admin of their channel
Anonymous visitors = chat participants
```

## What's Done (from personal project)
- Real-time chat with Supabase Realtime
- Reactions, replies, editing, soft-delete
- Image sharing, embeds (Twitter, Instagram, YouTube)
- Live mode, search, gallery, links panel
- Admin panel (notice, color, passcode, banned words, block, freeze)
- Broadcast system (edits, deletes, freeze, profile, refresh)
- Performance: /api/init consolidated loading, embed preservation

## What's New (platform-specific)
- [ ] Auth: sign up, login, session management
- [ ] Channel ownership: each user owns their channels
- [ ] Dynamic channels: created via DB, not config.js
- [ ] API auth: JWT + ownership check replaces passcode
- [ ] Dashboard: manage your channels
- [ ] Channel discovery (optional)
- [ ] Monetization hooks (optional)

## Setup

1. Create a new Supabase project
2. Run `schema.sql` in SQL Editor
3. Set env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
4. `npm install && npm run dev`

## License

Private project.
