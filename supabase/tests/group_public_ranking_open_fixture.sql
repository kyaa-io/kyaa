-- Opens a creator's fan ranking under the 100 active fans rule, with people who appear nowhere else in the test.
create function pg_temp.open_fan_ranking(p_creator uuid) returns void language plpgsql as $$
declare u uuid;i integer;
begin
 set local session_replication_role=replica;
 for i in 1..100 loop
  u:=extensions.gen_random_uuid();
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:open-ranking-'||u,u||'@example.test');
  insert into public.fan_reactions(id,app_user_id,celebrity_id,blockchain_job_id,completed_at)values(extensions.gen_random_uuid(),u,p_creator,extensions.gen_random_uuid(),now());
 end loop;
 set local session_replication_role=origin;
end $$;
