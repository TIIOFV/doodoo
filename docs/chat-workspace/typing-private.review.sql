-- REVIEW CANDIDATE ONLY. Not executed remotely.
-- Verify the owning schema, grants, existing realtime.messages policies and channel RLS first.
-- Existing permissive policies may authorize more than these two policies; review them together.
-- Do not change the project's public-channel setting: existing Postgres Changes channels use it.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='realtime' AND c.relname='messages' AND c.relrowsecurity) THEN
  RAISE EXCEPTION 'realtime.messages must already have RLS enabled; review the Realtime setup';
 END IF;
END $$;

CREATE POLICY doodoo_typing_member_receive ON realtime.messages
FOR SELECT TO authenticated USING (
 extension='broadcast' AND realtime.topic() LIKE 'doodoo:typing:%'
 AND EXISTS (
  SELECT 1 FROM public.doodoo_canais c
  JOIN public.doodoo_perfis p ON p.user_id=auth.uid() AND p.status='ativo'
  WHERE c.id::text=substring(realtime.topic() FROM 15)
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(to_jsonb(c.membros)) m WHERE m->>'user_id'=auth.uid()::text)
  AND EXISTS(SELECT 1 FROM public.doodoo_permissoes a WHERE a.aba_key='chat' AND (to_jsonb(a.cargos_permitidos) ? p.cargo::text OR to_jsonb(a.usuarios_permitidos) ? auth.uid()::text))
 )
);
CREATE POLICY doodoo_typing_member_send ON realtime.messages
FOR INSERT TO authenticated WITH CHECK (
 extension='broadcast' AND realtime.topic() LIKE 'doodoo:typing:%'
 AND EXISTS (
  SELECT 1 FROM public.doodoo_canais c
  JOIN public.doodoo_perfis p ON p.user_id=auth.uid() AND p.status='ativo'
  WHERE c.id::text=substring(realtime.topic() FROM 15)
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(to_jsonb(c.membros)) m WHERE m->>'user_id'=auth.uid()::text)
  AND EXISTS(SELECT 1 FROM public.doodoo_permissoes a WHERE a.aba_key='chat' AND (to_jsonb(a.cargos_permitidos) ? p.cargo::text OR to_jsonb(a.usuarios_permitidos) ? auth.uid()::text))
 )
);
COMMIT;
-- Reviewed rollback: DROP POLICY doodoo_typing_member_receive ON realtime.messages;
--                    DROP POLICY doodoo_typing_member_send ON realtime.messages;
