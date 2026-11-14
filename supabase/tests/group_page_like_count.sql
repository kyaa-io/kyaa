-- Disposable cluster only: stand-in tables, the real group_page_json body from 20261227102001 as the "before",
-- applies migration 20261227160001 and asserts likeCount equals the creator-ranking page-like rule
-- (active accounts' fan_reactions rows). Run: psql -v ON_ERROR_STOP=1 -d byus_page_like_count -f this file (from supabase/tests).
do $$begin if current_database()<>'byus_page_like_count' then raise exception 'Disposable byus_page_like_count database required';end if;end $$;
create table public.celebrities(id uuid primary key,slug text not null);
create table public.app_users(id uuid primary key,status text);
create table public.group_pages(id uuid primary key,kind text,celebrity_id uuid,name text,description text,image_url text,question text,anonymous boolean default false,external_links jsonb not null default '[]');
create table public.group_memberships(page_id uuid,app_user_id uuid);
create table public.fan_reactions(id uuid primary key default gen_random_uuid(),app_user_id uuid not null,celebrity_id uuid not null,unique(app_user_id,celebrity_id));
create function public.group_page_name(p_id uuid,p_locale text default null) returns text language sql stable set search_path='' as $$select name from public.group_pages where id=p_id$$;
create function public.group_page_json(p_id uuid, p_locale text default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',g.id,'kind',g.kind,'celebrityId',g.celebrity_id,'slug',c.slug,'name',public.group_page_name(g.id,p_locale),'description',g.description,
 'imageUrl',g.image_url,'question',g.question,'anonymous',g.anonymous,'memberCount',(select count(*) from public.group_memberships m join public.app_users u on u.id=m.app_user_id and u.status='active' where m.page_id=g.id),
 'externalLinks',g.external_links)
 from public.group_pages g left join public.celebrities c on c.id=g.celebrity_id where g.id=p_id
$$;

insert into public.celebrities values('a0000000-0000-4000-8000-000000000001','elina'),('a0000000-0000-4000-8000-000000000002','solo');
insert into public.app_users values
 ('c0000000-0000-4000-8000-000000000001','active'),('c0000000-0000-4000-8000-000000000002','active'),('c0000000-0000-4000-8000-000000000003','active'),
 ('c0000000-0000-4000-8000-000000000004','active'),('c0000000-0000-4000-8000-000000000005','withdrawn');
insert into public.group_pages(id,kind,celebrity_id,name) values
 ('b0000000-0000-4000-8000-000000000001','fan','a0000000-0000-4000-8000-000000000001','엘리나'),
 ('b0000000-0000-4000-8000-000000000002','fan','a0000000-0000-4000-8000-000000000002','솔로'),
 ('b0000000-0000-4000-8000-000000000003','hobby',null,'러닝'),
 ('b0000000-0000-4000-8000-000000000004','brand','a0000000-0000-4000-8000-000000000001','브랜드'),
 ('b0000000-0000-4000-8000-000000000005','fan',null,'연결 없음');
-- 엘리나: 가입자 4명(1·2·3·4), 좋아요 3명(2·3 활성 + 5 탈퇴) + 가입 안 한 활성 1명(4는 가입자). 활성 좋아요 = 2,3,4 → 3
insert into public.group_memberships values
 ('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001'),('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002'),
 ('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003'),('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000004'),
 ('b0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000001');
insert into public.fan_reactions(app_user_id,celebrity_id) values
 ('c0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001'),('c0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001'),
 ('c0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001'),('c0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001'),
 ('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002');

create function pg_temp.ok(c boolean,m text) returns void language plpgsql as $$begin if c is distinct from true then raise exception 'FAIL %',m;end if;end $$;
do $$declare before jsonb:=public.group_page_json('b0000000-0000-4000-8000-000000000001');begin
 perform pg_temp.ok(not before?'likeCount','before: no likeCount key');
end $$;

\i ../migrations/20261227160001_group_page_like_count.sql

do $$declare e uuid:='b0000000-0000-4000-8000-000000000001';j jsonb;begin
 j:=public.group_page_json(e);
 perform pg_temp.ok((j->>'likeCount')::int=3,'fan page likeCount = active accounts that left a like (withdrawn excluded)');
 perform pg_temp.ok((j->>'memberCount')::int=4,'memberCount unchanged');
 perform pg_temp.ok((public.group_page_json('b0000000-0000-4000-8000-000000000002')->>'likeCount')::int=1,'other creator counted separately');
 perform pg_temp.ok(not public.group_page_json('b0000000-0000-4000-8000-000000000003')?'likeCount','hobby page has no likeCount');
 perform pg_temp.ok(not public.group_page_json('b0000000-0000-4000-8000-000000000004')?'likeCount','brand page has no likeCount');
 perform pg_temp.ok(not public.group_page_json('b0000000-0000-4000-8000-000000000005')?'likeCount','fan page without creator has no likeCount');
 perform pg_temp.ok((j-'likeCount')=(select jsonb_build_object('id',g.id,'kind',g.kind,'celebrityId',g.celebrity_id,'slug','elina','name','엘리나','description',null,'imageUrl',null,'question',null,'anonymous',false,'memberCount',4,'externalLinks','[]'::jsonb) from public.group_pages g where g.id=e),'every other key unchanged');
 -- a new like shows at once and a withdrawn account's like stops counting
 insert into public.fan_reactions(app_user_id,celebrity_id) values('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001');
 perform pg_temp.ok((public.group_page_json(e)->>'likeCount')::int=4,'new like is counted by the next read');
 update public.app_users set status='withdrawn' where id='c0000000-0000-4000-8000-000000000002';
 perform pg_temp.ok((public.group_page_json(e)->>'likeCount')::int=3,'a withdrawn account stops counting');
 perform pg_temp.ok((select count(*) from pg_indexes where indexname='fan_reactions_celebrity_idx')=1,'celebrity index exists');
end $$;

-- rollback restores the previous body and drops the index
\i ../rollback/20261227160001_group_page_like_count.sql
do $$begin
 perform pg_temp.ok(not public.group_page_json('b0000000-0000-4000-8000-000000000001')?'likeCount','rollback removes likeCount');
 perform pg_temp.ok((select count(*) from pg_indexes where indexname='fan_reactions_celebrity_idx')=0,'rollback drops index');
end $$;
\i ../migrations/20261227160001_group_page_like_count.sql
do $$begin perform pg_temp.ok((public.group_page_json('b0000000-0000-4000-8000-000000000002')->>'likeCount')::int=1,'reapply works');end $$;
select 'group_page_like_count ok' as result;
