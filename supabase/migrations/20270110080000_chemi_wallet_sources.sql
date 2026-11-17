-- D1. Preserve the existing definition, owner and ACL.
do $$
declare
  definition text := pg_get_functiondef('public.group_wallet_post(uuid,text,bigint,text,uuid)'::regprocedure);
  anchor text := '''group_support'',''dukjil_action''';
begin
  if regexp_count(definition, anchor) <> 1 or position('''chemi_' in definition) > 0 then
    raise exception 'CHEMI_WALLET_CONTRACT_CHANGED';
  end if;
  execute replace(definition, anchor, '''chemi_reward'',''chemi_game_extra'',''chemi_game_refund'',' || anchor);
end $$;
