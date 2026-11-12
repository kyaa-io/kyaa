-- Dedicated operator data: only the discovery directory reads these positions.
create table public.group_discovery_priority (
 celebrity_slug text primary key references public.celebrities(slug) on update cascade on delete cascade,
 position integer not null unique check (position > 0)
);
alter table public.group_discovery_priority enable row level security;
revoke all on public.group_discovery_priority from public, anon, authenticated;
grant select, insert, update, delete on public.group_discovery_priority to service_role;
comment on table public.group_discovery_priority is 'Operator-managed discovery pins, ascending position; delete a row to unpin.';

insert into public.group_discovery_priority(celebrity_slug,position)
 select c.slug,seed.position from (values ('elina',1),('yuna',2),('changha',3)) seed(slug,position)
 join public.celebrities c on c.slug=seed.slug;

do $$
declare def text; changed text;
begin
 select pg_catalog.pg_get_functiondef('public.groups_dispatch_before_qualification(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure) into def;
 changed:=replace(def,'gp.kind directory_kind,','gp.kind directory_kind,(select p.position from public.group_discovery_priority p where p.celebrity_slug=c.slug and gp.kind=''fan'') discovery_position,');
 if changed=def then raise exception 'directory projection changed'; end if;
 def:=changed;
 changed:=replace(def,E'row_number() over(order by\n',E'row_number() over(order by\n   case when p_input->>''sort''=''discovery'' then discovery_position end asc nulls last,\n');
 if changed=def then raise exception 'directory ordering changed'; end if;
 execute changed;
end $$;
