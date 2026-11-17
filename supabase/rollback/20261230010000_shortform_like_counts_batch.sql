-- Rollback for 20261230010000_shortform_like_counts_batch.sql. Roll the web back first (it calls read_public_shortform_like_counts).
begin;
set local lock_timeout = '5s';
drop function if exists public.read_public_shortform_like_counts(text[]);
notify pgrst, 'reload schema';
commit;
