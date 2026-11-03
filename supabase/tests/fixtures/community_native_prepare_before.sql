create table public.community_native_prepare_definition as select pg_get_functiondef('public.issue_community_stamp(uuid,uuid,public.community_stamp_kind,text)'::regprocedure) definition;
insert into public.fan_action_bindings(id,chain_id,environment_id,hub_proxy,relayer,schema_uid,schema_version,binding_version,asset_base_uri,assets)
values('fa160000-0000-4000-8000-000000000001',91342,'0x'||repeat('1',64),'0x'||repeat('8',40),'0x'||repeat('3',40),'0x'||repeat('4',64),1,2,'ipfs://bafycommunitynative',jsonb_build_object('1','0x'||repeat('5',40)));
insert into public.fan_action_producer_routes(action_code,binding_id,enabled,policy_version)
select code,'fa160000-0000-4000-8000-000000000001',false,1 from unnest(array[7,8,9,10]) code;
