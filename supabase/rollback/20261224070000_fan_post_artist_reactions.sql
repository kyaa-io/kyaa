-- Roll back the web first: the feed skips the mark when this function is missing.
drop function if exists public.fan_post_artist_reactions(uuid[]);
notify pgrst,'reload schema';
