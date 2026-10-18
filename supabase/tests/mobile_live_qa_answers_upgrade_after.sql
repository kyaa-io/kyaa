do $$
declare result jsonb;
begin
  if not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='mobile_participation_posts'and column_name='answer_to_id')
    or(select answer_to_id from public.mobile_participation_posts
      where id='5f100000-0000-4000-8000-000000000005')is not null
    then raise exception'existing participation posts were not preserved';end if;
  result:=public.read_owned_mobile_participation_context_v2(
    '5f100000-0000-4000-8000-000000000001','event','5f100000-0000-4000-8000-000000000004','ko',null,null,20
  );
  if result#>>'{items,0,author,role}'<>'fan'or result#>'{items,0,answerToId}'<>'null'::jsonb
    or result#>>'{items,0,body}'<>'기존 질문'
    then raise exception'existing post projection changed unexpectedly: %',result;end if;
  if to_regprocedure('public.save_owned_mobile_participation_post_v2(uuid,text,uuid,uuid,text,text,uuid[],integer,uuid)')is null
    then raise exception'existing post writer contract was removed';end if;
end$$;
