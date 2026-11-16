-- PROPOSAL ONLY. Security/business review and isolated PostgreSQL execution are pending.
BEGIN;
DO $$ BEGIN
 IF current_setting('doodoo.allow_isolated_setup',true) IS DISTINCT FROM 'reviewed-independent-project' OR obj_description('public.doodoo_tarefas'::regclass) IS DISTINCT FROM 'Doo Doo isolated homologation candidate; not evidence of production schema' THEN RAISE EXCEPTION 'Reviewed independent baseline required';END IF;
END $$;
CREATE FUNCTION public.doodoo_identity() RETURNS public.doodoo_perfis LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT p FROM public.doodoo_perfis p WHERE p.user_id=auth.uid() AND p.status='ativo' $$;
CREATE FUNCTION public.doodoo_manager(sector text,role_name text DEFAULT 'colaborador') RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE(p.cargo='administrador' OR(p.cargo IN('gestor','coordenador') AND p.setor=sector AND role_name<>'administrador'),false) FROM public.doodoo_identity() p
$$;
CREATE FUNCTION public.doodoo_channel_member(channel_id uuid,admin_only boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.doodoo_has_access('chat') AND EXISTS(SELECT 1 FROM public.doodoo_canais c,jsonb_array_elements(c.membros) m WHERE c.id=channel_id AND m->>'user_id'=auth.uid()::text AND(NOT admin_only OR m->>'isAdmin'='true'))
$$;
REVOKE ALL ON FUNCTION public.doodoo_identity(),public.doodoo_manager(text,text),public.doodoo_channel_member(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.doodoo_identity(),public.doodoo_manager(text,text),public.doodoo_channel_member(uuid,boolean) TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.doodoo_perfis,public.doodoo_permissoes,public.doodoo_tarefas_categorias,public.doodoo_tarefas,public.doodoo_canais,public.doodoo_mensagens,public.doodoo_chat_notas,public.doodoo_agenda,public.doodoo_notas TO authenticated;
GRANT SELECT,INSERT ON public.doodoo_logs TO authenticated;
CREATE POLICY profiles_read ON public.doodoo_perfis FOR SELECT TO authenticated USING(user_id=auth.uid() OR setor=(public.doodoo_identity()).setor OR(public.doodoo_identity()).cargo='administrador');
CREATE POLICY profiles_create ON public.doodoo_perfis FOR INSERT TO authenticated WITH CHECK(public.doodoo_has_access('configuracoes') AND public.doodoo_manager(setor,cargo) AND user_id<>auth.uid());
CREATE POLICY profiles_update ON public.doodoo_perfis FOR UPDATE TO authenticated USING(user_id=auth.uid() OR(public.doodoo_has_access('configuracoes') AND public.doodoo_manager(setor,cargo))) WITH CHECK(user_id=auth.uid() OR(public.doodoo_has_access('configuracoes') AND public.doodoo_manager(setor,cargo)));
CREATE POLICY profiles_delete ON public.doodoo_perfis FOR DELETE TO authenticated USING(user_id<>auth.uid() AND public.doodoo_has_access('configuracoes') AND public.doodoo_manager(setor,cargo));
CREATE FUNCTION public.doodoo_guard_profile() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.user_id<>OLD.user_id OR NEW.id<>OLD.id OR NEW.email<>OLD.email OR NEW.nome<>OLD.nome THEN RAISE EXCEPTION 'Identity fields are immutable';END IF;
 IF OLD.user_id=auth.uid() AND(NEW.cargo<>OLD.cargo OR NEW.setor<>OLD.setor OR NEW.status<>OLD.status) THEN RAISE EXCEPTION 'Self privilege/status changes forbidden' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER doodoo_guard_profile BEFORE UPDATE ON public.doodoo_perfis FOR EACH ROW EXECUTE FUNCTION public.doodoo_guard_profile();
CREATE POLICY permissions_read ON public.doodoo_permissoes FOR SELECT TO authenticated USING((public.doodoo_identity()).user_id IS NOT NULL);
CREATE POLICY permissions_manage ON public.doodoo_permissoes FOR ALL TO authenticated USING((public.doodoo_identity()).cargo='administrador' AND public.doodoo_has_access('configuracoes')) WITH CHECK((public.doodoo_identity()).cargo='administrador' AND public.doodoo_has_access('configuracoes'));
CREATE POLICY categories_read ON public.doodoo_tarefas_categorias FOR SELECT TO authenticated USING((public.doodoo_identity()).user_id IS NOT NULL);
CREATE POLICY categories_manage ON public.doodoo_tarefas_categorias FOR ALL TO authenticated USING(public.doodoo_has_access('configuracoes') AND public.doodoo_manager((public.doodoo_identity()).setor)) WITH CHECK(public.doodoo_has_access('configuracoes') AND public.doodoo_manager((public.doodoo_identity()).setor));
CREATE POLICY tasks_read ON public.doodoo_tarefas FOR SELECT TO authenticated USING(public.doodoo_has_access('tarefas') AND setor=(public.doodoo_identity()).setor AND(responsavel=(public.doodoo_identity()).nome OR atribuido_por=(public.doodoo_identity()).nome OR public.doodoo_manager(setor)));
CREATE POLICY tasks_create ON public.doodoo_tarefas FOR INSERT TO authenticated WITH CHECK(public.doodoo_has_access('tarefas') AND usuario_id=auth.uid() AND setor=(public.doodoo_identity()).setor AND atribuido_por=(public.doodoo_identity()).nome AND NOT(metadata?'clonedFrom') AND chat='[]'::jsonb AND status='pendente' AND EXISTS(SELECT 1 FROM public.doodoo_perfis p WHERE p.nome=doodoo_tarefas.responsavel AND p.setor=doodoo_tarefas.setor AND p.status='ativo'));
CREATE POLICY tasks_update ON public.doodoo_tarefas FOR UPDATE TO authenticated USING(public.doodoo_has_access('tarefas') AND setor=(public.doodoo_identity()).setor AND(responsavel=(public.doodoo_identity()).nome OR atribuido_por=(public.doodoo_identity()).nome OR public.doodoo_manager(setor))) WITH CHECK(public.doodoo_has_access('tarefas') AND setor=(public.doodoo_identity()).setor);
CREATE POLICY tasks_delete ON public.doodoo_tarefas FOR DELETE TO authenticated USING(public.doodoo_has_access('tarefas') AND setor=(public.doodoo_identity()).setor AND(atribuido_por=(public.doodoo_identity()).nome OR public.doodoo_manager(setor)));
CREATE FUNCTION public.doodoo_guard_task() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p public.doodoo_perfis;c jsonb;
BEGIN
 SELECT * INTO p FROM public.doodoo_identity();
 IF NEW.id<>OLD.id OR NEW.usuario_id<>OLD.usuario_id OR NEW.atribuido_por<>OLD.atribuido_por OR NEW.setor<>OLD.setor OR NEW.created_at<>OLD.created_at OR NEW.metadata->>'clonedFrom' IS DISTINCT FROM OLD.metadata->>'clonedFrom' THEN RAISE EXCEPTION 'Task identity is immutable';END IF;
 IF NOT(p.nome=OLD.atribuido_por OR public.doodoo_manager(OLD.setor)) AND(NEW.titulo<>OLD.titulo OR NEW.descricao<>OLD.descricao OR NEW.responsavel<>OLD.responsavel OR NEW.prioridade<>OLD.prioridade OR NEW.rotina<>OLD.rotina) THEN RAISE EXCEPTION 'Only creator/manager may change assignment';END IF;
 IF current_user='authenticated' AND OLD.rotina AND OLD.status<>'concluida' AND NEW.status='concluida' THEN RAISE EXCEPTION 'Use atomic routine RPC';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.doodoo_perfis WHERE nome=NEW.responsavel AND setor=NEW.setor AND status='ativo') THEN RAISE EXCEPTION 'Assignee must be active in task sector';END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(OLD.chat) LOOP
  IF c->>'authorId' IS DISTINCT FROM auth.uid()::text AND NOT NEW.chat @> jsonb_build_array(c) THEN RAISE EXCEPTION 'Cannot change another author or legacy comment';END IF;
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(NEW.chat) LOOP
  IF NOT OLD.chat @> jsonb_build_array(c) AND(c->>'authorId' IS DISTINCT FROM auth.uid()::text OR c->>'author' IS DISTINCT FROM p.nome) THEN RAISE EXCEPTION 'Verified authorship required';END IF;
 END LOOP;
 IF(SELECT count(*)<>count(DISTINCT value->>'id') FROM jsonb_array_elements(NEW.chat)) THEN RAISE EXCEPTION 'Duplicate/missing comment identity';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER doodoo_guard_task BEFORE UPDATE ON public.doodoo_tarefas FOR EACH ROW EXECUTE FUNCTION public.doodoo_guard_task();
CREATE POLICY channels_read ON public.doodoo_canais FOR SELECT TO authenticated USING(public.doodoo_channel_member(id) OR(public.doodoo_has_access('chat') AND nome='Geral' AND setor='Todos') OR(public.doodoo_has_access('configuracoes') AND(public.doodoo_identity()).cargo='administrador'));
CREATE POLICY channels_create ON public.doodoo_canais FOR INSERT TO authenticated WITH CHECK(public.doodoo_has_access('chat') AND membros @> jsonb_build_array(jsonb_build_object('user_id',auth.uid()::text,'isAdmin',true)));
CREATE POLICY channels_update ON public.doodoo_canais FOR UPDATE TO authenticated USING(public.doodoo_channel_member(id) OR(nome='Geral' AND setor='Todos' AND public.doodoo_has_access('chat'))) WITH CHECK(public.doodoo_has_access('chat'));
CREATE POLICY channels_delete ON public.doodoo_canais FOR DELETE TO authenticated USING(nome<>'Geral' AND(public.doodoo_channel_member(id,true) OR(public.doodoo_has_access('configuracoes') AND(public.doodoo_identity()).cargo='administrador')));
CREATE FUNCTION public.doodoo_guard_channel() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE expected jsonb;p public.doodoo_perfis;
BEGIN
 SELECT * INTO p FROM public.doodoo_identity();
 IF NEW.id<>OLD.id OR NEW.nome<>OLD.nome OR NEW.setor<>OLD.setor OR NEW.is_group<>OLD.is_group OR NEW.is_direct<>OLD.is_direct THEN RAISE EXCEPTION 'Channel identity immutable';END IF;
 IF NOT public.doodoo_channel_member(OLD.id,true) THEN
  SELECT COALESCE(jsonb_agg(m ORDER BY ordinal),'[]'::jsonb) INTO expected FROM jsonb_array_elements(OLD.membros) WITH ORDINALITY x(m,ordinal) WHERE m->>'user_id'<>auth.uid()::text;
  IF NEW.foto_url IS DISTINCT FROM OLD.foto_url OR NOT(NEW.membros=expected OR(OLD.nome='Geral' AND OLD.setor='Todos' AND NEW.membros=OLD.membros||jsonb_build_array(jsonb_build_object('user_id',p.user_id,'name',p.nome,'role',p.cargo,'isAdmin',p.cargo='administrador')))) THEN RAISE EXCEPTION 'Only administrator may manage other members';END IF;
 END IF;
 IF jsonb_array_length(NEW.membros)>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.membros) m WHERE m->>'isAdmin'='true') THEN RAISE EXCEPTION 'Keep at least one administrator';END IF;
 IF(SELECT count(*)<>count(DISTINCT m->>'user_id') FROM jsonb_array_elements(NEW.membros) m) THEN RAISE EXCEPTION 'Duplicate/missing member identity';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.membros) m WHERE NOT EXISTS(SELECT 1 FROM public.doodoo_perfis WHERE user_id::text=m->>'user_id' AND nome=m->>'name' AND status='ativo')) THEN RAISE EXCEPTION 'Invalid member identity';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER doodoo_guard_channel BEFORE UPDATE ON public.doodoo_canais FOR EACH ROW EXECUTE FUNCTION public.doodoo_guard_channel();
CREATE FUNCTION public.doodoo_validate_channel_insert() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $ BEGIN
 IF jsonb_array_length(NEW.membros)=0 OR(SELECT count(*)<>count(DISTINCT m->>'user_id') FROM jsonb_array_elements(NEW.membros) m) THEN RAISE EXCEPTION 'Invalid/duplicate initial members';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.membros) m WHERE jsonb_typeof(m->'isAdmin') IS DISTINCT FROM 'boolean' OR NOT EXISTS(SELECT 1 FROM public.doodoo_perfis p WHERE p.user_id::text=m->>'user_id' AND p.nome=m->>'name' AND p.cargo=m->>'role' AND p.status='ativo')) THEN RAISE EXCEPTION 'Invalid member identity';END IF;
 RETURN NEW;
END $;
CREATE TRIGGER doodoo_validate_channel_insert BEFORE INSERT ON public.doodoo_canais FOR EACH ROW EXECUTE FUNCTION public.doodoo_validate_channel_insert();
REVOKE ALL ON FUNCTION public.doodoo_validate_channel_insert() FROM PUBLIC,anon,authenticated;
CREATE POLICY messages_read ON public.doodoo_mensagens FOR SELECT TO authenticated USING(public.doodoo_channel_member(canal_id) OR(public.doodoo_has_access('configuracoes') AND(public.doodoo_identity()).cargo='administrador'));
CREATE POLICY messages_create ON public.doodoo_mensagens FOR INSERT TO authenticated WITH CHECK(public.doodoo_channel_member(canal_id) AND sender_id=auth.uid() AND sender_nome=(public.doodoo_identity()).nome AND COALESCE(metadata->'lidoPor','[]'::jsonb)<@jsonb_build_array((public.doodoo_identity()).nome) AND COALESCE(metadata->'acceptedBy','[]'::jsonb)<@jsonb_build_array((public.doodoo_identity()).nome));
CREATE POLICY messages_update ON public.doodoo_mensagens FOR UPDATE TO authenticated USING(public.doodoo_channel_member(canal_id)) WITH CHECK(public.doodoo_channel_member(canal_id));
CREATE POLICY messages_delete ON public.doodoo_mensagens FOR DELETE TO authenticated USING(public.doodoo_has_access('configuracoes') AND(public.doodoo_identity()).cargo='administrador');
CREATE FUNCTION public.doodoo_guard_message() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE me text;field text;before_names jsonb;after_names jsonb;
BEGIN
 me=(public.doodoo_identity()).nome;
 IF NEW.id<>OLD.id OR NEW.canal_id<>OLD.canal_id OR NEW.sender_id<>OLD.sender_id OR NEW.sender_nome<>OLD.sender_nome OR NEW.texto<>OLD.texto OR NEW.tipo<>OLD.tipo OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Message identity/content immutable';END IF;
 IF (NEW.metadata-'lidoPor'-'acceptedBy'-'deleted') IS DISTINCT FROM(OLD.metadata-'lidoPor'-'acceptedBy'-'deleted') OR(NEW.metadata->'deleted' IS DISTINCT FROM OLD.metadata->'deleted' AND(OLD.sender_id<>auth.uid() OR NEW.metadata->>'deleted'<>'true')) THEN RAISE EXCEPTION 'Cannot change message metadata';END IF;
 FOREACH field IN ARRAY ARRAY['lidoPor','acceptedBy'] LOOP
  before_names=COALESCE(OLD.metadata->field,'[]'::jsonb);after_names=COALESCE(NEW.metadata->field,'[]'::jsonb);
  IF jsonb_typeof(after_names)<>'array' OR NOT after_names @> before_names OR NOT(before_names||jsonb_build_array(me)) @> after_names THEN RAISE EXCEPTION 'Only own read/acceptance may be appended';END IF;
 END LOOP;RETURN NEW;
END $$;
CREATE TRIGGER doodoo_guard_message BEFORE UPDATE ON public.doodoo_mensagens FOR EACH ROW EXECUTE FUNCTION public.doodoo_guard_message();
CREATE POLICY chat_notes_read ON public.doodoo_chat_notas FOR SELECT TO authenticated USING(public.doodoo_channel_member(canal_id));
CREATE POLICY chat_notes_create ON public.doodoo_chat_notas FOR INSERT TO authenticated WITH CHECK(public.doodoo_channel_member(canal_id) AND autor_id=auth.uid() AND autor_nome=(public.doodoo_identity()).nome);
CREATE POLICY chat_notes_delete ON public.doodoo_chat_notas FOR DELETE TO authenticated USING(autor_id=auth.uid() OR(public.doodoo_has_access('configuracoes') AND(public.doodoo_identity()).cargo='administrador'));
CREATE POLICY agenda_read ON public.doodoo_agenda FOR SELECT TO authenticated USING(public.doodoo_has_access('agenda') AND(organizador_id=auth.uid() OR visibilidade='geral' OR(visibilidade='setor' AND setor=(public.doodoo_identity()).setor)));
CREATE POLICY agenda_create ON public.doodoo_agenda FOR INSERT TO authenticated WITH CHECK(public.doodoo_has_access('agenda') AND organizador_id=auth.uid() AND organizador_nome=(public.doodoo_identity()).nome AND setor=(public.doodoo_identity()).setor AND aceitos_por=jsonb_build_array((public.doodoo_identity()).nome));
CREATE POLICY agenda_update ON public.doodoo_agenda FOR UPDATE TO authenticated USING(public.doodoo_has_access('agenda') AND organizador_id=auth.uid()) WITH CHECK(organizador_id=auth.uid() AND setor=(public.doodoo_identity()).setor);
CREATE POLICY agenda_delete ON public.doodoo_agenda FOR DELETE TO authenticated USING(public.doodoo_has_access('agenda') AND organizador_id=auth.uid());
CREATE FUNCTION public.doodoo_guard_event() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.id<>OLD.id OR NEW.organizador_id<>OLD.organizador_id OR NEW.organizador_nome<>OLD.organizador_nome OR NEW.setor<>OLD.setor THEN RAISE EXCEPTION 'Event identity immutable';END IF;
 IF current_user='authenticated' AND NEW.aceitos_por IS DISTINCT FROM OLD.aceitos_por THEN RAISE EXCEPTION 'Use atomic acceptance RPC';END IF;RETURN NEW;
END $$;
CREATE TRIGGER doodoo_guard_event BEFORE UPDATE ON public.doodoo_agenda FOR EACH ROW EXECUTE FUNCTION public.doodoo_guard_event();
CREATE POLICY notes_owner ON public.doodoo_notas FOR ALL TO authenticated USING(public.doodoo_has_access('anotacoes') AND usuario_id=auth.uid()) WITH CHECK(public.doodoo_has_access('anotacoes') AND usuario_id=auth.uid());
CREATE POLICY logs_read ON public.doodoo_logs FOR SELECT TO authenticated USING(public.doodoo_has_access('configuracoes') AND (public.doodoo_identity()).cargo='administrador');
CREATE POLICY logs_insert ON public.doodoo_logs FOR INSERT TO authenticated WITH CHECK(autor_id=auth.uid() AND autor_nome=(public.doodoo_identity()).nome);
REVOKE ALL ON FUNCTION public.doodoo_guard_profile(),public.doodoo_guard_task(),public.doodoo_guard_channel(),public.doodoo_guard_message(),public.doodoo_guard_event() FROM PUBLIC,anon,authenticated;
-- The bucket/publication setup is intentionally separate and still requires review.
COMMIT;
