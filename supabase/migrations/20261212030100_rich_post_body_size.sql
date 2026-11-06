begin;
set local lock_timeout = '5s';
-- A post at the 20,000 character limit must fit its document: the web allows 256KB of compact JSON, and the stored text form is larger.
-- Only widens a check, so the web and this migration can go in either order. The web's own limit stops a larger document first.
alter table public.fan_posts drop constraint fan_posts_body_doc_shape;
alter table public.group_posts drop constraint group_posts_body_doc_shape;
alter table public.fan_posts add constraint fan_posts_body_doc_shape check (body_doc is null or (jsonb_typeof(body_doc)='object' and body_doc->>'type'='doc' and octet_length(body_doc::text)<=524288)) not valid;
alter table public.group_posts add constraint group_posts_body_doc_shape check (body_doc is null or (jsonb_typeof(body_doc)='object' and body_doc->>'type'='doc' and octet_length(body_doc::text)<=524288)) not valid;
alter table public.fan_posts validate constraint fan_posts_body_doc_shape;
alter table public.group_posts validate constraint group_posts_body_doc_shape;
commit;
