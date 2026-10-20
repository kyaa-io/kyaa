do $$ begin
 if (select count(*) from public.cheer_photocard_entitlements)<>22 then raise exception 'Missing upgraded entitlements'; end if;
 if (select count(*) from public.cheer_photocard_assets)<>0 then raise exception 'Unexpected original assets'; end if;
 if (select count(*) from public.benefit_cheer_entries where campaign_id in('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe'))<>22 then raise exception 'Entries lost'; end if;
end $$;
