-- PROPOSAL ONLY. Queue a cleanup intent in the SAME database transaction.
-- No Storage API call or physical object deletion happens in this migration.
BEGIN;
DO $$ BEGIN
 IF current_setting('doodoo.allow_isolated_setup',true) IS DISTINCT FROM 'reviewed-independent-project' OR obj_description('public.doodoo_tarefas'::regclass) IS DISTINCT FROM 'Doo Doo isolated homologation candidate; not evidence of production schema' THEN RAISE EXCEPTION 'Reviewed independent baseline required';END IF;
END $$;
CREATE TABLE public.doodoo_storage_cleanup (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),object_path text UNIQUE NOT NULL,owner_id uuid NOT NULL REFERENCES auth.users(id),channel_id uuid NOT NULL,
 requested_by uuid REFERENCES auth.users(id),reason text NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','processing','done','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),not_before timestamptz NOT NULL DEFAULT now()+interval '24 hours',created_at timestamptz NOT NULL DEFAULT now(),processed_at timestamptz
);
ALTER TABLE public.doodoo_storage_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.doodoo_storage_cleanup FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.doodoo_queue_media_cleanup() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_object_path text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF COALESCE(NEW.metadata->>'deleted','false')<>'true' OR COALESCE(OLD.metadata->>'deleted','false')='true' THEN RETURN NEW;END IF;
 END IF;
 v_object_path=OLD.metadata->>'storagePath';
 IF v_object_path IS NOT NULL AND position('..' IN v_object_path)=0 AND starts_with(v_object_path,OLD.canal_id::text||'/'||OLD.sender_id::text||'/') THEN
  INSERT INTO public.doodoo_storage_cleanup(object_path,owner_id,channel_id,requested_by,reason)
  VALUES(v_object_path,OLD.sender_id,OLD.canal_id,auth.uid(),CASE WHEN TG_OP='DELETE' THEN 'message/channel hard deletion' ELSE 'message soft deletion' END)
  ON CONFLICT(object_path) DO NOTHING;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.doodoo_queue_media_cleanup() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER doodoo_queue_media_delete AFTER DELETE ON public.doodoo_mensagens FOR EACH ROW EXECUTE FUNCTION public.doodoo_queue_media_cleanup();
CREATE TRIGGER doodoo_queue_media_soft_delete AFTER UPDATE OF metadata ON public.doodoo_mensagens FOR EACH ROW EXECUTE FUNCTION public.doodoo_queue_media_cleanup();
COMMIT;
