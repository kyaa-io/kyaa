-- shortcut: reservations expire after five minutes; use renewable fenced leases if provider calls can exceed that window.
-- Reserve each provider cache miss before the external call; overlapping batches fall back to source.
create table public.shared_translation_requests (
 source_hash text not null, target_locale text not null, translator_version text not null,
 expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',
 primary key(source_hash,target_locale,translator_version)
);
alter table public.shared_translation_requests enable row level security;
revoke all on public.shared_translation_requests from public,anon,authenticated;
create function public.claim_shared_translation_requests(p_source_hashes text[],p_target_locale text,p_translator_version text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if cardinality(p_source_hashes) not between 1 and 128 then raise exception 'TRANSLATION_INVALID_INPUT'; end if;
 delete from public.shared_translation_requests where expires_at<=clock_timestamp();
 begin
  insert into public.shared_translation_requests(source_hash,target_locale,translator_version)
   select distinct h,p_target_locale,p_translator_version from unnest(p_source_hashes) h order by h;
 exception when unique_violation then return false;
 end;
 return true;
end $$;
revoke all on function public.claim_shared_translation_requests(text[],text,text) from public,anon,authenticated;
grant execute on function public.claim_shared_translation_requests(text[],text,text) to service_role;
