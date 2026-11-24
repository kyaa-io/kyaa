-- The published mentor interviews are board notices as well as gallery videos.
update public.celebrity_notices n
set post_type = 'notice'
from public.celebrities c
where c.id = n.celebrity_id
  and c.slug = 'knowingstudy'
  and n.post_type = 'artist_post'
  and n.slug in (
    'instagram-3d0e1a8347ab9386',
    'instagram-eb57ced0c458cdeb',
    'instagram-bc61c6f59eaf6e98',
    'instagram-d95ecb5b84275197'
  );
