-- PRIVATE artifact: includes object paths and metadata. Never print this result in logs.
-- Root/operator must write the Management API response directly to a 0600 local file.
select jsonb_build_object('format',1,
 'buckets',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) order by id collate "C"),'[]') from storage.buckets),
 'objects',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'bucket_id',bucket_id,'name',name,'metadata',metadata,'user_metadata',to_jsonb(s)->'user_metadata') order by id::text collate "C"),'[]') from storage.objects s));
