#!/usr/bin/env bash
# Disposable clean-chain connection only. Round-trip and ordinary owner, without pg_cron.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
NAMES=(20261220110000_home_ranking_info.sql 20261220110001_home_ranking_response_fields.sql)
for kind in migrations rollback; do
  : > "$TMP/$kind.sql"
  if [[ "$kind" == migrations ]]; then ORDER=("${NAMES[@]}"); else ORDER=("${NAMES[1]}" "${NAMES[0]}"); fi
  for name in "${ORDER[@]}"; do
    sed -e '/^begin;$/d' -e '/^commit;$/d' -e "/^notify pgrst, 'reload schema';$/d" "$ROOT/supabase/$kind/$name" >> "$TMP/$kind.sql"
  done
done
sed -e '/^begin;$/d' -e '/^commit;$/d' -e "/^notify pgrst, 'reload schema';$/d" "$ROOT/supabase/migrations/${NAMES[1]}" > "$TMP/response.sql"
psql -X -v ON_ERROR_STOP=1 <<SQL
begin;
create temporary table rank_info_before as
 select oid,pg_get_functiondef(oid) def,proowner,proacl from pg_proc where oid in
 ('public.refresh_home_rankings(timestamptz)'::regprocedure,'public.read_home_fan_ranking_v2(uuid,text,integer)'::regprocedure,'public.read_home_creator_ranking_v2(text,text,integer)'::regprocedure);
-- The new migration must neither reference cron nor need the platform stub.
alter schema cron rename to rank_info_unused_cron;
\i $TMP/response.sql
\i $TMP/rollback.sql
\i $TMP/migrations.sql
do \$\$ begin
 if exists(select 1 from rank_info_before b join pg_proc p on p.oid=b.oid where b.def<>pg_get_functiondef(p.oid) or b.proowner<>p.proowner or b.proacl is distinct from p.proacl) then raise exception 'INFO roundtrip changed function body/owner/ACL'; end if;
 raise notice 'PASS rank response: idempotent apply and both migrations rollback/reapply preserve definitions/owners/ACLs; no cron schema';
end \$\$;
rollback;

begin;
\i $TMP/rollback.sql
create role rank_info_owner nologin nosuperuser nobypassrls;
-- Like the existing metrics test: membership in the table-owner role does not grant SUPERUSER/BYPASSRLS.
select format('grant %I to rank_info_owner',pg_get_userbyid(relowner)) from pg_class where oid='public.home_ranking_daily'::regclass \gexec
alter function public.refresh_home_rankings(timestamptz) owner to rank_info_owner;
alter function public.read_home_fan_ranking_v2(uuid,text,integer) owner to rank_info_owner;
alter function public.read_home_creator_ranking_v2(text,text,integer) owner to rank_info_owner;
-- Explicit owner policies model ordinary definers on FORCE-RLS tables, including the existing snapshot.
do \$\$ declare t text; begin
 foreach t in array array['home_ranking_daily','home_ranking_builds','home_ranking_kind_builds','home_ranking_build_failures','live_events','live_status_overrides','celebrities','fan_profile_public_fields','fan_score_ledger','creator_heart_ledger','fan_heart_conversions','celebrity_localizations','group_pages','app_users','user_profiles','app_user_avatars','app_user_moderation_restrictions','user_blocks','jjinfan_challenge_campaigns'] loop
  execute format('create policy rank_info_owner_test on public.%I for all to rank_info_owner using (true) with check (true)',t);
 end loop;
end \$\$;
create temporary table rank_info_fixture(tag text,id uuid default extensions.gen_random_uuid());
insert into rank_info_fixture(tag) values ('c'),('f');
grant select on rank_info_fixture to rank_info_owner;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
 select id,'info-owner-creator','published','/fixture.webp',now(),'{creator}','creator' from rank_info_fixture where tag='c';
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
 select id,'ko','owner creator','s','a' from rank_info_fixture where tag='c';
insert into public.group_pages(kind,celebrity_id,name) select 'fan',id,'owner page' from rank_info_fixture where tag='c';
insert into public.app_users(id,privy_user_id,verified_email) select id,'did:privy:info-owner','info-owner@example.test' from rank_info_fixture where tag='f';
insert into public.user_profiles(app_user_id,nickname,nickname_normalized) select id,'info_owner','info_owner' from rank_info_fixture where tag='f';
set local session_replication_role=replica;
insert into public.creator_heart_ledger(celebrity_id,app_user_id,amount,source_type,source_id)
 select c.id,f.id,1,'passport_page_claim',extensions.gen_random_uuid() from rank_info_fixture c cross join rank_info_fixture f where c.tag='c' and f.tag='f';
set local session_replication_role=origin;
set role rank_info_owner;
\i $TMP/migrations.sql
select public.refresh_home_rankings();
select public.read_home_fan_ranking_v2(null,'hearts',5);
select public.read_home_creator_ranking_v2('ko','hearts',5);
do \$\$ declare r jsonb; begin
 r:=public.read_home_fan_ranking_v2(null,'hearts',5)->'rows'->0;
 if r is null or r->>'nickname'<>'info_owner' or r->>'fans'<>'1' or r->>'hearts'<>'1' or r->>'points' is distinct from '0' or r ? 'liveNow' then raise exception 'INFO ordinary owner missed fixture: %',r; end if;
 r:=public.read_home_creator_ranking_v2('ko','hearts',5)->'rows'->0;
 if r is null or r->>'slug'<>'info-owner-creator' or r->>'fans'<>'1' or r->>'hearts'<>'1' or r->>'isNew'<>'false' then raise exception 'INFO ordinary owner missed creator fixture: %',r; end if;
end \$\$;
reset role;
do \$\$ begin
 if (select rolsuper or rolbypassrls from pg_roles where rolname='rank_info_owner') then raise exception 'INFO owner test is privileged'; end if;
 raise notice 'PASS rank info: migration and readers under non-superuser/non-bypass owner';
end \$\$;
rollback;
SQL
