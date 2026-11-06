-- Rollback for 20261212030100_rich_post_body_size.sql.
-- Documents already stored above the old limit stay; `not valid` keeps them and the old limit applies to new writes.
begin;
set local lock_timeout = '5s';
alter table public.fan_posts drop constraint fan_posts_body_doc_shape;
alter table public.group_posts drop constraint group_posts_body_doc_shape;
alter table public.fan_posts add constraint fan_posts_body_doc_shape check (body_doc is null or (jsonb_typeof(body_doc)='object' and body_doc->>'type'='doc' and octet_length(body_doc::text)<=131072)) not valid;
alter table public.group_posts add constraint group_posts_body_doc_shape check (body_doc is null or (jsonb_typeof(body_doc)='object' and body_doc->>'type'='doc' and octet_length(body_doc::text)<=131072)) not valid;
commit;
