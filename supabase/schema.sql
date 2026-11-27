-- RIVOX dedicated Supabase schema (matches the applied rivox_initial_chat_schema migration)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rivox_id text not null unique,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_rivox_id_format check (rivox_id ~ '^[A-F0-9]{8}$')
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

create or replace function public.is_conversation_member(target_conversation_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = target_conversation_id
      and cm.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

create or replace function public.handle_new_rivox_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, rivox_id, display_name)
  values (
    new.id,
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', '')
  );
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_rivox on auth.users;
create trigger on_auth_user_created_rivox
  after insert on auth.users
  for each row execute function public.handle_new_rivox_user();

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Authenticated users can view profiles" on public.profiles;
create policy "Authenticated users can view profiles" on public.profiles
  for select to authenticated using (true);
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Members can view conversations" on public.conversations;
create policy "Members can view conversations" on public.conversations
  for select to authenticated using (public.is_conversation_member(id));
drop policy if exists "Users can create conversations" on public.conversations;
create policy "Users can create conversations" on public.conversations
  for insert to authenticated with check ((select auth.uid()) = created_by);

drop policy if exists "Members can view conversation membership" on public.conversation_members;
create policy "Members can view conversation membership" on public.conversation_members
  for select to authenticated using (public.is_conversation_member(conversation_id));
drop policy if exists "Conversation creator can add members" on public.conversation_members;
create policy "Conversation creator can add members" on public.conversation_members
  for insert to authenticated with check (
    exists (select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = (select auth.uid()))
  );

drop policy if exists "Members can read messages" on public.messages;
create policy "Members can read messages" on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));
drop policy if exists "Members can send messages as themselves" on public.messages;
create policy "Members can send messages as themselves" on public.messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and public.is_conversation_member(conversation_id)
  );

grant select, update on public.profiles to authenticated;
grant select, insert on public.conversations to authenticated;
grant select, insert on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;


-- Enable live message updates for subscribed clients.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;
