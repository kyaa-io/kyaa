-- B8 1단계 K1 (plan.md 3판 3.4): 공지 회원 전체 알림 kind. 단독 파일, begin 없이(새 enum 값은 같은 트랜잭션에서 쓸 수 없다).
-- 다음 파일 20261219084000이 이 값을 쓴다. 롤백: enum 값은 Postgres에서 지울 수 없어 남긴다(행이 0이면 무해).
alter type public.notification_kind add value if not exists 'group_notice';
