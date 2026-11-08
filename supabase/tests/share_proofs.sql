-- Local disposable-database contract test for 20261215070000_share_proofs. Every change rolls back.
\set ON_ERROR_STOP on
begin;

do $$
declare fp record; other record; r jsonb; v_id uuid;
begin
  if has_table_privilege('anon', 'public.fan_share_proofs', 'SELECT') or has_table_privilege('authenticated', 'public.fan_share_proofs', 'SELECT')
   or has_table_privilege('service_role', 'public.fan_share_proofs', 'SELECT')
   or has_function_privilege('anon', 'public.submit_fan_share_proof(uuid,uuid,text,text,text)', 'EXECUTE')
   or has_function_privilege('authenticated', 'public.list_fan_share_proofs(uuid,uuid)', 'EXECUTE')
   or has_function_privilege('service_role', 'public.scrub_fan_share_proofs_on_deletion()', 'EXECUTE')
   or not has_function_privilege('service_role', 'public.submit_fan_share_proof(uuid,uuid,text,text,text)', 'EXECUTE') then
    raise exception 'Share proofs exposed or not callable by the server';
  end if;

  select p.app_user_id, p.celebrity_id into fp from public.fan_passports p join public.app_users u on u.id = p.app_user_id and u.status = 'active' order by p.issued_at desc limit 1;
  select u.id, p.celebrity_id into other from public.app_users u join public.fan_passports p on p.app_user_id = u.id where u.status = 'active' and u.id <> fp.app_user_id and p.celebrity_id = fp.celebrity_id limit 1;
  if fp.app_user_id is null or other.id is null then raise exception 'Fixture: two active passport holders of one creator'; end if;

  r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'x', 'https://x.com/fan/status/99', 'x:contract-99');
  v_id := (r->>'id')::uuid;
  if (r->>'replayed')::boolean then raise exception 'First proof replayed'; end if;
  -- Same fan again: the first answer with the (still unrecorded) points.
  r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'x', 'https://x.com/fan/status/99?s=1', 'x:contract-99');
  if not (r->>'replayed')::boolean or (r->>'id')::uuid <> v_id or r ? 'points' and r->'points' <> 'null'::jsonb then raise exception 'Replay wrong: %', r; end if;
  -- Another fan, same post: refused.
  begin
    perform public.submit_fan_share_proof(other.id, fp.celebrity_id, 'x', 'https://x.com/fan/status/99', 'x:contract-99');
    raise exception 'Another fan reused the post';
  exception when others then if sqlerrm <> 'SHARE_PROOF_URL_USED' then raise; end if; end;
  -- No passport for that creator: refused.
  begin
    perform public.submit_fan_share_proof(fp.app_user_id, (select id from public.celebrities c where not exists (select 1 from public.fan_passports p where p.app_user_id = fp.app_user_id and p.celebrity_id = c.id) limit 1), 'x', 'https://x.com/fan/status/98', 'x:contract-98');
    raise exception 'Proof without a passport';
  exception when others then if sqlerrm <> 'PASSPORT_REQUIRED' then raise; end if; end;

  -- Points: only the owner's row; then the replay reports them and the list shows them.
  perform public.set_fan_share_proof_points(other.id, v_id, 99);
  perform public.set_fan_share_proof_points(fp.app_user_id, v_id, 10);
  r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'x', 'https://x.com/fan/status/99', 'x:contract-99');
  if (r->>'points')::integer <> 10 then raise exception 'Points not kept: %', r; end if;
  r := public.list_fan_share_proofs(fp.app_user_id, fp.celebrity_id);
  if r->'items'->0->>'id' <> v_id::text or (r->'items'->0->>'points')::integer <> 10 or r->'items'->0->>'platform' <> 'x' then raise exception 'List wrong: %', r; end if;
  if jsonb_array_length(public.list_fan_share_proofs(other.id, fp.celebrity_id)->'items') <> (select count(*) from public.fan_share_proofs where app_user_id = other.id and celebrity_id = fp.celebrity_id and status = 'accepted') then
    raise exception 'Another fan sees proofs that are not theirs';
  end if;
  -- Hidden rows leave the list.
  update public.fan_share_proofs set status = 'hidden' where id = v_id;
  if public.list_fan_share_proofs(fp.app_user_id, fp.celebrity_id)->'items' @> jsonb_build_array(jsonb_build_object('id', v_id)) then raise exception 'Hidden proof listed'; end if;
  -- A non-https address never lands.
  begin
    perform public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'x', 'http://x.com/fan/status/97', 'x:contract-97');
    raise exception 'http stored';
  exception when check_violation then null; end;
  raise notice 'share_proofs contract ok';
end $$;

rollback;
