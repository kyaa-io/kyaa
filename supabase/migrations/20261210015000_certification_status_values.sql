-- PASSPORT-RENEWAL P1-2: review states. Existing flow only uses pending/approved/rejected and is unchanged.
alter type public.certification_submission_status add value if not exists 'in_review';
alter type public.certification_submission_status add value if not exists 'changes_requested';
