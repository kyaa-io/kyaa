-- Restore the original immutable 140000: dayGain only, no home profile reference.
begin;
set local lock_timeout = '5s';
do $patch$
declare p record; def text;
begin
  for p in select * from (values
    ('public.read_home_fan_ranking_v2(uuid,text,integer)',
     $a$) || case when p_viewer is not null then pg_catalog.jsonb_build_object(
        'profileRef', pg_catalog.jsonb_build_object('kind', 'home_ranking', 'day', h.day,
          'computedAt', h.computed_at, 'metric', p_metric, 'rank', v.stored_rank)) else '{}'::jsonb end order by v.rn)
      from moved v$a$,
     $b$) order by v.rn)
      from moved v$b$),
    ('public.social_profile_ref_subject(uuid,jsonb)',
     $a$elsif kind='home_ranking' then
  if p_viewer is null then raise exception 'SOCIAL_FORBIDDEN'; end if;
  subject:=public.home_ranking_profile_subject(p_viewer,p_ref);
 elsif kind in('fan_post','fan_post_comment') then$a$,
     $b$elsif kind in('fan_post','fan_post_comment') then$b$),
    ('public.list_facts_wrapper_access()',
     $a$from (values
   ('public.social_profile_ref_subject(uuid,jsonb)','public.home_ranking_profile_subject(uuid,jsonb)'),
   ('public.home_ranking_profile_subject(uuid,jsonb)','public.read_home_fan_ranking_v2(uuid,text,integer)'),$a$,
     $b$from (values$b$)
  ) v(fn, old_text, new_text) loop
    def := pg_catalog.pg_get_functiondef(p.fn::regprocedure);
    if (length(def) - length(replace(def, p.new_text, ''))) / length(p.new_text) = 1 then continue; end if;
    if (length(def) - length(replace(def, p.old_text, ''))) / length(p.old_text) <> 1 then
      raise exception 'HOME_PROFILE_SHAPE: %', p.fn;
    end if;
    execute replace(def, p.old_text, p.new_text);
  end loop;
end $patch$;
select public.list_facts_wrapper_access();
drop function public.home_ranking_profile_subject(uuid,jsonb);
notify pgrst, 'reload schema';
commit;
