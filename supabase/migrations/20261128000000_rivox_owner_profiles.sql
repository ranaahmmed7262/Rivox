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
