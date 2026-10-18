do $$ declare settings jsonb; begin
 if (select mobile_account_version from public.app_users where id='5c000000-0000-4000-8000-000000000001')<>1 then raise exception 'account version backfill failed'; end if;
 select public.mobile_get_owned_settings('5c000000-0000-4000-8000-000000000001') into settings;
 if settings->>'preferredLocale'<>'ja' or (settings#>>'{topics,benefit}')::boolean then raise exception 'settings upgrade projection failed: %',settings; end if;
end $$;
