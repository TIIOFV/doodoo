-- PROPOSAL ONLY: reviewed independent baseline required. Never apply to shared Iris.
BEGIN;
DO $$ BEGIN
 IF current_setting('doodoo.allow_isolated_setup',true) IS DISTINCT FROM 'reviewed-independent-project' THEN RAISE EXCEPTION 'Independent project review required';END IF;
 IF obj_description('public.doodoo_tarefas'::regclass) IS DISTINCT FROM 'Doo Doo isolated homologation candidate; not evidence of production schema' THEN RAISE EXCEPTION 'Candidate baseline marker missing';END IF;
END $$;
CREATE FUNCTION public.doodoo_has_access(p_tab text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.doodoo_perfis p JOIN public.doodoo_permissoes a ON a.aba_key=p_tab
 WHERE p.user_id=auth.uid() AND p.status='ativo' AND (a.cargos_permitidos ? p.cargo OR a.usuarios_permitidos ? p.user_id::text));
$$;
REVOKE ALL ON FUNCTION public.doodoo_has_access(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.doodoo_has_access(text) TO authenticated;
CREATE FUNCTION public.doodoo_complete_routine(p_task_id uuid,p_final_steps jsonb DEFAULT NULL,p_expected_steps jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.doodoo_perfis;t public.doodoo_tarefas;n public.doodoo_tarefas;d date;done boolean;
BEGIN
 SELECT * INTO p FROM public.doodoo_perfis WHERE user_id=auth.uid() AND status='ativo';
 IF p.user_id IS NULL OR NOT public.doodoo_has_access('tarefas') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM public.doodoo_tarefas WHERE id=p_task_id FOR UPDATE;
 IF t.id IS NULL OR NOT t.rotina OR t.setor<>p.setor OR NOT(t.responsavel=p.nome OR t.atribuido_por=p.nome OR p.cargo IN('administrador','gestor','coordenador')) THEN RAISE EXCEPTION 'Routine not available' USING ERRCODE='42501';END IF;
 IF p_final_steps IS NOT NULL THEN
  IF jsonb_typeof(p_final_steps)<>'array' OR p_expected_steps IS NULL OR p_expected_steps IS DISTINCT FROM t.etapas THEN RAISE EXCEPTION 'Checklist changed; refresh before retry' USING ERRCODE='40001';END IF;
  SELECT COALESCE(bool_and(COALESCE((s->>'done')::boolean,false)),false) INTO done FROM jsonb_array_elements(p_final_steps) s;
 ELSE done=true;END IF;
 SELECT * INTO n FROM public.doodoo_tarefas WHERE metadata->>'clonedFrom'=t.id::text;
 IF n.id IS NOT NULL THEN
  IF p_final_steps IS NOT NULL AND p_final_steps IS DISTINCT FROM t.etapas THEN RAISE EXCEPTION 'Occurrence already closed';END IF;
  RETURN jsonb_build_object('task',to_jsonb(t),'next_task',to_jsonb(n));
 END IF;
 -- Invalid dates abort the transaction instead of silently changing the recurrence date.
 IF done THEN d=to_date(t.data_limite,'DD/MM/YYYY');IF to_char(d,'DD/MM/YYYY')<>t.data_limite THEN RAISE EXCEPTION 'Invalid recurrence date';END IF;END IF;
 UPDATE public.doodoo_tarefas SET etapas=COALESCE(p_final_steps,etapas),status=CASE WHEN done THEN 'concluida' WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(p_final_steps) s WHERE (s->>'done')::boolean) THEN 'andamento' ELSE 'pendente' END WHERE id=t.id RETURNING * INTO t;
 IF done THEN
  INSERT INTO public.doodoo_tarefas(usuario_id,titulo,descricao,categoria,prioridade,status,importante,meu_dia,rotina,responsavel,setor,atribuido_por,data_limite,hora_limite,etapas,chat,metadata)
  VALUES(t.usuario_id,t.titulo,t.descricao,t.categoria,t.prioridade,'pendente',t.importante,false,true,t.responsavel,t.setor,t.atribuido_por,to_char(d+7,'DD/MM/YYYY'),t.hora_limite,
   COALESCE((SELECT jsonb_agg(s||jsonb_build_object('done',false) ORDER BY ordinal) FROM jsonb_array_elements(t.etapas) WITH ORDINALITY x(s,ordinal)),'[]'::jsonb),'[]',jsonb_build_object('clonedFrom',t.id::text)) RETURNING * INTO n;
 END IF;
 RETURN jsonb_build_object('task',to_jsonb(t),'next_task',CASE WHEN n.id IS NULL THEN NULL ELSE to_jsonb(n) END);
END $$;
REVOKE ALL ON FUNCTION public.doodoo_complete_routine(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.doodoo_complete_routine(uuid,jsonb,jsonb) TO authenticated;
CREATE FUNCTION public.doodoo_accept_event(p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.doodoo_perfis;e public.doodoo_agenda;
BEGIN
 SELECT * INTO p FROM public.doodoo_perfis WHERE user_id=auth.uid() AND status='ativo';
 IF p.user_id IS NULL OR NOT public.doodoo_has_access('agenda') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';END IF;
 SELECT * INTO e FROM public.doodoo_agenda WHERE id=p_event_id FOR UPDATE;
 IF e.id IS NULL OR NOT(e.organizador_id=p.user_id OR e.visibilidade='geral' OR(e.visibilidade='setor' AND e.setor=p.setor)) THEN RAISE EXCEPTION 'Event not available' USING ERRCODE='42501';END IF;
 IF NOT e.aceitos_por @> jsonb_build_array(p.nome) THEN UPDATE public.doodoo_agenda SET aceitos_por=aceitos_por||jsonb_build_array(p.nome) WHERE id=e.id RETURNING * INTO e;END IF;
 RETURN to_jsonb(e);
END $$;
REVOKE ALL ON FUNCTION public.doodoo_accept_event(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.doodoo_accept_event(uuid) TO authenticated;
CREATE FUNCTION public.doodoo_update_task_comment(p_task_id uuid,p_comment_id text,p_action text,p_text text DEFAULT NULL,p_expected_text text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.doodoo_perfis;t public.doodoo_tarefas;c jsonb;replacement jsonb;
BEGIN
 SELECT * INTO p FROM public.doodoo_perfis WHERE user_id=auth.uid() AND status='ativo';
 IF p.user_id IS NULL OR NOT public.doodoo_has_access('tarefas') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM public.doodoo_tarefas WHERE id=p_task_id FOR UPDATE;
 IF t.id IS NULL OR t.setor<>p.setor OR NOT(t.responsavel=p.nome OR t.atribuido_por=p.nome OR p.cargo IN('administrador','gestor','coordenador')) THEN RAISE EXCEPTION 'Task not available' USING ERRCODE='42501';END IF;
 SELECT value INTO c FROM jsonb_array_elements(t.chat) WHERE value->>'id'=p_comment_id;
 IF c IS NULL OR c->>'authorId' IS DISTINCT FROM p.user_id::text THEN RAISE EXCEPTION 'Verified authorship required' USING ERRCODE='42501';END IF;
 IF c->>'text' IS DISTINCT FROM p_expected_text THEN RAISE EXCEPTION 'Comment changed' USING ERRCODE='40001';END IF;
 IF p_action='edit' AND length(trim(COALESCE(p_text,''))) BETWEEN 1 AND 10000 THEN replacement=c||jsonb_build_object('text',trim(p_text),'editedAt',clock_timestamp());
 ELSIF p_action='delete' THEN replacement=NULL;
 ELSE RAISE EXCEPTION 'Invalid comment action';END IF;
 UPDATE public.doodoo_tarefas SET chat=COALESCE((SELECT jsonb_agg(CASE WHEN value->>'id'=p_comment_id THEN replacement ELSE value END ORDER BY ordinal) FROM jsonb_array_elements(chat) WITH ORDINALITY x(value,ordinal) WHERE value->>'id'<>p_comment_id OR replacement IS NOT NULL),'[]'::jsonb) WHERE id=t.id RETURNING * INTO t;
 RETURN to_jsonb(t);
END $$;
REVOKE ALL ON FUNCTION public.doodoo_update_task_comment(uuid,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.doodoo_update_task_comment(uuid,text,text,text,text) TO authenticated;
COMMIT;
