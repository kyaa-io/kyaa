BEGIN;
SET LOCAL lock_timeout='5s';
DO $$
DECLARE owner_name name;
BEGIN
  SELECT pg_get_userbyid(proowner) INTO STRICT owner_name FROM pg_proc
    WHERE oid='public.reserve_s3_storage_object(text,text,text,bigint,text)'::regprocedure AND prosecdef;
  IF owner_name IN ('anon','authenticated','service_role') THEN RAISE EXCEPTION 'UNEXPECTED_RESERVATION_OWNER'; END IF;
  EXECUTE format('GRANT SELECT ON public.sns_ingest_media, public.video_thumbnails TO %I',owner_name);
END $$;
COMMIT;
