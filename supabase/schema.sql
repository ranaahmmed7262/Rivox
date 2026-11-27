-- RIVOX initial database schema
-- Apply in a dedicated Supabase project (do not reuse another app's database).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rivox_id text unique,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_rivox_id_format check (rivox_id is null or rivox_id ~ '^[A-Z0-9]{6,12}$')
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  title text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_body_length check (char_length(body) between 1 and 5000)
);

create index if not exists conversation_members_user_idx on public.conversation_members(user_id);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Profiles are discoverable to signed-in users; each user controls their own profile.
create policy "Signed-in users can view profiles"
  on public.profiles for select to authenticated using (true);
create policy "Users can create their own profile"
  on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- A conversation is visible only to its members.
create policy "Members can view conversations"
  on public.conversations for select to authenticated
  using (exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = id and cm.user_id = (select auth.uid())
  ));
create policy "Signed-in users can create conversations"
  on public.conversations for insert to authenticated
  with check ((select auth.uid()) = created_by);

create policy "Members can view membership"
  on public.conversation_members for select to authenticated
  using (exists (
    select 1 from public.conversation_members own
    where own.conversation_id = conversation_id and own.user_id = (select auth.uid())
  ));
create policy "Conversation creator can add members"
  on public.conversation_members for insert to authenticated
  with check (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.created_by = (select auth.uid())
  ));

create policy "Members can read messages"
  on public.messages for select to authenticated
  using (exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = conversation_id and cm.user_id = (select auth.uid())
  ));
create policy "Members can send messages as themselves"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_id and cm.user_id = (select auth.uid())
    )
  );

grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.conversations to authenticated;
grant select, insert on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;
