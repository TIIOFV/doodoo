-- REVIEW ONLY. Only the seed IDs recorded in actors.json; never a reset.
-- Dynamic integration test rows require their own reviewed ID ledger, not a broad filter.
BEGIN;
DO $$ BEGIN
 IF current_setting('doodoo.allow_isolated_setup',true) IS DISTINCT FROM 'reviewed-independent-project' OR obj_description('public.doodoo_tarefas'::regclass) IS DISTINCT FROM 'Doo Doo isolated homologation candidate; not evidence of production schema' THEN RAISE EXCEPTION 'Independent project approval required';END IF;
END $$;
DELETE FROM public.doodoo_tarefas WHERE id='a3000000-0000-4000-8000-000000000001' AND metadata->>'fixture'='phase-3-seed';
DELETE FROM public.doodoo_canais WHERE id='a3000000-0000-4000-8000-000000000002' AND nome='[HOMO fixture] Equipe';
DELETE FROM public.doodoo_agenda WHERE id='a3000000-0000-4000-8000-000000000003' AND titulo='[HOMO fixture] Reunião';
DELETE FROM public.doodoo_notas WHERE id='a3000000-0000-4000-8000-000000000004' AND titulo='[HOMO fixture] Nota privada';
-- Profiles, Auth, objects, permissions, categories and later occurrences are intentionally NOT removed here.
-- Review their specific ledger and foreign keys, then obtain authorization for that cleanup.
COMMIT;
