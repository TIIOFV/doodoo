-- Read-only inventory. Review in the intended Supabase project; contains no mutations.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname='realtime' AND tablename='messages')
   OR (schemaname='public' AND tablename IN ('doodoo_canais','doodoo_perfis','doodoo_permissoes'))
ORDER BY schemaname,tablename,policyname;

SELECT n.nspname AS schema_name,c.relname,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE (n.nspname='realtime' AND c.relname='messages')
   OR (n.nspname='public' AND c.relname IN ('doodoo_canais','doodoo_perfis','doodoo_permissoes'));

SELECT table_schema,table_name,column_name,data_type,udt_name
FROM information_schema.columns
WHERE (table_schema='public' AND table_name='doodoo_canais' AND column_name IN ('id','membros'))
   OR (table_schema='public' AND table_name='doodoo_perfis' AND column_name IN ('user_id','status','cargo','status_presenca','last_seen'))
   OR (table_schema='public' AND table_name='doodoo_permissoes' AND column_name IN ('aba_key','cargos_permitidos','usuarios_permitidos'))
ORDER BY table_schema,table_name,ordinal_position;

SELECT has_table_privilege('authenticated','realtime.messages','SELECT') AS realtime_select,
       has_table_privilege('authenticated','realtime.messages','INSERT') AS realtime_insert;
-- Check private channel errors in the browser without sharing JWTs or request headers.
-- The policy candidate is ../chat-workspace/typing-private.review.sql; it was not applied.
