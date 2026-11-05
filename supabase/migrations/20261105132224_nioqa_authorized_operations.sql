create schema nioqa_private;
revoke all on schema nioqa_private from public;
grant usage on schema nioqa_private to authenticated;

alter table public.profiles add column adult_verified_until timestamptz,
  add column identity_verified_until timestamptz;

revoke all on public.profiles, public.venues, public.pings, public.join_requests,
  public.chat_messages, public.user_blocks, public.reports from public, anon, authenticated;

create index nioqa_pings_starts_at on public.pings (starts_at) where status = 'published';
create index nioqa_chat_thread_time on public.chat_messages (join_request_id, created_at, id);

create function nioqa_private.blocked(a uuid, b uuid) returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id, blocked_id) in ((a, b), (b, a))
  );
$$;
revoke all on function nioqa_private.blocked(uuid, uuid) from public, anon, authenticated;

create function nioqa_private.run_operation(action text, target uuid, body text, start_time timestamptz)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_time_at_call timestamptz := statement_timestamp();
  ping public.pings;
  request public.join_requests;
  counterpart uuid;
  result_id uuid;
  response jsonb;
  eligible boolean;
begin
  if actor is null or coalesce(auth.jwt()->>'is_anonymous', 'false') <> 'false'
    or not exists (
      select 1 from auth.sessions s
      where s.id = nullif(auth.jwt()->>'session_id', '')::uuid and s.user_id = actor
        and (s.not_after is null or s.not_after > current_time_at_call)
    ) then
    raise exception 'Sign-in required' using errcode = '42501';
  end if;

  body := regexp_replace(body, '^[[:space:]]+|[[:space:]]+$', '', 'g');

  if action = 'profile' then
    if body is null or char_length(body) not between 2 and 80 then
      raise exception 'Invalid display name' using errcode = '22023';
    end if;
    insert into public.profiles (user_id, display_name) values (actor, body)
      on conflict (user_id) do update set display_name = excluded.display_name;
    return jsonb_build_object('user_id', actor);
  end if;

  if action in ('join', 'report_ping', 'block_host') then
    select * into ping from public.pings where id = target for share;
    counterpart := ping.host_id;
  elsif action in ('approve', 'decline', 'send', 'messages', 'report_participant', 'block') then
    select * into request from public.join_requests where id = target for update;
    select * into ping from public.pings where id = request.ping_id for share;
    if actor = ping.host_id then
      counterpart := request.requester_id;
    elsif actor = request.requester_id and action not in ('approve', 'decline') then
      counterpart := ping.host_id;
    end if;
  elsif action not in ('create', 'discover', 'venues', 'requests', 'cancel') or action is null then
    raise exception 'Unknown action' using errcode = '22023';
  end if;

  if action in ('join', 'report_ping', 'approve', 'decline', 'send', 'messages', 'report_participant', 'block', 'block_host')
    and (counterpart is null or counterpart = actor) then
    raise exception 'Unavailable' using errcode = '42501';
  end if;

  if counterpart is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      least(actor, counterpart)::text || greatest(actor, counterpart)::text, 0));
  end if;

  perform 1 from public.profiles where user_id in (actor, counterpart)
    order by user_id for share;

  if action = 'block' then
    insert into public.user_blocks (blocker_id, blocked_id) values (actor, counterpart)
      on conflict do nothing;
    return '{}'::jsonb;
  end if;

  if action = 'cancel' then
    update public.pings set status = 'cancelled' where id = target and host_id = actor
      returning id into result_id;
    if result_id is null then
      raise exception 'Unavailable' using errcode = '42501';
    end if;
    return jsonb_build_object('id', result_id);
  end if;

  if action = 'report_participant' then
    if request.status <> 'approved' then
      raise exception 'Unavailable' using errcode = '42501';
    end if;
    insert into public.reports (reporter_id, ping_id, reported_user_id, reason)
      values (actor, ping.id, counterpart, body) returning id into result_id;
    return jsonb_build_object('id', result_id);
  end if;

  current_time_at_call := clock_timestamp();
  select count(*) = case when counterpart is null then 1 else 2 end into eligible
    from public.profiles
    where user_id in (actor, counterpart) and verification_status = 'verified'
      and adult_verified_until > current_time_at_call and identity_verified_until > current_time_at_call;
  if not eligible or (counterpart is not null and nioqa_private.blocked(actor, counterpart)) then
    raise exception 'Unavailable' using errcode = '42501';
  end if;

  if action = 'venues' then
    select jsonb_agg(to_jsonb(v)) into response from (
      select id, name, latitude, longitude from public.venues
      where public_verified order by name, id limit 100
    ) v;
    return coalesce(response, '[]'::jsonb);
  end if;

  if action = 'create' then
    if start_time is null or start_time < current_time_at_call - interval '1 minute'
      or start_time > current_time_at_call + interval '48 hours' then
      raise exception 'Invalid start time' using errcode = '22023';
    end if;
    perform 1 from public.venues where id = target and public_verified for share;
    if not found then
      raise exception 'Verified public venue required' using errcode = '42501';
    end if;
    insert into public.pings (host_id, venue_id, body, starts_at, status)
      values (actor, target, body, start_time, 'published') returning id into result_id;
    return jsonb_build_object('id', result_id);
  end if;

  if action = 'discover' then
    select jsonb_agg(to_jsonb(p) order by p.starts_at, p.id) into response from (
      select item.id, item.venue_id, v.name as venue_name, item.body, item.starts_at,
        item.starts_at + interval '1 hour' as ends_at, host.display_name as host_name
      from public.pings item
      join public.venues v on v.id = item.venue_id and v.public_verified
      join public.profiles host on host.user_id = item.host_id
      where item.status = 'published' and item.starts_at > current_time_at_call - interval '1 hour'
        and host.verification_status = 'verified'
        and host.adult_verified_until > current_time_at_call
        and host.identity_verified_until > current_time_at_call
        and not nioqa_private.blocked(actor, item.host_id)
      order by item.starts_at, item.id limit 100
    ) p;
    return coalesce(response, '[]'::jsonb);
  end if;

  if action = 'requests' then
    select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc) into response from (
      select j.id, j.ping_id, j.status, j.created_at, other.display_name,
        case when p.host_id = actor then 'host' else 'guest' end as participant_role
      from public.join_requests j
      join public.pings p on p.id = j.ping_id
      join public.venues v on v.id = p.venue_id and v.public_verified
      join public.profiles other on other.user_id =
        case when p.host_id = actor then j.requester_id else p.host_id end
      where (p.host_id = actor or j.requester_id = actor)
        and (target is null or p.id = target)
        and p.status = 'published' and p.starts_at > current_time_at_call - interval '1 hour'
        and other.verification_status = 'verified'
        and other.adult_verified_until > current_time_at_call
        and other.identity_verified_until > current_time_at_call
        and not nioqa_private.blocked(actor, other.user_id)
      order by j.created_at desc, j.id desc limit 100
    ) r;
    return coalesce(response, '[]'::jsonb);
  end if;

  perform 1 from public.venues where id = ping.venue_id and public_verified for share;
  if not found or ping.status <> 'published'
    or ping.starts_at <= current_time_at_call - interval '1 hour' then
    raise exception 'Unavailable' using errcode = '42501';
  end if;

  if action = 'block_host' then
    insert into public.user_blocks (blocker_id, blocked_id) values (actor, counterpart)
      on conflict do nothing;
    return '{}'::jsonb;
  elsif action = 'report_ping' then
    insert into public.reports (reporter_id, ping_id, reported_user_id, reason)
      values (actor, ping.id, counterpart, body) returning id into result_id;
  elsif action = 'join' then
    select id into result_id from public.join_requests
      where join_requests.ping_id = ping.id and requester_id = actor;
    if result_id is null then
      insert into public.join_requests (ping_id, requester_id)
        values (ping.id, actor) returning id into result_id;
    end if;
  elsif action in ('approve', 'decline') then
    if request.status <> 'pending' and request.status <> (action || 'd') then
      raise exception 'Request already decided' using errcode = '42501';
    end if;
    update public.join_requests set status = action || 'd' where id = request.id
      returning id into result_id;
  else
    if request.status <> 'approved' then
      raise exception 'Unavailable' using errcode = '42501';
    end if;
    if action = 'messages' then
      select jsonb_agg(to_jsonb(m) order by m.created_at, m.id) into response from (
        select id, sender_id = actor as mine, chat.body, created_at from public.chat_messages chat
        where join_request_id = request.id order by created_at desc, id desc limit 100
      ) m;
      return coalesce(response, '[]'::jsonb);
    end if;
    insert into public.chat_messages (join_request_id, sender_id, body)
      values (request.id, actor, body) returning id into result_id;
  end if;
  return jsonb_build_object('id', result_id);
end;
$$;
revoke all on function nioqa_private.run_operation(text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function nioqa_private.run_operation(text, uuid, text, timestamptz) to authenticated;

create function public.nioqa_operation(action text, target uuid default null,
  body text default null, start_time timestamptz default null)
returns jsonb language sql security invoker set search_path = ''
as $$
  select nioqa_private.run_operation(action, target, body, start_time);
$$;
revoke all on function public.nioqa_operation(text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.nioqa_operation(text, uuid, text, timestamptz) to authenticated;
