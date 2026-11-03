-- Prepare direct Stamp binding support only. Producers are activated separately.
begin;

create or replace function public.assert_stamp_blockchain_job_link_v2(
  credential_id uuid,
  credential_owner_id uuid,
  credential_celebrity_id uuid,
  credential_stamp_type text,
  credential_mint_status public.credential_mint_status,
  credential_job_id uuid,
  credential_tx_hash text,
  credential_token_id numeric
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  job_record public.blockchain_jobs%rowtype;
  celebrity_slug text;
  job_payload jsonb;
  expected_stamp_type text;
  expected_mint_status public.credential_mint_status;
  expected_payload_keys integer := 4;
  actual_payload_keys integer;
  worker_submission_key_count integer;
begin
  if credential_stamp_type not in ('knowledge', 'reservation', 'attendance', 'survey', 'membership') then
    raise exception 'unsupported stamp type';
  end if;

  if credential_job_id is null then
    if credential_mint_status <> 'queued'
       or credential_tx_hash is not null
       or credential_token_id is not null then
      raise exception 'unlinked credential must remain in canonical queued state';
    end if;
    return;
  end if;

  select * into job_record from public.blockchain_jobs where id = credential_job_id;
  if not found then raise exception 'credential blockchain job does not exist'; end if;
  if job_record.entity_type <> 'stamp' or job_record.entity_id <> credential_id then
    raise exception 'job entity does not match credential';
  end if;
  if job_record.payload_version <> 1 then
    raise exception 'job payload version must be 1';
  end if;

  select slug into strict celebrity_slug
  from public.celebrities where id = credential_celebrity_id;

  if job_record.operation_key <> 'byus:stamp:v1:' || credential_id::text then
    raise exception 'job operation key does not match credential';
  end if;

  job_payload := job_record.payload;
  if jsonb_typeof(job_payload) <> 'object' then
    raise exception 'job payload must be an object';
  end if;

  if job_payload ? 'workerSubmission' then
    expected_payload_keys := 5;
    if jsonb_typeof(job_payload -> 'workerSubmission') <> 'object' then
      raise exception 'job worker submission payload is invalid';
    end if;
    select count(*) into worker_submission_key_count
    from jsonb_object_keys(job_payload -> 'workerSubmission');
    if worker_submission_key_count <> 2
       or not ((job_payload -> 'workerSubmission') ?& array['txHash', 'signedTransaction'])
       or jsonb_typeof(job_payload -> 'workerSubmission' -> 'txHash') <> 'string'
       or jsonb_typeof(job_payload -> 'workerSubmission' -> 'signedTransaction') <> 'string'
       or coalesce(job_payload -> 'workerSubmission' ->> 'txHash', '') !~ '^0x[0-9a-fA-F]{64}$'
       or coalesce(job_payload -> 'workerSubmission' ->> 'signedTransaction', '') !~ '^0x[0-9a-fA-F]+$'
       or length(coalesce(job_payload -> 'workerSubmission' ->> 'signedTransaction', '')) > 262144 then
      raise exception 'job worker submission payload is invalid';
    end if;
  end if;

  if job_payload ? 'bindingVersion' then
    if job_payload -> 'bindingVersion' is distinct from '2'::jsonb
       or job_payload ->> 'stampType' not in ('Attendance', 'Membership') then
      raise exception 'job stamp binding version is invalid';
    end if;
    expected_payload_keys := expected_payload_keys + 1;
  end if;

  select count(*) into actual_payload_keys from jsonb_object_keys(job_payload);
  if actual_payload_keys <> expected_payload_keys
     or not (job_payload ?& array['recipient', 'celebritySlug', 'issuanceId', 'stampType'])
     or jsonb_typeof(job_payload -> 'recipient') <> 'string'
     or jsonb_typeof(job_payload -> 'celebritySlug') <> 'string'
     or jsonb_typeof(job_payload -> 'issuanceId') <> 'string'
     or jsonb_typeof(job_payload -> 'stampType') <> 'string'
     or coalesce(job_payload ->> 'issuanceId', '') !~ '^0x[0-9a-fA-F]{64}$' then
    raise exception 'job stamp payload is invalid';
  end if;

  expected_stamp_type := upper(left(credential_stamp_type, 1)) || substr(credential_stamp_type, 2);
  if job_payload ->> 'stampType' is distinct from expected_stamp_type then
    raise exception 'job stamp type does not match credential';
  end if;
  if job_payload ->> 'celebritySlug' is distinct from celebrity_slug then
    raise exception 'job celebrity slug does not match credential';
  end if;
  if coalesce(job_payload ->> 'recipient', '') !~ '^0x[0-9a-fA-F]{40}$'
     or not exists (
       select 1 from public.user_wallets
       where app_user_id = credential_owner_id
         and chain_id = 91342
         and provider = 'privy'
         and wallet_type = 'embedded'
         and address = lower(job_payload ->> 'recipient')
     ) then
    raise exception 'job recipient is not owned by credential owner';
  end if;

  expected_mint_status := case job_record.status
    when 'PENDING' then 'queued'::public.credential_mint_status
    when 'PROCESSING' then 'processing'::public.credential_mint_status
    when 'RETRYING' then 'retryable'::public.credential_mint_status
    when 'FAILED' then 'permanent_failure'::public.credential_mint_status
    when 'COMPLETED' then 'minted'::public.credential_mint_status
  end;
  if credential_mint_status <> expected_mint_status then
    raise exception 'credential mint status does not match queue status';
  end if;
  if job_record.status = 'COMPLETED'
     and (credential_tx_hash is distinct from job_record.tx_hash
          or credential_token_id is distinct from job_record.token_id) then
    raise exception 'job completion result does not match credential';
  elsif job_record.status <> 'COMPLETED'
        and (credential_tx_hash is not null or credential_token_id is not null) then
    raise exception 'non-completed credential cannot expose a mint result';
  end if;
end;
$$;

create or replace function public.effective_fan_action_mint(p_app_user_id uuid,p_entity_type text,p_entity_id uuid,
  p_base_status text,p_base_tx_hash text,p_base_token_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare original jsonb; replacement public.nft_credential_replacements;
begin
  original:=public.original_fan_action_mint(p_app_user_id,p_entity_type,p_entity_id,p_base_status,p_base_tx_hash,p_base_token_id);
  if original->>'status'<>'minted' then return original; end if;
  select r.* into replacement from public.nft_credential_replacement_entities e
    join public.nft_credential_replacements r on r.id=e.replacement_id
    where e.app_user_id=p_app_user_id and e.entity_type=p_entity_type and e.entity_id=p_entity_id
      and e.original_tx_hash=lower(original->>'txHash') and r.old_token_id::text=original->>'tokenId';
  if not found then
    if p_entity_type='stamp' and exists (
      select 1 from public.stamps s
      join public.blockchain_jobs j on j.id=s.blockchain_job_id
      where s.id=p_entity_id and s.app_user_id=p_app_user_id
        and s.stamp_type in ('attendance','membership') and s.mint_status='minted'
        and j.entity_type='stamp' and j.entity_id=s.id and j.payload_version=1
        and j.payload->'bindingVersion'='2'::jsonb and j.status='COMPLETED'
        and j.tx_hash=s.tx_hash and j.token_id=s.token_id
        and lower(j.tx_hash)=lower(original->>'txHash') and j.token_id::text=original->>'tokenId'
        and (s.stamp_type<>'membership' or exists (
          select 1 from public.fan_activities a
          join public.certification_submissions cs on a.source_type='certification_submission' and cs.id=a.source_id
          where a.id=s.activity_id and cs.status='approved'))
    ) then
      return original || jsonb_build_object('nftContract','0x527a70c0f7cf129650dc282b709327c5958a4ccf');
    end if;
    return original;
  end if;
  if not exists(select 1 from public.user_wallets where app_user_id=p_app_user_id
    and chain_id=91342 and address=replacement.recipient) then return original; end if;
  if p_entity_type='stamp' and exists(select 1 from public.stamps where id=p_entity_id and stamp_type='membership')
    and not exists(select 1 from public.stamps s join public.fan_activities a on a.id=s.activity_id
      join public.certification_submissions cs on a.source_type='certification_submission' and cs.id=a.source_id
      where s.id=p_entity_id and cs.status='approved') then return original; end if;
  return jsonb_build_object('status','minted','txHash',replacement.tx_hash,'tokenId',replacement.new_token_id::text,
    'nftContract',replacement.new_contract,'metadataUri',replacement.new_metadata_uri,
    'originalAsset',jsonb_build_object('nftContract',replacement.old_contract,'tokenId',replacement.old_token_id::text,
      'metadataUri',replacement.old_metadata_uri,'txHash',replacement.old_tx_hash),
    'replacement',jsonb_build_object('batchId',replacement.batch_id,'sourceActionId',replacement.source_action_id,'sourceHub',replacement.source_hub,
      'blockNumber',replacement.block_number::text,'blockHash',replacement.block_hash));
end $$;

commit;
