-- ============================================================
-- Platform Schema (multi-tenant)
-- Run in Supabase SQL Editor
-- ============================================================

-- Channel owners (registered users manage their own channels)
create table channels (
  id text primary key,                    -- URL slug: "myroom", "gaming-kr"
  owner_uid uuid not null,                -- Supabase Auth user ID
  name text not null default 'My Channel',
  profile_image text,
  bubble_color text default '#3b8df0',
  passcode text,                          -- SHA-256 hash, null = no passcode
  notice jsonb default '[]',              -- [{title, items}]
  is_frozen boolean default false,
  created_at timestamptz default now()
);

-- Moderators (optional additional admins per channel)
create table moderators (
  channel_id text references channels(id) on delete cascade,
  uid uuid not null,
  role text default 'mod',
  created_at timestamptz default now(),
  primary key (channel_id, uid)
);

-- Messages table
create table messages (
  id uuid default gen_random_uuid() primary key,
  uid text not null,
  auth_uid uuid not null,
  nick text,
  text text default '',
  is_admin boolean default false,
  reply_to uuid references messages(id) on delete set null,
  report boolean default false,
  reported_msg_id uuid,
  gallery_id uuid,
  dm boolean default false,
  deleted boolean default false,
  edited boolean default false,
  reported boolean default false,
  reactions jsonb default '{}',
  image text,
  image_w integer,
  image_h integer,
  fingerprint text,
  channel_id text not null references channels(id),
  created_at timestamptz default now()
);

-- Blocked users table
create table blocked (
  id uuid default gen_random_uuid() primary key,
  uid text not null,
  reason text default '',
  fingerprint text,
  channel_id text not null references channels(id),
  created_at timestamptz default now()
);

-- DM table
create table dm (
  id uuid default gen_random_uuid() primary key,
  uid text not null,
  auth_uid uuid,
  nick text,
  text text default '',
  image text,
  channel_id text not null references channels(id),
  created_at timestamptz default now()
);

-- Gallery table
create table gallery (
  id uuid default gen_random_uuid() primary key,
  image text not null,
  auth_uid uuid,
  channel_id text not null references channels(id),
  created_at timestamptz default now()
);

-- Config table (per-channel key-value store)
create table config (
  id text primary key,
  text text default '',
  channel_id text not null,
  updated_at timestamptz default now()
);

-- ============================================================
-- RLS Policies
-- ============================================================

alter table channels enable row level security;
alter table moderators enable row level security;
alter table messages enable row level security;
alter table blocked enable row level security;
alter table dm enable row level security;
alter table gallery enable row level security;
alter table config enable row level security;

-- Channels: public read, owner insert/update
create policy "Public read" on channels for select using (true);
create policy "Owner insert" on channels for insert to authenticated with check (owner_uid = auth.uid());
create policy "Owner update" on channels for update to authenticated using (owner_uid = auth.uid());
create policy "Owner delete" on channels for delete to authenticated using (owner_uid = auth.uid());

-- Moderators: channel owner manages
create policy "Public read" on moderators for select using (true);
create policy "Owner manage" on moderators for all to authenticated using (
  exists (select 1 from channels where channels.id = moderators.channel_id and channels.owner_uid = auth.uid())
);

-- Messages: public read (writes via API)
create policy "Public read" on messages for select to authenticated using (true);

-- Blocked: public read (writes via API)
create policy "Public read" on blocked for select to authenticated using (true);

-- DM: owner/sender can read (writes via API)
create policy "Sender read" on dm for select to authenticated using (auth_uid = auth.uid());

-- Gallery: public read (writes via API)
create policy "Public read" on gallery for select to authenticated using (true);

-- Config: public read (writes via API)
create policy "Public read" on config for select to authenticated using (true);

-- ============================================================
-- Realtime
-- ============================================================

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table blocked;
alter publication supabase_realtime add table dm;
alter publication supabase_realtime add table gallery;
alter publication supabase_realtime add table config;
alter publication supabase_realtime add table channels;

-- ============================================================
-- Indexes
-- ============================================================

create index messages_channel_idx on messages(channel_id, created_at);
create index messages_text_search on messages using gin(to_tsvector('simple', text));
create index blocked_channel_idx on blocked(channel_id);
create index gallery_channel_idx on gallery(channel_id, created_at);

-- ============================================================
-- Storage
-- ============================================================

insert into storage.buckets (id, name, public) values ('media', 'media', true);
create policy "Authenticated upload" on storage.objects for insert to authenticated with check (bucket_id = 'media');
create policy "Public read" on storage.objects for select using (bucket_id = 'media');
create policy "Owner delete" on storage.objects for delete to authenticated using (owner = auth.uid() and bucket_id = 'media');
