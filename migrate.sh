#!/bin/bash
PGPASSWORD="LemonJatau1234" psql -h db.qvpxalxgnwytsmmmdkbs.supabase.co -p 5432 -U postgres -d postgres -c "
alter table agents add column if not exists agent_wallet          text not null default '';
alter table agents add column if not exists agent_private_key     text not null default '';
alter table agents add column if not exists selfclaw_private_key  text not null default '';
alter table agents add column if not exists selfclaw_session_id   text not null default '';
"
echo "Migration done."
