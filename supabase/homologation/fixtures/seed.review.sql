-- REVIEW ONLY. psql variables AUTH_A/AUTH_B/AUTH_C must be IDs created in NEW Auth.
BEGIN;
DO $$ BEGIN
 IF current_setting('doodoo.allow_isolated_setup',true) IS DISTINCT FROM 'reviewed-independent-project' THEN RAISE EXCEPTION 'Independent project approval required';END IF;
 IF obj_description('public.doodoo_tarefas'::regclass) IS DISTINCT FROM 'Doo Doo isolated homologation candidate; not evidence of production schema' THEN RAISE EXCEPTION 'Independent baseline missing';END IF;
END $$;
INSERT INTO public.doodoo_perfis(user_id,nome,email,cargo,setor) VALUES
 (:'AUTH_A'::uuid,'DOO HOMO Ana','doo-homo-a@example.invalid','administrador','TI'),
 (:'AUTH_B'::uuid,'DOO HOMO Bruno','doo-homo-b@example.invalid','colaborador','TI'),
 (:'AUTH_C'::uuid,'DOO HOMO Carla','doo-homo-c@example.invalid','colaborador','RH');
INSERT INTO public.doodoo_permissoes(aba_key,cargos_permitidos) SELECT name,'["administrador","gestor","coordenador","supervisor","analista","colaborador"]'::jsonb FROM unnest(ARRAY['visao_geral','tarefas','chat','agenda','anotacoes','configuracoes']) name;
INSERT INTO public.doodoo_tarefas_categorias(nome,cor) VALUES('Geral','#2563eb');
INSERT INTO public.doodoo_tarefas(id,usuario_id,titulo,setor,responsavel,atribuido_por,data_limite,rotina,metadata) VALUES('a3000000-0000-4000-8000-000000000001',:'AUTH_A','[HOMO fixture] Rotina semanal','TI','DOO HOMO Bruno','DOO HOMO Ana',to_char(current_date,'DD/MM/YYYY'),true,'{"fixture":"phase-3-seed"}');
INSERT INTO public.doodoo_canais(id,nome,is_group,setor,membros) VALUES('a3000000-0000-4000-8000-000000000002','[HOMO fixture] Equipe',true,'TI',jsonb_build_array(jsonb_build_object('user_id',:'AUTH_A','name','DOO HOMO Ana','role','administrador','isAdmin',true),jsonb_build_object('user_id',:'AUTH_B','name','DOO HOMO Bruno','role','colaborador','isAdmin',false)));
INSERT INTO public.doodoo_agenda(id,titulo,data,hora_inicio,hora_fim,visibilidade,organizador_id,organizador_nome,setor,aceitos_por) VALUES('a3000000-0000-4000-8000-000000000003','[HOMO fixture] Reunião',current_date,'10:00','11:00','setor',:'AUTH_A','DOO HOMO Ana','TI',jsonb_build_array('DOO HOMO Ana'));
INSERT INTO public.doodoo_notas(id,usuario_id,titulo,conteudo) VALUES('a3000000-0000-4000-8000-000000000004',:'AUTH_A','[HOMO fixture] Nota privada','Dado sintético descartável.');
COMMIT;
