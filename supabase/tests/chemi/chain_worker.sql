begin;
do $$
declare owner1 uuid:=gen_random_uuid(); owner2 uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); rec uuid:=gen_random_uuid(); job jsonb; page jsonb;
begin
 assert public.chemi_chain_work(owner1,'acquire')='true'::jsonb;
 assert public.chemi_chain_work(owner2,'acquire')='false'::jsonb;
 insert into public.chemi_chain_records(id,record_key,user_id,kind,kst_date,payload,eligible_at,status,wallet_address)
 values(rec,rec::text,actor,'album',current_date,'{"character":"elina","slot":1,"stage":5}',now()-interval '31 minutes','pending','0x0000000000000000000000000000000000001234');
 page:=public.chemi_chain_read(actor,null,null,null);
 assert (page->>'delayed')::boolean and jsonb_array_length(page->'records')=1;
 assert not (page->'records'->0 ?| array['record_key','salt','wallet_address','user_id']);
 assert public.chemi_chain_read(other_user,rec,null,null)->'records'='[]'::jsonb;
 job:=public.chemi_chain_work(owner1,'lease');
 assert job @> jsonb_build_array(jsonb_build_object('id',rec));
 update public.chemi_chain_records set lease_expires_at=now()-interval '1 minute' where id=rec;
 perform public.chemi_chain_work(owner1,'recover');
 assert (select status='pending' from public.chemi_chain_records where id=rec);
 assert public.chemi_chain_metadata(rec) is null;
 update public.chemi_chain_records set status='minted' where id=rec;
 assert public.chemi_chain_metadata(rec)->>'kind'='album';
 update public.chemi_chain_records set status='burn_pending' where id=rec;
 assert public.chemi_chain_metadata(rec) is null;
 assert public.chemi_chain_work(owner1,'lease') @> jsonb_build_array(jsonb_build_object('id',rec,'op','burn'));
 perform public.chemi_chain_work(owner1,'release');
end $$;
rollback;
