begin;
set local lock_timeout='5s';
alter table public.group_applications add column applicant_edited_at timestamptz;
do $migration$
declare
  source text := pg_get_functiondef('public.groups_dispatch_before_content(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
  guard text := 'if a.status<>''changes_requested'' then';
  write_fields text := 'set kind=p_input->>''kind'',name=';
begin
  if strpos(source,guard)=0 or strpos(source,write_fields)=0 then
    raise exception 'Unexpected application revision function';
  end if;
  source := replace(source, guard, $condition$if a.status<>'changes_requested' and not (
    a.kind='fan' and p_input->>'kind' is not distinct from 'fan'
    and a.status in ('submitted','reviewing')
    and (a.qualification is not null or coalesce(jsonb_typeof(p_input->'qualification')='object',false))
    and (p_input->>'expectedRevision')::integer is not distinct from a.submission_revision
  ) then$condition$);
  execute replace(source,write_fields,'set applicant_edited_at=clock_timestamp(),kind=p_input->>''kind'',name=');
end $migration$;
commit;
