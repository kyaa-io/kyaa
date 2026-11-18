create or replace function public.chemi_chain_work(p_owner uuid, p_action text, p_args jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.chemi_chain_records; b public.chemi_chain_batches; ids uuid[]; op text; result jsonb; n int; lease_limit int; rejected boolean; window_rejected boolean;
begin
  if p_action='acquire' then
    insert into public.chemi_chain_writer(singleton,lease_owner,lease_expires_at)
    values(true,p_owner::text,clock_timestamp()+interval '5 minutes')
    on conflict(singleton) do update set lease_owner=excluded.lease_owner,lease_expires_at=excluded.lease_expires_at
      where public.chemi_chain_writer.lease_expires_at <= clock_timestamp();
    return to_jsonb(found);
  end if;
  perform 1 from public.chemi_chain_writer where lease_owner=p_owner::text and lease_expires_at>clock_timestamp() for update;
  if not found then raise exception 'CHEMI_WRITER_EXPIRED'; end if;
  if p_action='release' then
    delete from public.chemi_chain_writer where lease_owner=p_owner::text;
  elsif p_action='recover' then
    update public.chemi_chain_records set status='pending',lease_owner=null,lease_expires_at=null where status='leased' and lease_expires_at<=clock_timestamp();
    select jsonb_build_object('id',id,'hash',tx_hash,'raw',signed_tx,'op',operation,'ids',record_ids)
      into result from public.chemi_chain_batches where status='sent' order by created_at limit 1;
    return result;
  elsif p_action='lease' then
    if exists(select from public.chemi_chain_batches where status='sent') then return '[]'; end if;
    update public.chemi_chain_records c set status='waiting_wallet' where status='pending' and kind<>'rank_table'
      and wallet_address is null and not exists(select from public.user_wallets w where w.app_user_id=c.user_id and w.chain_id=91342);
    update public.chemi_chain_records c set wallet_address=w.address,status='pending' from public.user_wallets w
      where c.status in ('waiting_wallet','pending') and w.app_user_id=c.user_id and w.chain_id=91342 and c.wallet_address is null;
    result:='[]';
    -- Recheck operation priority if the selected operation only had rejected records.
    loop
      select case when status='burn_pending' then 'burn' when kind='rank_table' then 'rank' else 'mint' end
        into op from public.chemi_chain_records where eligible_at<=now() and coalesce(next_attempt_at,now())<=now()
        and (status='burn_pending' or (status in ('pending','retry') and (wallet_address is not null or (kind='rank_table' and p_args->>'rank'='true'))))
        order by eligible_at,id limit 1;
      lease_limit:=case when op='rank' then 1 else 100 end;
      rejected:=false;
      loop
        window_rejected:=false;
        for r in select * from public.chemi_chain_records where eligible_at<=now() and coalesce(next_attempt_at,now())<=now()
          and case op when 'burn' then status='burn_pending' when 'rank' then kind='rank_table' and status in ('pending','retry')
          else kind<>'rank_table' and status in ('pending','retry') and wallet_address is not null end
          order by eligible_at,id limit (lease_limit-jsonb_array_length(result)) for update skip locked loop
          if op<>'burn' then
            begin
              perform public.chemi_chain_payload_check(r.kind,r.payload,r.kst_date);
            exception when invalid_parameter_value then
              if sqlerrm <> 'CHEMI_CHAIN_PAYLOAD_REJECTED' then raise; end if;
              update public.chemi_chain_records set status='retry', attempts=attempts+1,
                next_attempt_at=now()+interval '5 minutes', lease_owner=null, lease_expires_at=null where id=r.id;
              rejected:=true;
              window_rejected:=true;
              continue;
            end;
          end if;
          update public.chemi_chain_records set status=case when op='burn' then status else 'leased' end,
            lease_owner=p_owner::text,lease_expires_at=clock_timestamp()+interval '5 minutes' where id=r.id;
          result:=result || jsonb_build_array(jsonb_build_object('id',r.id,'op',op,'address',r.wallet_address,
            'date',case when op='rank' then r.kst_date end,'payload',case when op='rank' then r.payload end));
        end loop;
        exit when not window_rejected or jsonb_array_length(result)>=lease_limit;
      end loop;
      exit when result<>'[]' or not rejected;
    end loop;
    return result;
  elsif p_action='prepare' then
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_args->'ids');
    op:=p_args->>'op';
    perform 1 from public.chemi_chain_records where id=any(ids) and lease_owner=p_owner::text
      and status=case when op='burn' then 'burn_pending' else 'leased' end for update;
    get diagnostics n=row_count;
    if n<>cardinality(ids) or n not between 1 and 100 then raise exception 'CHEMI_LEASE_CHANGED'; end if;
    insert into public.chemi_chain_batches(status,tx_hash,signed_tx,record_ids,operation,record_count,sent_at)
      values('sent',p_args->>'hash',p_args->>'raw',ids,op,n,now()) returning * into b;
    update public.chemi_chain_records set batch_id=b.id,tx_hash=b.tx_hash,status=case when op='burn' then status else 'sent' end where id=any(ids);
    return to_jsonb(b.id);
  elsif p_action in ('confirmed','reverted') then
    select * into strict b from public.chemi_chain_batches where id=(p_args->>'batch')::uuid and status='sent' for update;
    update public.chemi_chain_batches set status=case when p_action='confirmed' then 'confirmed' else 'failed' end,
      signed_tx=null,attestation_uid=p_args->>'attestationUid',confirmed_at=case when p_action='confirmed' then now() end,
      error_code=case when p_action='reverted' then 'TX_REVERTED' when p_args->>'evidence'='issued' then 'RECOVERED_ISSUED' end where id=b.id;
    update public.chemi_chain_records set status=case when b.operation='burn' and p_action='confirmed' then 'burned'
      when status='burn_pending' then status when p_action='confirmed' then 'minted' else 'leased' end,
      minted_at=case when p_action='confirmed' and b.operation<>'burn' then now() else minted_at end,
      burned_at=case when p_action='confirmed' and b.operation='burn' then now() else burned_at end,
      token_no=case when p_action='confirmed' and b.operation='mint' then (select sum(get_byte(uuid_send(id),i)::numeric * power(256::numeric,15-i)) from generate_series(0,15) i) else token_no end,
      attempts=attempts+1,lease_owner=case when p_action='reverted' then p_owner::text end,
      lease_expires_at=case when p_action='reverted' then now()+interval '5 minutes' end where batch_id=b.id and status in ('sent','burn_pending');
  elsif p_action='retry' then
    update public.chemi_chain_records set attempts=attempts+1,next_attempt_at=now()+interval '5 minutes',
      status=case when status='leased' then 'retry' else status end,lease_owner=null,lease_expires_at=null
      where id=(p_args->>'id')::uuid and lease_owner=p_owner::text and status in ('leased','burn_pending');
  else raise exception 'CHEMI_INVALID'; end if;
  return 'true';
end $$;
