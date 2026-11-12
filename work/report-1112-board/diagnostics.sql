BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
-- [1] 읽기: 영향 회원 수 (적용 전·후 모두 실행)
select count(*) as entry_stamp_missing,
       count(distinct p.app_user_id) as members,
       count(*) filter (where exists(select 1 from public.user_wallets w where w.app_user_id = p.app_user_id and w.chain_id = 91342
                                       and w.provider = 'privy' and w.wallet_type = 'embedded')) as wallet_ready
  from public.fan_passports p
  join public.celebrities c on c.id = p.celebrity_id and c.status = 'published' and c.archived_at is null
 where exists(select 1 from public.quiz_passes q where q.app_user_id = p.app_user_id and q.celebrity_id = p.celebrity_id)
   and not exists(select 1 from public.community_stamps s
                   where s.app_user_id = p.app_user_id and s.celebrity_id = p.celebrity_id and s.kind = 'quiz');

-- [1b] 읽기: 도장은 있는데 01칸에 안 놓인 패스포트(이 파일은 고치지 않음, 0이어야 함. 0이 아니면 감독에게 보고)
select count(*) as quiz_stamp_unplaced
  from public.fan_passports p
 where exists(select 1 from public.community_stamps s
               where s.app_user_id = p.app_user_id and s.celebrity_id = p.celebrity_id and s.kind = 'quiz'
                 and not exists(select 1 from public.passport_page_slots x where x.stamp_id = s.id));


-- B4: actual rows, no invented historical views.
SELECT count(*) AS likes_without_recorded_view
FROM public.fan_post_likes l
WHERE NOT EXISTS (SELECT 1 FROM public.fan_post_views v WHERE v.post_id=l.post_id AND v.app_user_id=l.app_user_id);
SELECT count(*) AS posts_likes_exceed_views FROM public.fan_posts p
WHERE (SELECT count(*) FROM public.fan_post_likes l WHERE l.post_id=p.id) > (SELECT count(*) FROM public.fan_post_views v WHERE v.post_id=p.id);
-- B5: identify stored classification before preparing any move.
SELECT p.id,c.slug,p.revision,p.created_at,p.updated_at,
 (SELECT count(*) FROM public.content_assets a WHERE a.celebrity_id=p.celebrity_id) AS creator_asset_count
FROM public.fan_posts p JOIN public.celebrities c ON c.id=p.celebrity_id
WHERE p.id='e5bdbbfb-660f-4123-9467-55536612c4b5';
ROLLBACK;
