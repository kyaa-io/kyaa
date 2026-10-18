do $$
declare result jsonb;
begin
  if (select is_official from public.celebrity_notice_comments where id='81810000-0000-4000-8000-000000000005') then
    raise exception 'Historical comment was promoted during upgrade';
  end if;
  insert into public.celebrity_notice_comments(id,notice_id,app_user_id,body,idempotency_key,is_official)
  values('81810000-0000-4000-8000-000000000007','81810000-0000-4000-8000-000000000004','81810000-0000-4000-8000-000000000001','신규 공식 댓글','81810000-0000-4000-8000-000000000008',false);
  if not (select is_official from public.celebrity_notice_comments where id='81810000-0000-4000-8000-000000000007') then
    raise exception 'New authorized official comment was not classified';
  end if;
  result:=public.read_celebrity_notice_comments('official-author-upgrade','upgrade-official-thread',null,null,null,20,'ko');
  if (select item->>'isOfficial' from jsonb_array_elements(result->'comments') item where item->>'id'='81810000-0000-4000-8000-000000000005')<>'false'
    or (select item->>'isOfficial' from jsonb_array_elements(result->'comments') item where item->>'id'='81810000-0000-4000-8000-000000000007')<>'true' then
    raise exception 'Upgrade projection is invalid: %',result;
  end if;
  raise notice 'PASS official author upgrade preserves historical rows and classifies new inserts';
end $$;
