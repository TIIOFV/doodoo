-- PROPOSAL ONLY. Creates infrastructure ONLY if later approved on the NEW project.
BEGIN;
DO $$ BEGIN
 IF current_setting('doodoo.allow_isolated_setup',true) IS DISTINCT FROM 'reviewed-independent-project' OR obj_description('public.doodoo_tarefas'::regclass) IS DISTINCT FROM 'Doo Doo isolated homologation candidate; not evidence of production schema' THEN RAISE EXCEPTION 'Reviewed independent baseline required';END IF;
END $$;
INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('chat_midia','chat_midia',false,10485760);
CREATE FUNCTION public.doodoo_storage_channel(object_name text) RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT CASE WHEN split_part(object_name,'/',1) ~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' THEN split_part(object_name,'/',1)::uuid ELSE NULL END $$;
REVOKE ALL ON FUNCTION public.doodoo_storage_channel(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.doodoo_storage_channel(text) TO authenticated;
CREATE POLICY doodoo_media_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='chat_midia' AND public.doodoo_channel_member(public.doodoo_storage_channel(name)));
CREATE POLICY doodoo_media_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='chat_midia' AND split_part(name,'/',2)=auth.uid()::text AND public.doodoo_channel_member(public.doodoo_storage_channel(name)));
CREATE POLICY doodoo_media_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='chat_midia' AND split_part(name,'/',2)=auth.uid()::text AND public.doodoo_channel_member(public.doodoo_storage_channel(name)));
-- No UPDATE policy: uploads use immutable, random paths and upsert:false.
DO $$ DECLARE t text; BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN RAISE EXCEPTION 'Supabase realtime publication must be reviewed';END IF;
 FOREACH t IN ARRAY ARRAY['doodoo_perfis','doodoo_permissoes','doodoo_tarefas','doodoo_canais','doodoo_mensagens','doodoo_agenda','doodoo_notas'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t);END IF;
 END LOOP;
END $$;
COMMIT;
