-- PASSPORT-RENEWAL P2 (follow-up, PR-P2-DB-2 item 4): room entry and the room list use the same decision as group_room_gate.
-- 1) group_rooms keeps minimum_stage_key and minimum_tier consistent by trigger (the create-room path inserts only minimum_tier, and the
--    column default 'gold-1' would otherwise gate a Silver room or a free room as gold-1).
-- 2) Every function that calls group_room_allowed(actor, page, r.minimum_tier) now passes coalesce(minimum_stage_key, minimum_tier), so a
--    silver-2 room is exact on the real entry path. The room list item carries canEnter (gate = ok), reason and minimumStageKey.
--    Patched from the live definitions with exact-count checks; the artist-binding bypass stays inside group_room_gate.

create function public.group_rooms_sync_stage() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.minimum_tier is null or new.minimum_tier = 'Member' then
    new.minimum_stage_key := null;
  elsif tg_op = 'UPDATE' and new.minimum_stage_key is distinct from old.minimum_stage_key
        and new.minimum_tier is not distinct from old.minimum_tier and new.minimum_stage_key is not null then
    new.minimum_tier := initcap(split_part(new.minimum_stage_key, '-', 1));
  elsif new.minimum_stage_key is null or split_part(new.minimum_stage_key, '-', 1) <> lower(new.minimum_tier) then
    new.minimum_stage_key := lower(new.minimum_tier) || '-1';
  end if;
  return new;
end $$;

create trigger group_rooms_sync_stage before insert or update of minimum_tier, minimum_stage_key on public.group_rooms
  for each row execute function public.group_rooms_sync_stage();

-- Rows that the 135000 default ('gold-1') left inconsistent (rooms created between 135000 and this file).
update public.group_rooms set minimum_tier = minimum_tier where true;

do $migration$
declare
  f record; def text; newdef text; patched integer := 0; list_patched integer := 0; entry_patched integer := 0;
  p1 constant text := 'group_room_allowed\(([^,()]+),([^,()]+),((?:[a-z_]+\.)?)minimum_tier\)';
  p3 constant text := 'if not public\.group_room_allowed\(([^,()]+),([^,()]+),(coalesce\([^()]*\))\) or r\.status in \(''scheduled'',''closed''\) then raise exception ''GROUPS_FORBIDDEN'';';
  p2 constant text := '''canEnter'',public\.group_room_allowed\(([^,()]+),([^,()]+),(coalesce\([^()]*\))\)';
begin
  for f in select p.oid, p.oid::regprocedure sig, p.proname from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
              and p.proname not in ('group_room_allowed', 'group_room_gate', 'group_room_entry')
              and p.prosrc like '%group_room_allowed(%'
  loop
    def := pg_get_functiondef(f.oid);
    newdef := regexp_replace(def, p1, 'group_room_allowed(\1,\2,coalesce(\3minimum_stage_key,\3minimum_tier))', 'g');
    if newdef = def then raise exception 'ROOM_GATE_CALLER_UNPATCHED: % has a group_room_allowed call this migration cannot patch', f.sig; end if;
    if newdef ~ 'group_room_allowed\([^,()]+,[^,()]+,(?:[a-z_]+\.)?minimum_tier\)' then raise exception 'ROOM_GATE_CALLER_UNPATCHED: % still has a plain minimum_tier call', f.sig; end if;
    if newdef ~ '''canEnter'',public\.group_room_allowed' then
      def := newdef;
      newdef := regexp_replace(def, p2,
        '''canEnter'',public.group_room_gate(\1,\2,\3)=''ok'',''reason'',public.group_room_gate(\1,\2,\3),''minimumStageKey'',minimum_stage_key', 'g');
      if newdef = def then raise exception 'ROOM_GATE_CALLER_UNPATCHED: % list canEnter', f.sig; end if;
      list_patched := list_patched + 1;
    end if;
    -- room entry: the refusal carries the gate reason, GROUPS_FORBIDDEN:<jjinfan_required|stage_low|not_member> (closed or scheduled rooms stay plain GROUPS_FORBIDDEN)
    if newdef ~ p3 then
      def := newdef;
      newdef := regexp_replace(def, p3,
        'if public.group_room_gate(\1,\2,\3) <> ''ok'' then raise exception ''GROUPS_FORBIDDEN:%'', public.group_room_gate(\1,\2,\3); end if; if r.status in (''scheduled'',''closed'') then raise exception ''GROUPS_FORBIDDEN'';', 'g');
      if newdef = def then raise exception 'ROOM_GATE_CALLER_UNPATCHED: % room entry', f.sig; end if;
      entry_patched := entry_patched + 1;
    end if;
    -- the live entry paths (messages / room-read in the content dispatcher) refuse with the reason first; unknown rooms stay GROUPS_NOT_FOUND
    if position('if p_operation in(''messages'',''message'')and not exists(' in newdef) > 0 then
      def := newdef;
      newdef := replace(def, 'if p_operation in(''messages'',''message'')and not exists(',
        'if p_operation in(''messages'',''message'') and exists(select 1 from public.group_rooms r where r.id=p_item_id and r.page_id=g.id and public.group_room_gate(p_actor,g.id,coalesce(r.minimum_stage_key,r.minimum_tier))<>''ok'') then raise exception ''GROUPS_FORBIDDEN:%'',(select public.group_room_gate(p_actor,g.id,coalesce(r.minimum_stage_key,r.minimum_tier)) from public.group_rooms r where r.id=p_item_id); end if; if p_operation in(''messages'',''message'')and not exists(');
      entry_patched := entry_patched + 1;
    end if;
    if position('when ''room-read'' then' in newdef) > 0 and position('when ''room-read'' then
  if not exists(' in newdef) > 0 then
      def := newdef;
      newdef := replace(def, 'when ''room-read'' then
  if not exists(',
        'when ''room-read'' then
  if exists(select 1 from public.group_rooms r where r.id=p_item_id and r.page_id=g.id and public.group_room_gate(p_actor,g.id,coalesce(r.minimum_stage_key,r.minimum_tier))<>''ok'') then raise exception ''GROUPS_FORBIDDEN:%'',(select public.group_room_gate(p_actor,g.id,coalesce(r.minimum_stage_key,r.minimum_tier)) from public.group_rooms r where r.id=p_item_id); end if;
  if not exists(');
      entry_patched := entry_patched + 1;
    end if;
    execute newdef;
    patched := patched + 1;
  end loop;
  if patched = 0 then raise exception 'ROOM_GATE_CALLER_UNPATCHED: no caller found'; end if;
  if list_patched < 1 then raise exception 'ROOM_GATE_CALLER_UNPATCHED: no room list with canEnter found'; end if;
  if entry_patched < 1 then raise exception 'ROOM_GATE_CALLER_UNPATCHED: no room entry with the GROUPS_FORBIDDEN refusal found'; end if;
  -- Nothing may still pass a plain minimum_tier to the old function.
  if exists(select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
             and p.proname not in ('group_room_allowed', 'group_room_gate', 'group_room_entry')
             and p.prosrc ~ 'group_room_allowed\([^,()]+,[^,()]+,(?:[a-z_]+\.)?minimum_tier\)') then
    raise exception 'ROOM_GATE_CALLER_UNPATCHED: a plain minimum_tier call remains';
  end if;
end $migration$;
