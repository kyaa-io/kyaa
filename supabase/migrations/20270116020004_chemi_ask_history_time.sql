create or replace function public.chemi_ask_thread_json(t public.chemi_ask_threads) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'threadId', t.id, 'character', t.character, 'content', t.content, 'readingId', t.reading_id,
    'topic', t.topic, 'question', t.question, 'status', t.status, 'klass', t.klass, 'answer', t.answer,
    'followupQuestion', case when t.followup_status = 'answered' then t.followup_question end,
    'followupAnswer', case when t.followup_status = 'answered' then t.followup_answer end,
    'createdAt', t.created_at,
    'date', (t.created_at at time zone 'Asia/Seoul')::date)
$$;
