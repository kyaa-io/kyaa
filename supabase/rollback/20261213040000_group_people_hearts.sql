-- Rollback for 20261213040000_group_people_hearts.sql. Roll the web back first: the new web asks for ?hearts=1, which then answers 503.
-- Access granted to function owners stays, as in the earlier directory migrations.
begin;
set local lock_timeout='5s';
do $patch$
declare def text;anchor text;
begin
 def:=pg_catalog.pg_get_functiondef('public.read_group_people(uuid,uuid,text,text,uuid,integer,public.content_locale)'::regprocedure);
 anchor:=$a$,'hearts',case when g.kind='fan' and not g.anonymous then public.passport_hearts(app_user_id,g.celebrity_id) end$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_PEOPLE_HEARTS_ROLLBACK: member row';end if;
 execute replace(def,anchor,'');
 def:=pg_catalog.pg_get_functiondef('public.group_public_directory_owner_roles()'::regprocedure);
 anchor:=$a$,'read_group_public_people_hearts','passport_hearts'$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_PEOPLE_HEARTS_ROLLBACK: owner roles';end if;
 execute replace(def,anchor,'');
 def:=pg_catalog.pg_get_functiondef('public.group_public_directory_owner_tables()'::regprocedure);
 anchor:=$a$,'creator_heart_ledger','fan_heart_conversions'$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_PEOPLE_HEARTS_ROLLBACK: owner tables';end if;
 execute replace(def,anchor,'');
 def:=pg_catalog.pg_get_functiondef('public.group_public_directory_owner_functions()'::regprocedure);
 anchor:=$a$'public.passport_hearts(uuid,uuid)',$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_PEOPLE_HEARTS_ROLLBACK: owner functions';end if;
 execute replace(def,anchor,'');
end $patch$;
drop function public.read_group_public_people_hearts(uuid,uuid,integer,integer,public.content_locale);
select public.group_public_directory_owner_check();
commit;
