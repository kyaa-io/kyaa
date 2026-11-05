-- PASSPORT-RENEWAL P3 (3/3): "인증했어요" board (public proof posts), no-points guard for proof posts, private-proof retention
-- (D11), and the function/table rights of all P3 objects (P1 42501 lesson, same method as 20261210137000).
-- 20261210230000_room_stage_gate.sql is intentionally absent: 135000 (room_entry_stage) and 138000 (room_gate_callers) already cover contract 3.8.

alter table public.fan_posts
  add column category text not null default 'general',
  add column source_type text,
  add column source_id uuid,
  add constraint fan_posts_category_check check (category in ('general','proof')),
  add constraint fan_posts_proof_source_check check (
    (category = 'proof') = coalesce(source_type = 'certification_submission' and source_id is not null, false)
    and (source_type is null or source_type = 'certification_submission')
    and ((source_type is null) = (source_id is null)));
create unique index fan_posts_source_key on public.fan_posts(source_type, source_id) where source_type is not null;
create index fan_posts_proof_board on public.fan_posts(celebrity_id, created_at desc, id desc)
  where category = 'proof' and deleted_at is null and hidden_at is null;

-- A proof post never earns a 'post' point or stamp: the point rows are written by record_dukjil_action, so the guard sits on its log.
create function public.dukjil_block_proof_post_points() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.action_key = 'post' and new.source_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and exists (select 1 from public.fan_posts p where p.id = new.source_key::uuid and p.category = 'proof') then
    raise exception 'PROOF_POST_NO_POINTS' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger dukjil_action_log_proof_post_guard before insert on public.dukjil_action_log
  for each row execute function public.dukjil_block_proof_post_points();
revoke all on function public.dukjil_block_proof_post_points() from public, anon, authenticated, service_role;

-- Public board (plan 7): proof-type badge / masked image / one-liner / "n-th jjinfan" badge. Only approved submissions with publish consent;
-- a deleted/hidden post, a withdrawn consent or a non-approved row never appears. The author id is not returned.
-- imageObjectPath is the member's uploaded (already masked) image of the latest upload for that submission; the API signs it. A consent
-- proof is never a retention-deletion target (list_private_proofs_due_for_deletion reads publish_consent = false only).
-- jjinfanRank counts titles of the creator in achieved_at order (ties by user id); null while the author's title is revoked.
create function public.read_proof_board(p_celebrity uuid, p_limit integer default 20, p_before timestamptz default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with page as (
    select p.id as post_id, p.app_user_id, p.body, p.created_at, s.id as submission_id, s.proof_type, s.amount_visible
      from public.fan_posts p
      join public.certification_submissions s on s.id = p.source_id and p.source_type = 'certification_submission'
     where p.celebrity_id = p_celebrity and p.category = 'proof' and p.visibility = 'public'
       and p.deleted_at is null and p.hidden_at is null
       and s.status = 'approved' and s.publish_consent = true and s.proof_type is not null
       and (p_before is null or p.created_at < p_before)
     order by p.created_at desc, p.id desc
     limit least(greatest(coalesce(p_limit, 20), 1), 50))
  select coalesce(jsonb_agg(jsonb_build_object('postId', g.post_id, 'body', g.body, 'createdAt', g.created_at,
    'submissionId', g.submission_id, 'proofType', g.proof_type, 'amountVisible', g.amount_visible,
    'imageObjectPath', g.image_path, 'jjinfanRank', g.rank) order by g.created_at desc, g.post_id desc), '[]'::jsonb)
  from (
    select pg.*,
      (select u.object_path from public.certification_uploads u where u.consumed_submission_id = pg.submission_id and u.purged_at is null
        order by u.created_at desc, u.id desc limit 1) as image_path,
      (select (select count(*) from public.jjinfan_titles t2 where t2.celebrity_id = t.celebrity_id
                and (t2.achieved_at, t2.app_user_id) <= (t.achieved_at, t.app_user_id))::integer
         from public.jjinfan_titles t where t.app_user_id = pg.app_user_id and t.celebrity_id = p_celebrity and t.revoked_at is null) as rank
    from page pg) g
$$;

-- The member's own submissions for one creator (never another member's): status, reviewer reason only when a decision asked for it.
create function public.list_my_certification_proofs(p_user uuid, p_celebrity uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'submissionId', s.id, 'proofType', s.proof_type, 'status', s.status, 'revision', s.review_revision,
    'reason', case when s.status in ('changes_requested', 'rejected') then s.rejection_reason end,
    'publishConsent', s.publish_consent, 'amountVisible', s.amount_visible, 'submittedAt', s.submitted_at, 'reviewedAt', s.reviewed_at)
    order by s.submitted_at desc, s.id desc), '[]'::jsonb)
  from public.certification_submissions s
  where s.app_user_id = p_user and s.celebrity_id = p_celebrity and s.proof_type is not null
$$;

-- D11 (dev draft, legal confirmation required before production): private proofs are deleted p_days after review.
-- The day count is read from the active dukjil policy (rules.proofRetentionDays = 90). The API deletes the storage object, then marks the upload.
create function public.list_private_proofs_due_for_deletion(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare pol public.dukjil_policy_versions; days integer;
begin
  pol := public.dukjil_active_policy();
  days := nullif(pol.rules ->> 'proofRetentionDays', '')::integer;
  if pol.version is null or days is null or days < 1 then raise exception 'POLICY_INACTIVE' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('uploadId', x.id, 'objectPath', x.object_path, 'submissionId', x.sid, 'reviewedAt', x.reviewed_at)
      order by x.reviewed_at, x.id)
    from (select u.id, u.object_path, s.id as sid, s.reviewed_at from public.certification_uploads u
      join public.certification_submissions s on s.id = u.consumed_submission_id
     where s.proof_type is not null and s.publish_consent = false and s.status in ('approved','rejected')
       and s.reviewed_at <= pg_catalog.now() - make_interval(days => days) and u.purged_at is null
     order by s.reviewed_at, u.id limit least(greatest(coalesce(p_limit, 100), 1), 500)) x), '[]'::jsonb);
end $$;

create function public.mark_proof_upload_purged(p_upload_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.certification_uploads u set purged_at = pg_catalog.now()
    where u.id = p_upload_id and u.purged_at is null
      and exists (select 1 from public.certification_submissions s where s.id = u.consumed_submission_id
        and s.proof_type is not null and s.publish_consent = false and s.status in ('approved','rejected'));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'UPLOAD_NOT_PURGEABLE' using errcode = 'P0001'; end if;
  return jsonb_build_object('uploadId', p_upload_id, 'purged', true);
end $$;

-- Reviewer queue (admin only): one jsonb array, newest first. A submission flagged for personal data at upload is refused (PROOF_PII_DETECTED) and never stored, so the queue has no such field.
-- duplicateOf lists other proof submissions that share an image hash. uploadIds are the not-yet-purged images; the API turns them into short-lived admin-only links.
create function public.get_admin_proof_queue(p_actor uuid, p_status text default 'pending')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_allow uuid;
begin
  if p_actor is null then raise exception 'ADMIN_REQUIRED' using errcode = 'P0001'; end if;
  select a.id into v_allow from public.admin_allowlist a
    join public.app_users u on u.id = p_actor and u.status = 'active' and u.verified_email = a.email
    where a.active limit 1;
  if v_allow is null then raise exception 'ADMIN_REQUIRED' using errcode = 'P0001'; end if;
  if p_status is null or p_status not in ('pending','in_review','approved','rejected','changes_requested') then
    raise exception 'PROOF_INVALID' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'status', s.status, 'revision', s.review_revision, 'createdAt', s.submitted_at,
      'proofType', s.proof_type, 'publishConsent', s.publish_consent, 'amountVisible', coalesce(s.amount_visible, false),
      'applicantName', coalesce(nullif(btrim(pr.nickname), ''), 'Fan'),
      'creatorName', (select l.name from public.celebrity_localizations l where l.celebrity_id = s.celebrity_id order by (l.locale = 'ko') desc, l.locale limit 1),
      'duplicateOf', coalesce((select jsonb_agg(d.id order by d.submitted_at, d.id) from public.certification_submissions d
         where d.id <> s.id and d.proof_type is not null and d.image_phash && s.image_phash), '[]'::jsonb),
      'rejectionReason', s.rejection_reason,
      'uploadIds', coalesce((select jsonb_agg(u.id order by u.created_at, u.id) from public.certification_uploads u
         where u.consumed_submission_id = s.id and u.purged_at is null), '[]'::jsonb),
      'postBody', s.post_body) order by s.submitted_at desc, s.id desc)
    from public.certification_submissions s
    left join public.user_profiles pr on pr.app_user_id = s.app_user_id
    where s.proof_type is not null and s.status::text = p_status), '[]'::jsonb);
end $$;

revoke all on function public.read_proof_board(uuid, integer, timestamptz), public.list_my_certification_proofs(uuid, uuid), public.list_private_proofs_due_for_deletion(integer),
  public.mark_proof_upload_purged(uuid), public.get_admin_proof_queue(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.read_proof_board(uuid, integer, timestamptz), public.list_my_certification_proofs(uuid, uuid), public.list_private_proofs_due_for_deletion(integer),
  public.mark_proof_upload_purged(uuid), public.get_admin_proof_queue(uuid, text) to service_role;

-- Proof missions through the existing admin mission path: v3 is v2 (draft create/edit with the reward revision and audit log) plus proof_type and the optional
-- proof_platform in the same transaction. Membership missions keep their own platform column and cannot also carry a proof type.
create function public.save_admin_certification_mission_v3(
  p_actor uuid,p_allowlist uuid,p_correlation uuid,p_mission_id uuid,p_celebrity_id uuid,p_immutable_key text,
  p_expected_revision bigint,p_category text,p_title_ko text,p_title_en text,p_description_ko text,p_description_en text,
  p_instructions_ko text,p_instructions_en text,p_opens_at timestamptz,p_closes_at timestamptz,p_score_points smallint,p_ticket_amount bigint,
  p_membership_platform public.social_platform default null,p_proof_type text default null,p_proof_platform text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_platform text := nullif(btrim(p_proof_platform), '');
begin
  perform public.assert_certification_admin(p_actor,p_allowlist);
  if p_proof_type is not null and p_proof_type not in ('membership','purchase','receipt','ticket','donation','funding','kyaa_payment') then
    raise exception 'PROOF_INVALID' using errcode = 'P0001'; end if;
  if v_platform is not null and (p_proof_type is null or length(v_platform) > 60) then raise exception 'PROOF_INVALID' using errcode = 'P0001'; end if;
  if p_proof_type is not null and p_membership_platform is not null then raise exception 'PROOF_INVALID' using errcode = 'P0001'; end if;
  v_result := public.save_admin_certification_mission_v2(p_actor,p_allowlist,p_correlation,p_mission_id,p_celebrity_id,p_immutable_key,p_expected_revision,
    p_category,p_title_ko,p_title_en,p_description_ko,p_description_en,p_instructions_ko,p_instructions_en,p_opens_at,p_closes_at,p_score_points,p_ticket_amount,p_membership_platform);
  update public.certification_missions set proof_type = p_proof_type, proof_platform = v_platform where id = (v_result->>'id')::uuid;
  return v_result || jsonb_build_object('proofType', p_proof_type, 'proofPlatform', v_platform);
end $$;

alter function public.get_admin_certification_missions(uuid,uuid) rename to get_admin_certification_missions_before_proof;
create function public.get_admin_certification_missions(p_actor uuid,p_allowlist uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(item || jsonb_build_object('proofType', m.proof_type, 'proofPlatform', m.proof_platform) order by ord), '[]'::jsonb)
    from jsonb_array_elements(public.get_admin_certification_missions_before_proof(p_actor,p_allowlist)) with ordinality rows(item,ord)
    left join public.certification_missions m on m.id = (item->>'id')::uuid;
$$;
revoke all on function public.get_admin_certification_missions_before_proof(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_certification_missions(uuid,uuid), public.save_admin_certification_mission_v3(uuid,uuid,uuid,uuid,uuid,text,bigint,text,text,text,text,text,text,text,timestamptz,timestamptz,smallint,bigint,public.social_platform,text,text) from public, anon, authenticated;
grant execute on function public.get_admin_certification_missions(uuid,uuid), public.save_admin_certification_mission_v3(uuid,uuid,uuid,uuid,uuid,text,bigint,text,text,text,text,text,text,text,timestamptz,timestamptz,smallint,bigint,public.social_platform,text,text) to service_role;

-- Owner rights for every P3 function (clean replay owns everything with one role and cannot show a gap; AWS can).
do $migration$
declare
  r record;
  p3_fns constant text[] := array['submit_certification_proof','resubmit_certification_proof','review_certification_proof',
    'dukjil_block_proof_post_points','read_proof_board','list_my_certification_proofs','list_private_proofs_due_for_deletion','mark_proof_upload_purged','get_admin_proof_queue','save_admin_certification_mission_v3','get_admin_certification_missions'];
  api_fns constant text[] := array['submit_certification_proof','resubmit_certification_proof','review_certification_proof',
    'read_proof_board','list_my_certification_proofs','list_private_proofs_due_for_deletion','mark_proof_upload_purged','get_admin_proof_queue','save_admin_certification_mission_v3','get_admin_certification_missions'];
  p3_tables constant text[] := array['certification_submissions','certification_uploads','certification_missions','certification_reward_revisions',
    'fan_posts','jjinfan_titles','passport_page_slots','fan_passports','dukjil_action_log','audit_logs'];
  t text;
begin

  -- 1. callees the P3 functions call that the P3 function owner cannot execute
  for r in
    select distinct o.rolname, c.oid::regprocedure::text as sig
      from pg_catalog.pg_proc f
      join pg_catalog.pg_roles o on o.oid = f.proowner
      join pg_catalog.pg_proc c on c.pronamespace = 'public'::regnamespace and c.oid <> f.oid
        and (c.proname like 'group\_wallet\_%' or c.proname like 'dukjil\_%' or c.proname like 'passport\_%' or c.proname = 'record_dukjil_action')
        and f.prosrc ~ ('\m' || c.proname || '\M')
     where f.pronamespace = 'public'::regnamespace and f.proname = any (p3_fns) and not o.rolsuper
       and o.rolname not in ('anon', 'authenticated', 'service_role', 'public')
       and not pg_catalog.has_function_privilege(o.oid, c.oid, 'EXECUTE')
  loop
    execute format('grant execute on function %s to %I', r.sig, r.rolname);
  end loop;

  -- 2. table rights and an owner policy for P3 function owners that do not own the tables
  for r in
    select distinct o.oid as role_oid, o.rolname, o.rolbypassrls, tc.relname::text as tname
      from pg_catalog.pg_proc f
      join pg_catalog.pg_roles o on o.oid = f.proowner
      join pg_catalog.pg_class tc on tc.relnamespace = 'public'::regnamespace and tc.relname = any (p3_tables)
     where f.pronamespace = 'public'::regnamespace and f.proname = any (p3_fns) and not o.rolsuper
       and o.rolname not in ('anon', 'authenticated', 'service_role', 'public') and o.oid <> tc.relowner
  loop
    execute format('grant select, insert, update on table public.%I to %I', r.tname, r.rolname);
    if not r.rolbypassrls and not exists (select 1 from pg_catalog.pg_policy pol where pol.polrelid = ('public.' || r.tname)::regclass and r.role_oid = any (pol.polroles)) then
      execute format('create policy %I on public.%I for all to %I using (true) with check (true)', 'p3_fn_owner_' || r.rolname, r.tname, r.rolname);
    end if;
  end loop;

  -- 3. checks: fail the migration instead of hiding a gap
  for r in
    select distinct f.proname as caller_name, c.proname as callee_name, o.rolname
      from pg_catalog.pg_proc f
      join pg_catalog.pg_roles o on o.oid = f.proowner
      join pg_catalog.pg_proc c on c.pronamespace = 'public'::regnamespace and c.oid <> f.oid
        and (c.proname like 'group\_wallet\_%' or c.proname like 'dukjil\_%' or c.proname like 'passport\_%' or c.proname = 'record_dukjil_action')
        and f.prosrc ~ ('\m' || c.proname || '\M')
     where f.pronamespace = 'public'::regnamespace and f.proname = any (p3_fns) and not o.rolsuper
       and not pg_catalog.has_function_privilege(o.oid, c.oid, 'EXECUTE')
  loop
    raise exception 'PASSPORT_P3_OWNER_EXECUTE_GAP: % (owner %) cannot call %', r.caller_name, r.rolname, r.callee_name using errcode = 'P0001';
  end loop;

  foreach t in array p3_tables loop
    for r in
      select distinct o.rolname from pg_catalog.pg_proc f
        join pg_catalog.pg_roles o on o.oid = f.proowner
       where f.pronamespace = 'public'::regnamespace and f.proname = any (p3_fns) and not o.rolsuper
         and (not pg_catalog.has_table_privilege(o.oid, ('public.' || t)::regclass, 'SELECT')
              or (not o.rolbypassrls and o.oid <> (select relowner from pg_catalog.pg_class where oid = ('public.' || t)::regclass)
                  and not exists (select 1 from pg_catalog.pg_policy pol where pol.polrelid = ('public.' || t)::regclass and o.oid = any (pol.polroles))))
    loop
      raise exception 'PASSPORT_P3_TABLE_PRIVILEGE_GAP: owner % cannot read %', r.rolname, t using errcode = 'P0001';
    end loop;
  end loop;

  -- 4. API functions: service_role may execute, API roles may not
  for r in
    select p.proname from pg_catalog.pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = any (api_fns)
       and (not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
         or pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
         or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  loop
    raise exception 'PASSPORT_P3_GRANT_GAP: %', r.proname using errcode = 'P0001';
  end loop;
end $migration$;
