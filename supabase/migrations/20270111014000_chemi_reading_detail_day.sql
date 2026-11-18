-- 저장된 결과를 다시 열 때 화면이 어떤 날의 어떤 풀이인지 알 수 있게 종류·한국 날짜를 함께 돌려준다.
create or replace function public.chemi_reading_detail(p_user uuid,p_id uuid,p_character text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare payload jsonb;
begin
  select jsonb_build_object('readingId',r.id,'content',r.content,'kind',r.kind,'kstDate',r.kst_date,'result',r.result,'styled',s.text) into payload from public.chemi_readings r
    left join public.chemi_reading_styles s on s.reading_id=r.id and s.character=coalesce(p_character,r.character) and s.locale='ko'
    where r.user_id=p_user and r.id=p_id;
  if not found then raise exception 'CHEMI_NOT_FOUND'; end if;
  return payload;
end $$;
