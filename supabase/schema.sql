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


-- Call signaling foundation. Media transport still requires a WebRTC client and TURN service.
create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null check (call_type in ('audio','video')),
  status text not null default 'ringing' check (status in ('ringing','accepted','rejected','ended','missed')),
  offer jsonb, answer jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint call_distinct_participants check (caller_id <> callee_id)
);
create index if not exists call_sessions_callee_created_idx on public.call_sessions(callee_id, created_at desc);
alter table public.call_sessions enable row level security;
create policy "Call participants can view their calls" on public.call_sessions
  for select to authenticated using (caller_id = (select auth.uid()) or callee_id = (select auth.uid()));
create policy "Conversation members can start calls" on public.call_sessions
  for insert to authenticated with check (
    caller_id = (select auth.uid())
    and exists (select 1 from public.conversation_members cm where cm.conversation_id = call_sessions.conversation_id and cm.user_id = (select auth.uid()))
    and exists (select 1 from public.conversation_members cm where cm.conversation_id = call_sessions.conversation_id and cm.user_id = callee_id)
  );
create policy "Call participants can update call signaling" on public.call_sessions
  for update to authenticated using (caller_id = (select auth.uid()) or callee_id = (select auth.uid()))
  with check (caller_id = (select auth.uid()) or callee_id = (select auth.uid()));
grant select, insert, update on public.call_sessions to authenticated;
do $$ begin alter publication supabase_realtime add table public.call_sessions; exception when duplicate_object then null; end $$;


-- Privacy hardening applied to the live project on 2026-11-27.
-- Keep membership authorization helper outside the exposed public API schema.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_conversation_member(target_conversation_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = target_conversation_id
      and cm.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_conversation_member(uuid) from public, anon;
grant execute on function private.is_conversation_member(uuid) to authenticated;

drop policy if exists "Members can view conversations" on public.conversations;
create policy "Members can view conversations" on public.conversations
  for select to authenticated using (private.is_conversation_member(id));
drop policy if exists "Members can view conversation membership" on public.conversation_members;
create policy "Members can view conversation membership" on public.conversation_members
  for select to authenticated using (private.is_conversation_member(conversation_id));
drop policy if exists "Members can read messages" on public.messages;
create policy "Members can read messages" on public.messages
  for select to authenticated using (private.is_conversation_member(conversation_id));
drop policy if exists "Members can send messages as themselves" on public.messages;
create policy "Members can send messages as themselves" on public.messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and private.is_conversation_member(conversation_id)
  );

-- Trigger-only function must not be exposed as an RPC.
revoke all on function public.handle_new_rivox_user() from public, anon, authenticated;
revoke all on function public.is_conversation_member(uuid) from public, anon, authenticated;

-- Prevent call participants from changing immutable identities or forging
-- signaling fields/status transitions belonging to the other participant.
create or replace function private.guard_call_session_update()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null or (actor <> old.caller_id and actor <> old.callee_id) then
    raise exception 'Not a call participant';
  end if;
  if new.id is distinct from old.id
     or new.conversation_id is distinct from old.conversation_id
     or new.caller_id is distinct from old.caller_id
     or new.callee_id is distinct from old.callee_id
     or new.call_type is distinct from old.call_type
     or new.created_at is distinct from old.created_at then
    raise exception 'Call participants and call identity are immutable';
  end if;
  if actor = old.caller_id then
    if new.answer is distinct from old.answer then
      raise exception 'Only the callee may submit the call answer';
    end if;
    if new.status not in (old.status, 'ended', 'missed') then
      raise exception 'Caller cannot set this call status';
    end if;
  else
    if new.offer is distinct from old.offer then
      raise exception 'Only the caller may submit the call offer';
    end if;
    if new.status not in (old.status, 'accepted', 'rejected', 'ended') then
      raise exception 'Callee cannot set this call status';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.guard_call_session_update() from public, anon, authenticated;
drop trigger if exists guard_call_session_update on public.call_sessions;
create trigger guard_call_session_update
  before update on public.call_sessions
  for each row execute function private.guard_call_session_update();


-- RIVOX owner roles, VIP, profile fields and server-checked controls.
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists is_vip boolean not null default false;
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists country_code text;
alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('user','admin','owner'));
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check check(account_status in ('active','suspended'));

create or replace function public.handle_new_rivox_user()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.profiles(id,rivox_id,display_name,role,phone,country_code)
 values(new.id,upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),coalesce(new.raw_user_meta_data->>'display_name',''),
 case when lower(coalesce(new.email,''))='galfar.ranaahmmed@gmail.com' then 'owner' else 'user' end,new.phone,new.raw_user_meta_data->>'country_code');
 return new;
end; $$;
revoke all on function public.handle_new_rivox_user() from public,anon,authenticated;

create or replace function private.is_rivox_owner()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='owner'); $$;
revoke all on function private.is_rivox_owner() from public,anon;
grant execute on function private.is_rivox_owner() to authenticated;

create or replace function private.guard_profile_privileged_fields()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare actor uuid := (select auth.uid()); actor_role text;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 select p.role into actor_role from public.profiles p where p.id=actor;
 if new.role is distinct from old.role or new.is_vip is distinct from old.is_vip or new.account_status is distinct from old.account_status then
  if actor_role <> 'owner' then raise exception 'Owner access required'; end if;
  if old.role='owner' and new.role<>'owner' then raise exception 'Primary owner cannot be demoted'; end if;
 end if;
 if actor<>old.id and actor_role<>'owner' then raise exception 'Own profile only'; end if;
 return new;
end; $$;
revoke all on function private.guard_profile_privileged_fields() from public,anon,authenticated;
drop trigger if exists guard_profile_privileged_fields on public.profiles;
create trigger guard_profile_privileged_fields before update on public.profiles for each row execute function private.guard_profile_privileged_fields();

create or replace function private.owner_set_user_controls(target_user uuid,make_vip boolean default null,new_status text default null,new_role text default null)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not private.is_rivox_owner() then raise exception 'Owner access required'; end if;
 if new_role is not null and new_role not in ('user','admin') then raise exception 'Invalid role'; end if;
 if new_status is not null and new_status not in ('active','suspended') then raise exception 'Invalid status'; end if;
 if exists(select 1 from public.profiles where id=target_user and role='owner') then raise exception 'Cannot control primary owner'; end if;
 update public.profiles set is_vip=coalesce(make_vip,is_vip),account_status=coalesce(new_status,account_status),role=coalesce(new_role,role),updated_at=now() where id=target_user;
 if not found then raise exception 'User not found'; end if;
end; $$;
revoke all on function private.owner_set_user_controls(uuid,boolean,text,text) from public,anon;
grant execute on function private.owner_set_user_controls(uuid,boolean,text,text) to authenticated;
create or replace function public.owner_set_user_controls(target_user uuid,make_vip boolean default null,new_status text default null,new_role text default null)
returns void language sql security invoker set search_path='' as $$ select private.owner_set_user_controls(target_user,make_vip,new_status,new_role); $$;
revoke all on function public.owner_set_user_controls(uuid,boolean,text,text) from public,anon;
grant execute on function public.owner_set_user_controls(uuid,boolean,text,text) to authenticated;

create or replace function private.owner_dashboard_stats()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare result jsonb;
begin
 if not private.is_rivox_owner() then raise exception 'Owner access required'; end if;
 select jsonb_build_object('total_users',count(*),'vip_users',count(*) filter(where is_vip),'admins',count(*) filter(where role='admin'),'suspended_users',count(*) filter(where account_status='suspended'),'new_today',count(*) filter(where created_at>=date_trunc('day',now()))) into result from public.profiles;
 return result;
end; $$;
revoke all on function private.owner_dashboard_stats() from public,anon;
grant execute on function private.owner_dashboard_stats() to authenticated;
create or replace function public.owner_dashboard_stats()
returns jsonb language sql security invoker set search_path='' as $$ select private.owner_dashboard_stats(); $$;
revoke all on function public.owner_dashboard_stats() from public,anon;
grant execute on function public.owner_dashboard_stats() to authenticated;

drop policy if exists "Authenticated users can view profiles" on public.profiles;
drop policy if exists "Users can view active profiles" on public.profiles;
create policy "Users can view active profiles" on public.profiles for select to authenticated using(account_status='active' or id=(select auth.uid()) or private.is_rivox_owner());
drop policy if exists "Members can send messages as themselves" on public.messages;
drop policy if exists "Suspended users cannot send messages" on public.messages;
create policy "Active members can send messages" on public.messages for insert to authenticated with check(sender_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active') and private.is_conversation_member(conversation_id));

-- Suspend accounts at the data-access layer, not just in the UI.
create or replace function private.is_active_rivox_user()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active'); $$;
revoke all on function private.is_active_rivox_user() from public,anon;
grant execute on function private.is_active_rivox_user() to authenticated;

drop policy if exists "Members can view conversations" on public.conversations;
create policy "Members can view conversations" on public.conversations for select to authenticated using(private.is_active_rivox_user() and private.is_conversation_member(id));
drop policy if exists "Users can create conversations" on public.conversations;
create policy "Users can create conversations" on public.conversations for insert to authenticated with check(private.is_active_rivox_user() and (select auth.uid())=created_by);
drop policy if exists "Members can view conversation membership" on public.conversation_members;
create policy "Members can view conversation membership" on public.conversation_members for select to authenticated using(private.is_active_rivox_user() and private.is_conversation_member(conversation_id));
drop policy if exists "Conversation creator can add members" on public.conversation_members;
create policy "Conversation creator can add members" on public.conversation_members for insert to authenticated with check(private.is_active_rivox_user() and exists(select 1 from public.conversations c where c.id=conversation_id and c.created_by=(select auth.uid())));
drop policy if exists "Members can read messages" on public.messages;
create policy "Members can read messages" on public.messages for select to authenticated using(private.is_active_rivox_user() and private.is_conversation_member(conversation_id));
drop policy if exists "Members can send messages as themselves" on public.messages;
drop policy if exists "Suspended users cannot send messages" on public.messages;
drop policy if exists "Active members can send messages" on public.messages;
create policy "Active members can send messages" on public.messages for insert to authenticated with check(private.is_active_rivox_user() and sender_id=(select auth.uid()) and private.is_conversation_member(conversation_id));
drop policy if exists "Call participants can view their calls" on public.call_sessions;
create policy "Call participants can view their calls" on public.call_sessions for select to authenticated using(private.is_active_rivox_user() and (caller_id=(select auth.uid()) or callee_id=(select auth.uid())));
drop policy if exists "Conversation members can start calls" on public.call_sessions;
create policy "Conversation members can start calls" on public.call_sessions for insert to authenticated with check(private.is_active_rivox_user() and caller_id=(select auth.uid()) and exists(select 1 from public.conversation_members cm where cm.conversation_id=call_sessions.conversation_id and cm.user_id=(select auth.uid())) and exists(select 1 from public.conversation_members cm where cm.conversation_id=call_sessions.conversation_id and cm.user_id=callee_id));
drop policy if exists "Call participants can update call signaling" on public.call_sessions;
create policy "Call participants can update call signaling" on public.call_sessions for update to authenticated using(private.is_active_rivox_user() and (caller_id=(select auth.uid()) or callee_id=(select auth.uid()))) with check(private.is_active_rivox_user() and (caller_id=(select auth.uid()) or callee_id=(select auth.uid())));
