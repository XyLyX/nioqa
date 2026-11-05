begin;
do $test$
declare
  host uuid := gen_random_uuid();
  guest uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  host_session uuid := gen_random_uuid();
  guest_session uuid := gen_random_uuid();
  stranger_session uuid := gen_random_uuid();
  venue uuid := gen_random_uuid();
  private_venue uuid := gen_random_uuid();
  ping uuid;
  request uuid;
  host_claims text;
  guest_claims text;
  stranger_claims text;
begin
  insert into auth.users (id) values (host), (guest), (stranger);
  insert into auth.sessions (id, user_id)
    values (host_session, host), (guest_session, guest), (stranger_session, stranger);
  insert into public.venues (id, provider, provider_place_id, name, latitude, longitude, public_verified)
    values (venue, 'test', venue::text, 'Public venue', 0, 0, true),
           (private_venue, 'test', private_venue::text, 'Unverified venue', 0, 0, false);
  host_claims := jsonb_build_object('sub', host, 'session_id', host_session)::text;
  guest_claims := jsonb_build_object('sub', guest, 'session_id', guest_session)::text;
  stranger_claims := jsonb_build_object('sub', stranger, 'session_id', stranger_session)::text;

  set local role anon;
  begin
    perform public.nioqa_operation('discover');
    raise exception 'Anonymous role could execute operation';
  exception when insufficient_privilege then null;
  end;
  set local role authenticated;
  perform set_config('request.jwt.claims', stranger_claims, true);
  perform public.nioqa_operation('profile', body => 'Stranger');
  begin
    perform public.nioqa_operation('create', venue, 'Meet at the venue', now());
    raise exception 'Account without age declaration could create Ping';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set adult_declared_at = now() + interval '1 day';
    raise exception 'Client could write age declaration directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.chat_messages;
    raise exception 'Client could read raw chat rows';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', guest_claims, true);
  perform public.nioqa_operation('profile', body => 'Guest');
  perform public.nioqa_operation('declare_adult', body => 'I confirm I am 18 or older');
  perform set_config('request.jwt.claims', host_claims, true);
  perform public.nioqa_operation('profile', body => 'Host');
  begin
    perform public.nioqa_operation('declare_adult');
    raise exception 'Missing declaration was accepted';
  exception when invalid_parameter_value then null;
  end;
  perform public.nioqa_operation('declare_adult', body => 'I confirm I am 18 or older');
  begin
    perform public.nioqa_operation('create', private_venue, 'Meet at the venue', now());
    raise exception 'Unverified venue was accepted';
  exception when insufficient_privilege then null;
  end;
  ping := (public.nioqa_operation('create', venue, 'Meet at the venue', now())->>'id')::uuid;
  if ping is null then raise exception 'Ping was not created'; end if;

  perform set_config('request.jwt.claims', guest_claims, true);
  if not (public.nioqa_operation('discover') @> jsonb_build_array(jsonb_build_object('id', ping))) then
    raise exception 'Eligible guest could not discover Ping';
  end if;
  request := (public.nioqa_operation('join', ping)->>'id')::uuid;
  if request is null or request is distinct from (public.nioqa_operation('join', ping)->>'id')::uuid then
    raise exception 'Join retry was not idempotent';
  end if;
  begin
    perform public.nioqa_operation('approve', request);
    raise exception 'Guest approved own request';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.nioqa_operation('send', request, 'Too early');
    raise exception 'Pending request could send chat';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', host_claims, true);
  perform public.nioqa_operation('approve', request);
  perform public.nioqa_operation('send', request, 'See you there');
  perform set_config('request.jwt.claims', guest_claims, true);
  if public.nioqa_operation('messages', request) #>> '{0,body}' is distinct from 'See you there' then
    raise exception 'Approved guest could not read chat';
  end if;

  perform set_config('request.jwt.claims', stranger_claims, true);
  begin
    perform public.nioqa_operation('messages', request);
    raise exception 'Outsider read chat';
  exception when insufficient_privilege then null;
  end;

  reset role;
  update public.venues set public_verified = false where id = venue;
  set local role authenticated;
  perform set_config('request.jwt.claims', guest_claims, true);
  begin
    perform public.nioqa_operation('messages', request);
    raise exception 'Venue revocation failed to close chat';
  exception when insufficient_privilege then null;
  end;

  reset role;
  update public.venues set public_verified = true where id = venue;
  update public.pings set starts_at = now() - interval '1 hour' where id = ping;
  set local role authenticated;
  begin
    perform public.nioqa_operation('messages', request);
    raise exception 'Expired chat could be read';
  exception when insufficient_privilege then null;
  end;
  if public.nioqa_operation('report_participant', request, 'Test safety report')->>'id' is null then
    raise exception 'Participant could not report after expiry';
  end if;

  reset role;
  update public.pings set starts_at = now() where id = ping;
  set local role authenticated;
  perform public.nioqa_operation('block', request);
  perform set_config('request.jwt.claims', host_claims, true);
  begin
    perform public.nioqa_operation('send', request, 'Blocked');
    raise exception 'Blocked host could still send chat';
  exception when insufficient_privilege then null;
  end;

  reset role;
  delete from auth.sessions where id = host_session;
  set local role authenticated;
  begin
    perform public.nioqa_operation('venues');
    raise exception 'Revoked session still authorized';
  exception when insufficient_privilege then null;
  end;
  reset role;
end;
$test$;
rollback;
select 'NIOQA authorization checks passed' as result;
