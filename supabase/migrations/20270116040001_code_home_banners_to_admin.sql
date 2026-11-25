-- The five home banners that were written in code (mission book, US$400 sign-up raffle, X event, first steps, GGGI)
-- become managed banners with the same ids, images, loops, ko/en copy, links and UTM. Order: raffle, mission book,
-- the managed event banners, X event, first steps, GGGI, then every other banner in its current order.
-- The images are the files under apps/web/public/public-assets/cms-assets/public-image-assets/ (same bytes as the
-- code banners; the X event PNG re-encoded to WebP). Their URLs use the asset host of the newest registered image,
-- so the same file serves DEV and production. A database with no registered image (a fresh copy) is left as it is.
begin;
set local lock_timeout='5s';
do $$
declare
  src public.public_image_assets;
  base text;
  inserted integer;
  video text := '/public-assets/cms-assets/home-banners/video/';
begin
  if exists(select 1 from public.home_banners where id in ('247861a1-27b0-4e0a-9039-b5f8f7bc1c48','ee9bdc92-a049-4f81-ab42-751f734af1ce','fc1bd251-f675-4e69-82b0-26a8a73be41f','fd2ba957-c2aa-430d-8acb-42d52c3f66be','8bf2f180-cb32-4f00-93e2-e84b570ad450')) then
    raise notice 'code home banners already present';
    return;
  end if;
  select * into src from public.public_image_assets order by created_at desc, id desc limit 1;
  if not found then
    raise notice 'no registered public image; code home banners not moved';
    return;
  end if;
  base := substring(src.url from '^(https://.+)/cms-assets/public-image-assets/[0-9a-f]{64}\.webp$');

  create temporary table code_banner_images(name text primary key, sha text not null, width integer not null, height integer not null, bytes bigint not null) on commit drop;
  insert into code_banner_images values
    ('missionbook-wide','bd61bdcce4df823580edc94b52ff1f18ffed91365595b6eb01cd4a2b32040e5d',1536,1024,56932),
    ('missionbook-square','3e2fed467357384fb41391ca737c7efba3f0aa91b9068fbd1887a9a705d9801e',1024,1024,37986),
    ('signup-raffle','651178d24846ceccd9e937f5fd456a20c97c5c609ec68b6977d56e978462ecb3',1536,1024,306520),
    ('x-mission','50965e220b8c416beb5e41897538f72de7a35271e3a0fb9971f2bf84e166c6ca',1254,1254,365318),
    ('first-steps-wide','a8229a5b66ecbc26c4ac695d0051ad113a7e84c33d0a25730109f14ca3915782',1774,887,80312),
    ('first-steps-mobile','ab655c0b12324ae928af71aff0e43f07d0c2ce661f49dc0e284aa4851c498a20',887,887,59114),
    ('gggi-changha','a5fc06e738f29e4d73c081e2eef6e64fa0bdac09e87697cf23b6c66403d2173f',1080,720,182164);
  insert into public.public_image_assets(content_sha256,storage_path,url,width,height,mime_type,byte_size,created_by_app_user_id,created_by_admin_allowlist_id)
  select i.sha,'public-image-assets/'||i.sha||'.webp',base||'/cms-assets/public-image-assets/'||i.sha||'.webp',i.width,i.height,'image/webp',i.bytes,src.created_by_app_user_id,src.created_by_admin_allowlist_id
  from code_banner_images i
  on conflict do nothing;

  insert into public.home_banners(id,kind,celebrity_id,publication_status,placement,category,sort_order) values
    ('ee9bdc92-a049-4f81-ab42-751f734af1ce','announcement',null,'published','home','event',0),
    ('247861a1-27b0-4e0a-9039-b5f8f7bc1c48','announcement',null,'published','home','guide',0),
    ('fc1bd251-f675-4e69-82b0-26a8a73be41f','announcement',null,'published','home','event',0),
    ('fd2ba957-c2aa-430d-8acb-42d52c3f66be','announcement',null,'published','home','guide',0),
    ('8bf2f180-cb32-4f00-93e2-e84b570ad450','announcement',null,'published','home','announcement',0);

  insert into public.home_banner_localizations(banner_id,locale,title,description,cta_label,href,alt,desktop_asset_id,mobile_asset_id,desktop_video,mobile_video)
  select v.banner_id::uuid,v.locale::public.content_locale,v.title,v.description,v.cta_label,v.href,v.alt,
    (select a.id from public.public_image_assets a join code_banner_images i on i.sha=a.content_sha256 where i.name=v.desktop_image),
    (select a.id from public.public_image_assets a join code_banner_images i on i.sha=a.content_sha256 where i.name=v.mobile_image),
    video||v.desktop_video, video||v.mobile_video
  from (values
    ('ee9bdc92-a049-4f81-ab42-751f734af1ce','ko','신규 가입 이벤트','US$400 · 17명 · 12월 13일 마감','KYAA에서 응모하기','/s/raffle?utm_source=kyaa&utm_medium=home_banner&utm_campaign=signup_raffle','기프트카드와 분홍색 응모권','signup-raffle','signup-raffle','signup-raffle-loop-v1',null),
    ('ee9bdc92-a049-4f81-ab42-751f734af1ce','en','New Member Event','US$400 · 17 winners · Closes December 13','Enter on KYAA','/s/raffle?utm_source=kyaa&utm_medium=home_banner&utm_campaign=signup_raffle','Gift card and pink raffle tickets','signup-raffle','signup-raffle','signup-raffle-loop-v1',null),
    ('247861a1-27b0-4e0a-9039-b5f8f7bc1c48','ko','덕질미션북','','미션북 보기','/follow','덕질미션북','missionbook-wide','missionbook-square','missionbook-wide-loop-v1','missionbook-square-loop-v1'),
    ('247861a1-27b0-4e0a-9039-b5f8f7bc1c48','en','Fan mission book','','See the mission book','/follow','Fan mission book','missionbook-wide','missionbook-square','missionbook-wide-loop-v1','missionbook-square-loop-v1'),
    ('fc1bd251-f675-4e69-82b0-26a8a73be41f','ko','X 오픈 이벤트','팔로우 → 리포스트 → 좋아요','이벤트 참여하기','/follow','좋아요 하트와 미션 완료 체크','x-mission',null,'x-mission-loop-v1',null),
    ('fc1bd251-f675-4e69-82b0-26a8a73be41f','en','X Opening Event','Follow → Repost → Like','Join the event','/follow','Like heart and mission complete check','x-mission',null,'x-mission-loop-v1',null),
    ('fd2ba957-c2aa-430d-8acb-42d52c3f66be','ko','kyaa 첫 걸음','모임 가입 · 팬 패스포트 받기 · 첫 출석','시작하기','/onboarding','kyaa 첫 걸음','first-steps-wide','first-steps-mobile','first-steps-wide-loop-v1','first-steps-mobile-loop-v1'),
    ('fd2ba957-c2aa-430d-8acb-42d52c3f66be','en','First steps on kyaa','Join a page · Get a Fan Passport · First check-in','Start','/onboarding','First steps on kyaa','first-steps-wide','first-steps-mobile','first-steps-wide-loop-v1','first-steps-mobile-loop-v1'),
    ('8bf2f180-cb32-4f00-93e2-e84b570ad450','ko','GGGI × 창하 굿즈 이벤트','좋아요를 누르면 자동 응모돼요. 계정당 1회 참여할 수 있어요.','이벤트 자세히 보기','/gggi#gggi-event','창하','gggi-changha',null,'gggi-changha-loop-v1',null),
    ('8bf2f180-cb32-4f00-93e2-e84b570ad450','en','GGGI × Changha merchandise event','Like the page to enter automatically. One entry per account.','View event details','/gggi#gggi-event','Changha','gggi-changha',null,'gggi-changha-loop-v1',null)
  ) v(banner_id,locale,title,description,cta_label,href,alt,desktop_image,mobile_image,desktop_video,mobile_video);

  select count(*) into inserted from public.home_banner_localizations
   where banner_id in ('247861a1-27b0-4e0a-9039-b5f8f7bc1c48','ee9bdc92-a049-4f81-ab42-751f734af1ce','fc1bd251-f675-4e69-82b0-26a8a73be41f','fd2ba957-c2aa-430d-8acb-42d52c3f66be','8bf2f180-cb32-4f00-93e2-e84b570ad450')
     and desktop_asset_id is not null;
  if inserted<>10 then raise exception 'code home banner images missing (% of 10)', inserted; end if;

  with ranked as (
    select b.id, row_number() over (order by
      case b.id when 'ee9bdc92-a049-4f81-ab42-751f734af1ce' then 0 when '247861a1-27b0-4e0a-9039-b5f8f7bc1c48' then 1
        when 'fc1bd251-f675-4e69-82b0-26a8a73be41f' then 3 when 'fd2ba957-c2aa-430d-8acb-42d52c3f66be' then 4 when '8bf2f180-cb32-4f00-93e2-e84b570ad450' then 5
        else case when b.category='event' and b.placement in ('home','both') then 2 else 6 end end,
      b.sort_order, b.id) - 1 as position
    from public.home_banners b
  )
  update public.home_banners b set sort_order=r.position::integer, revision=b.revision+1 from ranked r where r.id=b.id;
end $$;
commit;
