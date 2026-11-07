begin;
-- Fan lists show each fan's hearts next to the grade. Hearts are public, amounts paid are not, and nothing here reads a payment.
-- Signed-out: the existing read_group_public_people keeps its exact shape, because the deployed web parses it strictly and answers 503 on any new key.
-- The new key comes only from read_group_public_people_hearts, which the new web asks for with ?hearts=1. It is built from the current definition,
-- so anonymous pages, hidden profiles, sanctions, disabled accounts and blocks stay filtered the same way.
-- Signed-in: read_group_people only gains a key. Its schema drops unknown keys, so that side can ship in either order.
-- Order: this migration first, then the web. The deployed web calls neither new thing.
do $patch$
declare def text;anchor text;
begin
 -- The patches below find their anchors only once. A second run changes nothing.
 if to_regprocedure('public.read_group_public_people_hearts(uuid,uuid,integer,integer,public.content_locale)') is not null then return;end if;
 def:=pg_catalog.pg_get_functiondef('public.read_group_public_people(uuid,uuid,integer,integer,public.content_locale)'::regprocedure);
 anchor:='public.read_group_public_people(';
 if position(anchor in def)=0 then raise exception 'GROUP_PEOPLE_HEARTS_UNPATCHED: name';end if;
 def:=replace(def,anchor,'public.read_group_public_people_hearts(');
 anchor:=$a$'tier',case when g.kind='fan'then public.get_fan_effective_tier(x.app_user_id,g.celebrity_id)end$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_PEOPLE_HEARTS_UNPATCHED: public row';end if;
 def:=replace(def,anchor,anchor||$a$,
    'hearts',case when g.kind='fan'then public.passport_hearts(x.app_user_id,g.celebrity_id)end$a$);
 execute def;

 def:=pg_catalog.pg_get_functiondef('public.read_group_people(uuid,uuid,text,text,uuid,integer,public.content_locale)'::regprocedure);
 anchor:=$a$'tier',case when g.kind='fan' and not g.anonymous then public.get_fan_effective_tier(app_user_id,g.celebrity_id) end$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_PEOPLE_HEARTS_UNPATCHED: member row';end if;
 execute replace(def,anchor,anchor||$a$,'hearts',case when g.kind='fan' and not g.anonymous then public.passport_hearts(app_user_id,g.celebrity_id) end$a$);

 -- Definers on AWS can have an ordinary owner. The new reader and its tables join the same owner check as the rest of the directory.
 def:=pg_catalog.pg_get_functiondef('public.group_public_directory_owner_roles()'::regprocedure);
 anchor:=$a$'celebrity_fan_ranking_open')$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_PEOPLE_HEARTS_UNPATCHED: owner roles';end if;
 execute replace(def,anchor,$a$'celebrity_fan_ranking_open','read_group_public_people_hearts','passport_hearts')$a$);
 def:=pg_catalog.pg_get_functiondef('public.group_public_directory_owner_tables()'::regprocedure);
 anchor:=$a$'fan_reactions']$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_PEOPLE_HEARTS_UNPATCHED: owner tables';end if;
 execute replace(def,anchor,$a$'fan_reactions','creator_heart_ledger','fan_heart_conversions']$a$);
 def:=pg_catalog.pg_get_functiondef('public.group_public_directory_owner_functions()'::regprocedure);
 anchor:=$a$array['public.group_public_visible_page(uuid,uuid)',$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_PEOPLE_HEARTS_UNPATCHED: owner functions';end if;
 execute replace(def,anchor,anchor||$a$'public.passport_hearts(uuid,uuid)',$a$);
end $patch$;
revoke all on function public.read_group_public_people_hearts(uuid,uuid,integer,integer,public.content_locale)from public,anon,authenticated,service_role;
grant execute on function public.read_group_public_people_hearts(uuid,uuid,integer,integer,public.content_locale)to service_role;
select public.group_public_directory_owner_access();
select public.group_public_directory_owner_check();
commit;
