-- PROPOSAL ONLY. Not a dump of the shared project. DO NOT apply there.
-- Review all inferred types, policies and business rules before authorizing use.
BEGIN;
DO $$ BEGIN
  IF current_setting('doodoo.allow_isolated_setup',true) IS DISTINCT FROM 'reviewed-independent-project' THEN
    RAISE EXCEPTION 'Independent empty project and explicit review required';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public') OR EXISTS(SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'Baseline requires an empty project; shared/populated projects are forbidden';
  END IF;
END $$;
CREATE TABLE public.doodoo_perfis (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id),
 nome text UNIQUE NOT NULL CHECK(length(trim(nome))>0), email text UNIQUE NOT NULL,
 cargo text NOT NULL CHECK(cargo IN('administrador','gestor','coordenador','supervisor','analista','colaborador')),
 setor text NOT NULL, status text NOT NULL DEFAULT 'ativo' CHECK(status IN('ativo','bloqueado')),
 avatar_url text, status_presenca text DEFAULT 'offline', last_seen timestamptz,
 read_receipts boolean NOT NULL DEFAULT true, email_notifications boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.doodoo_permissoes (
 aba_key text PRIMARY KEY, cargos_permitidos jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(cargos_permitidos)='array'),
 usuarios_permitidos jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(usuarios_permitidos)='array')
);
CREATE TABLE public.doodoo_tarefas_categorias(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nome text UNIQUE NOT NULL,cor text NOT NULL DEFAULT '#2563eb',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.doodoo_tarefas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id uuid NOT NULL REFERENCES auth.users(id), titulo text NOT NULL CHECK(length(trim(titulo))>0),
 descricao text NOT NULL DEFAULT '', categoria text DEFAULT 'Geral', prioridade text DEFAULT 'Normal' CHECK(prioridade IN('Normal','Urgente')),
 status text NOT NULL DEFAULT 'pendente' CHECK(status IN('pendente','andamento','bloqueado','concluida')),
 importante boolean NOT NULL DEFAULT false, meu_dia boolean NOT NULL DEFAULT false, rotina boolean NOT NULL DEFAULT false,
 responsavel text NOT NULL REFERENCES public.doodoo_perfis(nome), atribuido_por text NOT NULL REFERENCES public.doodoo_perfis(nome),setor text NOT NULL,
 data_limite text NOT NULL, hora_limite text NOT NULL DEFAULT '17:00',
 etapas jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(etapas)='array'), chat jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(chat)='array'),
 metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object'), created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX doodoo_one_next_occurrence ON public.doodoo_tarefas((metadata->>'clonedFrom')) WHERE metadata ? 'clonedFrom';
CREATE INDEX doodoo_tasks_sector ON public.doodoo_tarefas(setor,status);
CREATE TABLE public.doodoo_canais (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nome text NOT NULL,is_group boolean NOT NULL DEFAULT false,is_direct boolean NOT NULL DEFAULT false,
 setor text NOT NULL DEFAULT 'Todos',membros jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(membros)='array'),foto_url text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.doodoo_mensagens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),canal_id uuid NOT NULL REFERENCES public.doodoo_canais(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES auth.users(id),sender_nome text NOT NULL,texto text NOT NULL,
 tipo text NOT NULL DEFAULT 'text' CHECK(tipo IN('text','image','file','event')),metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX doodoo_messages_channel_date ON public.doodoo_mensagens(canal_id,created_at);
CREATE TABLE public.doodoo_chat_notas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),canal_id uuid NOT NULL REFERENCES public.doodoo_canais(id) ON DELETE CASCADE,
 autor_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),autor_nome text NOT NULL,conteudo text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.doodoo_agenda (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),titulo text NOT NULL,descricao text NOT NULL DEFAULT '',data date NOT NULL,
 hora_inicio time NOT NULL,hora_fim time NOT NULL,CHECK(hora_fim>hora_inicio),local text NOT NULL DEFAULT '',
 visibilidade text NOT NULL CHECK(visibilidade IN('pessoal','setor','geral')),organizador_id uuid NOT NULL REFERENCES auth.users(id),
 organizador_nome text NOT NULL,setor text NOT NULL,aceitos_por jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(aceitos_por)='array'),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.doodoo_notas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),usuario_id uuid NOT NULL REFERENCES auth.users(id),titulo text NOT NULL,conteudo text NOT NULL DEFAULT '',
 cor text NOT NULL DEFAULT 'Geral',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.doodoo_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),autor_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),autor_nome text NOT NULL,
 acao text NOT NULL,detalhes text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
-- Default deny. Operational policies and narrow RPC grants are a separate review.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['doodoo_perfis','doodoo_permissoes','doodoo_tarefas_categorias','doodoo_tarefas','doodoo_canais','doodoo_mensagens','doodoo_chat_notas','doodoo_agenda','doodoo_notas','doodoo_logs'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon,authenticated',t);
 END LOOP;
END $$;
CREATE FUNCTION public.doodoo_touch_version() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN NEW.updated_at=clock_timestamp();RETURN NEW;END $$;
REVOKE ALL ON FUNCTION public.doodoo_touch_version() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['doodoo_perfis','doodoo_tarefas','doodoo_canais','doodoo_mensagens','doodoo_agenda','doodoo_notas'] LOOP
  EXECUTE format('CREATE TRIGGER doodoo_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.doodoo_touch_version()',t);
 END LOOP;
END $$;
COMMENT ON TABLE public.doodoo_tarefas IS 'Doo Doo isolated homologation candidate; not evidence of production schema';
COMMIT;
