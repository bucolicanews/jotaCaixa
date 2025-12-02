CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.route_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  user_role TEXT;
  user_nome TEXT;
  p_proprietario_id UUID;
  p_plano_id UUID;
  p_permissoes JSONB;
  p_limite_usuarios INTEGER;
  v_admin_id UUID;
  
  v_salario NUMERIC := 0.00;
  v_horas_semanais INTEGER := 44;
  v_horas_mensais INTEGER := 220;
  v_dias_folga_fixos TEXT[] := '{}'::text[];
  v_folga_domingo_obrigatoria BOOLEAN := TRUE;
  v_permissoes_usuario JSONB := '{"visualizar_proprio_ponto": true}'::jsonb;
  
  v_is_proprietario_admin BOOLEAN := FALSE;
BEGIN
  user_role := COALESCE(new.raw_user_meta_data ->> 'role', 'Cliente');
  user_nome := COALESCE(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1));
  
  BEGIN p_proprietario_id := (new.raw_user_meta_data ->> 'proprietario_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN p_proprietario_id := NULL; END;
  BEGIN p_plano_id := (new.raw_user_meta_data ->> 'plano_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN p_plano_id := NULL; END;
  BEGIN p_permissoes := (new.raw_user_meta_data ->> 'permissoes')::jsonb; EXCEPTION WHEN others THEN p_permissoes := NULL; END;
  p_limite_usuarios := COALESCE((new.raw_user_meta_data ->> 'limite_usuarios')::integer, 5);

  SELECT id INTO v_admin_id FROM public.tbl_admins LIMIT 1;

  IF user_role = 'Admin' THEN
    INSERT INTO public.tbl_admins (id, nome, email) VALUES (new.id, user_nome, new.email);
  ELSIF user_role = 'Cliente' THEN
    INSERT INTO public.tbl_clientes (id, nome, email, aprovado, permissoes, plano_id, limite_usuarios, admin_id, data_fim_acesso)
    VALUES (
        new.id,
        user_nome,
        new.email,
        COALESCE((new.raw_user_meta_data ->> 'aprovado')::boolean, p_plano_id IS NOT NULL),
        COALESCE(p_permissoes, '{"bancos": true, "importar": true, "relatorios": true, "conciliacao": true, "contas_pagar": true, "plano_contas": true, "configuracoes": true, "contas_receber": true, "ponto_eletronico": true}'::jsonb),
        p_plano_id,
        p_limite_usuarios,
        v_admin_id,
        (new.raw_user_meta_data ->> 'data_fim_acesso')::timestamp with time zone
    );
  ELSIF user_role = 'Usuario' THEN
    -- Verifica se o proprietário é um Admin (p_proprietario_id é o admin_id passado pelo frontend)
    IF p_proprietario_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.tbl_admins WHERE id = p_proprietario_id) THEN
        v_is_proprietario_admin := TRUE;
    END IF;

    IF v_is_proprietario_admin THEN
        -- Roteia para admin_usuarios (Usuário do Admin)
        INSERT INTO public.admin_usuarios (
            id, 
            admin_id, 
            nome, 
            email, 
            salario, 
            horas_semanais, 
            horas_mensais, 
            dias_folga_fixos, 
            folga_domingo_obrigatoria,
            permissoes
        ) 
        VALUES (
            new.id, 
            p_proprietario_id, -- ID do Admin
            user_nome, 
            new.email, 
            v_salario, 
            v_horas_semanais, 
            v_horas_mensais, 
            v_dias_folga_fixos, 
            v_folga_domingo_obrigatoria,
            COALESCE(p_permissoes, v_permissoes_usuario) -- Usa permissões passadas ou o padrão
        );
    ELSE
     
        INSERT INTO public.tbl_usuarios (
            id, 
            nome, 
            email, 
            cliente_id, 
            salario, 
            horas_semanais, 
            horas_mensais, 
            dias_folga_fixos, 
            folga_domingo_obrigatoria,
            permissoes
        ) 
        VALUES (
            new.id, 
            user_nome, 
            new.email, 
            p_proprietario_id, -- ID do Cliente
            v_salario, 
            v_horas_semanais, 
            v_horas_mensais, 
            v_dias_folga_fixos, 
            v_folga_domingo_obrigatoria,
            COALESCE(p_permissoes, v_permissoes_usuario) -- Usa permissões passadas ou o padrão
        );
    END IF;
  ELSE
    RAISE EXCEPTION 'Papel de usuário inválido: %', user_role;
  END IF;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_admin_id_on_client_creation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  
  IF EXISTS (SELECT 1 FROM public.tbl_admins WHERE id = auth.uid()) THEN
    NEW.admin_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

-- Função para sincronizar branding do Admin nos usuários subordinados
CREATE OR REPLACE FUNCTION public.set_admin_branding_on_user_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_admin_logo TEXT;
  v_admin_nome TEXT;
BEGIN
  -- Busca o logo e nome do Admin usando o admin_id
  SELECT logo_url, nome INTO v_admin_logo, v_admin_nome
  FROM public.tbl_admins
  WHERE id = NEW.admin_id;

  -- Define os novos valores
  NEW.logo_admin := v_admin_logo;
  NEW.nome_admin := v_admin_nome;

  RETURN NEW;
END;
$function$;

-- Função para sincronizar branding do Cliente CR (usado em Contas a Receber)
CREATE OR REPLACE FUNCTION public.sync_client_branding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- 1. Garante que o registro exista na tabela 'clientes' (se não existir, insere)
  INSERT INTO public.clientes (id, proprietario_id, nome, email, is_system_client)
  VALUES (NEW.id, NEW.admin_id, NEW.nome, NEW.email, TRUE)
  ON CONFLICT (id) DO UPDATE SET
    proprietario_id = NEW.admin_id,
    nome = NEW.nome,
    email = NEW.email,
    is_system_client = TRUE;

  -- 2. Atualiza o branding na tabela 'clientes'
  UPDATE public.clientes
  SET
    logo_url = NEW.logo_url,
    nome_proprietario = NEW.nome
  WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;

-- =================================================================
-- 2. CRIAÇÃO DAS TABELAS PRINCIPAIS
-- =================================================================

-- Tabela de Administradores
CREATE TABLE public.tbl_admins (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  avatar_url TEXT,
  cpf TEXT,
  cnpj TEXT,
  rg TEXT,
  nome_mae TEXT,
  nome_pai TEXT,
  telefone TEXT,
  cep TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  logo_url TEXT,
  assinatura_proprietario_nome TEXT,
  assinatura_proprietario_url TEXT
);
ALTER TABLE public.tbl_admins ENABLE ROW LEVEL SECURITY;

-- Tabela de Clientes (Empresas do Sistema)
CREATE TABLE public.tbl_clientes (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  limite_usuarios INTEGER NOT NULL DEFAULT 5,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  aprovado BOOLEAN NOT NULL DEFAULT FALSE,
  permissoes JSONB NOT NULL DEFAULT '{"bancos": true, "importar": true, "relatorios": true, "conciliacao": true, "contas_pagar": true, "plano_contas": true, "configuracoes": true, "contas_receber": true, "ponto_eletronico": true}'::jsonb,
  avatar_url TEXT,
  cpf TEXT,
  rg TEXT,
  nome_mae TEXT,
  nome_pai TEXT,
  telefone TEXT,
  cep TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  admin_id UUID REFERENCES public.tbl_admins(id) ON DELETE SET NULL,
  tipo_cliente TEXT,
  plano_id UUID,
  data_fim_acesso TIMESTAMP WITH TIME ZONE,
  cliente_id_promovido UUID,
  razao_social TEXT,
  nome_fantasia TEXT,
  documento TEXT,
  logo_url TEXT,
  cnpj TEXT,
  assinatura_proprietario_nome TEXT,
  assinatura_proprietario_url TEXT
);
ALTER TABLE public.tbl_clientes ENABLE ROW LEVEL SECURITY;

-- Tabela de Usuários (Funcionários de Clientes)
CREATE TABLE public.tbl_usuarios (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  cliente_id UUID REFERENCES public.tbl_clientes(id) ON DELETE CASCADE,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  permissoes JSONB DEFAULT '{"visualizar_proprio_ponto": true}'::jsonb,
  salario NUMERIC DEFAULT 0.00,
  horas_semanais INTEGER DEFAULT 44,
  horas_mensais INTEGER DEFAULT 220,
  dias_folga_fixos TEXT[] DEFAULT '{}'::text[],
  folga_domingo_obrigatoria BOOLEAN DEFAULT TRUE,
  data_inicio_contrato DATE,
  data_fim_contrato DATE,
  data_inicio_aviso DATE,
  tipo_aviso TEXT,
  rg_url TEXT,
  cpf_url TEXT,
  titulo_eleitor_url TEXT,
  reservista_url TEXT,
  ctps_url TEXT,
  certidao_nascimento_url TEXT,
  certidao_casamento_url TEXT,
  comprovante_residencia_url TEXT,
  comprovante_escolaridade_url TEXT,
  exame_admissional_url TEXT,
  foto_3x4_url TEXT,
  cnh_url TEXT,
  cartao_pis_url TEXT,
  ja_admitido_anteriormente BOOLEAN DEFAULT FALSE,
  certidoes_filhos_urls JSONB DEFAULT '[]'::jsonb,
  avatar_url TEXT,
  cpf TEXT,
  rg TEXT,
  nome_mae TEXT,
  nome_pai TEXT,
  telefone TEXT,
  cep TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT
);
ALTER TABLE public.tbl_usuarios ENABLE ROW LEVEL SECURITY;

-- Tabela de Usuários (Funcionários do Admin)
CREATE TABLE public.admin_usuarios (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.tbl_admins(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  permissoes JSONB DEFAULT '{"visualizar_proprio_ponto": true}'::jsonb,
  salario NUMERIC DEFAULT 0.00,
  horas_semanais INTEGER DEFAULT 44,
  horas_mensais INTEGER DEFAULT 220,
  dias_folga_fixos TEXT[] DEFAULT '{}'::text[],
  folga_domingo_obrigatoria BOOLEAN DEFAULT FALSE,
  data_inicio_contrato DATE,
  data_fim_contrato DATE,
  data_inicio_aviso DATE,
  tipo_aviso TEXT,
  cpf TEXT,
  rg TEXT,
  nome_mae TEXT,
  nome_pai TEXT,
  telefone TEXT,
  cep TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  rg_url TEXT,
  cpf_url TEXT,
  titulo_eleitor_url TEXT,
  reservista_url TEXT,
  ctps_url TEXT,
  certidao_nascimento_url TEXT,
  certidao_casamento_url TEXT,
  comprovante_residencia_url TEXT,
  comprovante_escolaridade_url TEXT,
  exame_admissional_url TEXT,
  foto_3x4_url TEXT,
  cnh_url TEXT,
  cartao_pis_url TEXT,
  ja_admitido_anteriormente BOOLEAN DEFAULT FALSE,
  certidoes_filhos_urls JSONB DEFAULT '[]'::jsonb,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  logo_admin TEXT,
  nome_admin TEXT
);
ALTER TABLE public.admin_usuarios ENABLE ROW LEVEL SECURITY;

-- Tabela de Plano de Contas
CREATE TABLE public.plano_contas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proprietario_id UUID,
  Conta TEXT,
  Descricao TEXT,
  Analitica TEXT,
  codigo_reduzido TEXT,
  is_conta_caixa_banco BOOLEAN DEFAULT FALSE,
  is_conta_resultado BOOLEAN DEFAULT FALSE,
  is_conta_patrimonial BOOLEAN DEFAULT FALSE,
  is_caixa BOOLEAN DEFAULT FALSE,
  is_banco BOOLEAN DEFAULT FALSE,
  is_a_receber BOOLEAN,
  is_a_pagar BOOLEAN,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;

-- Tabela de Contas de Saldo (Caixa/Banco/Patrimonial)
CREATE TABLE public.saldo_contas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proprietario_id UUID,
  nome TEXT,
  saldo_inicial NUMERIC DEFAULT 0,
  conta_contabil_id UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  tipo_saldo TEXT DEFAULT 'Credito'::text,
  natureza_contabil TEXT DEFAULT 'Ativo'::text,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.saldo_contas ENABLE ROW LEVEL SECURITY;

-- Tabela de Lançamentos (Partidas Dobradas)
CREATE TABLE public.lancamentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proprietario_id UUID,
  data_movimentacao DATE,
  descricao TEXT,
  valor NUMERIC,
  tipo TEXT,
  conta_bancaria_id UUID REFERENCES public.saldo_contas(id) ON DELETE SET NULL,
  conta_contabil_id UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  conciliado BOOLEAN DEFAULT FALSE,
  origem TEXT,
  documento TEXT,
  historico_id UUID,
  conta_resultado_id UUID,
  anexo_id UUID,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

-- Tabela de Configurações Stripe (Admin)
CREATE TABLE public.configuracoes_stripe (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proprietario_id UUID,
  stripe_publishable_key TEXT NOT NULL,
  stripe_secret_key TEXT,
  conta_sintetica_id UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  conta_receber_id UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  historico_padrao_id UUID,
  id_conta_resultado UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.configuracoes_stripe ENABLE ROW LEVEL SECURITY;

-- Tabela de Tickets de Suporte
CREATE TABLE public.tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proprietario_id UUID NOT NULL,
  empresa_id UUID NOT NULL,
  titulo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto'::text,
  prioridade TEXT DEFAULT 'media'::text,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Tabela de Mensagens de Ticket
CREATE TABLE public.mensagens_ticket (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  remetente_id UUID NOT NULL,
  conteudo TEXT NOT NULL,
  anexo_url TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  destinatario_id UUID
);
ALTER TABLE public.mensagens_ticket ENABLE ROW LEVEL SECURITY;

-- Tabela de Clientes CR (Contas a Receber)
CREATE TABLE public.clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proprietario_id UUID,
  nome TEXT NOT NULL,
  documento TEXT,
  email TEXT,
  telefone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  razao_social TEXT,
  nome_fantasia TEXT,
  telefone_fixo TEXT,
  cep TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  is_system_client BOOLEAN DEFAULT FALSE,
  logo_url TEXT,
  nome_proprietario TEXT,
  cpf TEXT,
  cnpj TEXT,
  rg TEXT,
  data_nascimento DATE
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- Tabela de Contas a Receber (Admin)
CREATE TABLE public.admin_contas_receber (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES public.tbl_admins(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL,
  origem TEXT DEFAULT 'manual'::text,
  descricao TEXT NOT NULL,
  valor_total NUMERIC NOT NULL,
  data_emissao DATE DEFAULT CURRENT_DATE,
  data_vencimento DATE NOT NULL,
  status TEXT DEFAULT 'aberta'::text,
  tipo_receita TEXT DEFAULT 'única'::text,
  contrato_gerado_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  id_conta_patrimonial UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  historico_id UUID,
  id_conta_resultado UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL
);
ALTER TABLE public.admin_contas_receber ENABLE ROW LEVEL SECURITY;

-- Tabela de Parcelas a Receber (Admin)
CREATE TABLE public.admin_parcelas_receber (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conta_receber_id UUID NOT NULL REFERENCES public.admin_contas_receber(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.tbl_admins(id) ON DELETE CASCADE,
  numero_parcela INTEGER NOT NULL,
  valor_parcela NUMERIC NOT NULL,
  valor_pago NUMERIC DEFAULT 0.00,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status TEXT DEFAULT 'aberta'::text,
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  id_conta_contabil UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL
);
ALTER TABLE public.admin_parcelas_receber ENABLE ROW LEVEL SECURITY;

-- Tabela de Recebimentos (Admin)
CREATE TABLE public.admin_recebimentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parcela_id UUID NOT NULL REFERENCES public.admin_parcelas_receber(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.tbl_admins(id) ON DELETE CASCADE,
  valor_recebido NUMERIC NOT NULL,
  tipo_recebimento TEXT,
  desconto_aplicado NUMERIC DEFAULT 0.00,
  data_recebimento TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  forma_pagamento TEXT,
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cliente_id UUID,
  conta_id UUID REFERENCES public.saldo_contas(id) ON DELETE SET NULL,
  id_conta_contabil UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  historico_id UUID,
  id_conta_resultado UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  anexo_url TEXT
);
ALTER TABLE public.admin_recebimentos ENABLE ROW LEVEL SECURITY;

-- =================================================================
-- 3. TRIGGERS
-- =================================================================

-- Trigger para rotear novos usuários
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.route_new_user();

-- Triggers para atualizar o campo updated_at
CREATE TRIGGER set_updated_at_on_lancamentos BEFORE UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_on_saldo_contas BEFORE UPDATE ON public.saldo_contas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Triggers para tbl_clientes
CREATE TRIGGER on_client_insert_set_admin_id BEFORE INSERT ON public.tbl_clientes FOR EACH ROW EXECUTE FUNCTION public.set_admin_id_on_client_creation();
CREATE TRIGGER on_tbl_clientes_change AFTER INSERT OR UPDATE ON public.tbl_clientes FOR EACH ROW EXECUTE FUNCTION public.sync_client_branding();

-- Triggers para admin_usuarios (branding do Admin)
CREATE TRIGGER on_admin_user_change BEFORE INSERT OR UPDATE ON public.admin_usuarios FOR EACH ROW EXECUTE FUNCTION public.set_admin_branding_on_user_update();

-- =================================================================
-- 4. POLÍTICAS RLS (Foco no Acesso Total do Admin)
-- =================================================================

-- Variável auxiliar para verificar se o usuário é Admin
CREATE OR REPLACE VIEW public.is_admin_user AS
 SELECT (auth.uid() IN ( SELECT tbl_admins.id FROM tbl_admins));

-- 4.1. Políticas para tbl_admins (Acesso próprio e Service Role)
CREATE POLICY "Admins can select their own profile" ON public.tbl_admins FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can insert their own profile" ON public.tbl_admins FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can update their own profile" ON public.tbl_admins FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can delete their own profile" ON public.tbl_admins FOR DELETE USING (auth.uid() = id);
CREATE POLICY "service_role_insert_tbl_admins" ON public.tbl_admins FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated read of branding fields" ON public.tbl_admins FOR SELECT USING (true);

-- 4.2. Políticas para tbl_clientes (Admin vê todos, Cliente vê o próprio)
CREATE POLICY "Admins podem ver todos os clientes" ON public.tbl_clientes FOR SELECT USING (EXISTS ( SELECT 1 FROM tbl_admins WHERE (tbl_admins.id = auth.uid())));
CREATE POLICY "Clientes podem ver seus próprios dados" ON public.tbl_clientes FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Allow authenticated users to insert their own client profile" ON public.tbl_clientes FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Allow authenticated users to update their own client profile" ON public.tbl_clientes FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "service_role_insert_tbl_clientes" ON public.tbl_clientes FOR INSERT WITH CHECK (true);

-- 4.3. Políticas para tbl_usuarios e admin_usuarios (Admin vê todos, Usuário vê o próprio)
CREATE POLICY "Admins can manage all users" ON public.tbl_usuarios FOR ALL USING (EXISTS ( SELECT 1 FROM tbl_admins WHERE (tbl_admins.id = auth.uid()))) WITH CHECK (EXISTS ( SELECT 1 FROM tbl_admins WHERE (tbl_admins.id = auth.uid())));
CREATE POLICY "Usuários podem ver seus próprios dados" ON public.tbl_usuarios FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admin can manage their own users" ON public.admin_usuarios FOR ALL USING (auth.uid() = admin_id) WITH CHECK (auth.uid() = admin_id);
CREATE POLICY "User can view and update own profile" ON public.admin_usuarios FOR SELECT USING (auth.uid() = id);
CREATE POLICY "service_role_insert_tbl_usuarios" ON public.tbl_usuarios FOR INSERT WITH CHECK (true);

-- 4.4. Políticas para Plano de Contas e Históricos (Admin e Proprietário)
CREATE POLICY "Allow owner and admin users to manage plan of accounts" ON public.plano_contas FOR ALL USING (proprietario_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid()))) WITH CHECK (proprietario_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid())));
CREATE POLICY "Allow owner and admin users to manage historicos" ON public.historicos FOR ALL USING (proprietario_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid()))) WITH CHECK (proprietario_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid())));

-- 4.5. Políticas para Contas de Saldo (saldo_contas) e Lançamentos
CREATE POLICY "Owner and subordinate users can manage saldo_contas" ON public.saldo_contas FOR ALL USING (proprietario_id IN ( SELECT auth.uid() AS uid UNION SELECT tbl_usuarios.cliente_id FROM tbl_usuarios WHERE (tbl_usuarios.id = auth.uid()) UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid()))) WITH CHECK (proprietario_id IN ( SELECT auth.uid() AS uid UNION SELECT tbl_usuarios.cliente_id FROM tbl_usuarios WHERE (tbl_usuarios.id = auth.uid()) UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid())));
CREATE POLICY "Owner and subordinate users can manage launches" ON public.lancamentos FOR ALL USING (proprietario_id IN ( SELECT auth.uid() AS uid UNION SELECT tbl_usuarios.cliente_id FROM tbl_usuarios WHERE (tbl_usuarios.id = auth.uid()) UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid()))) WITH CHECK (proprietario_id IN ( SELECT auth.uid() AS uid UNION SELECT tbl_usuarios.cliente_id FROM tbl_usuarios WHERE (tbl_usuarios.id = auth.uid()) UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid())));

-- 4.6. Políticas para Configurações Stripe (Admin-only)
CREATE POLICY "Admins can manage all stripe config" ON public.configuracoes_stripe FOR ALL USING (auth.uid() IN ( SELECT tbl_admins.id FROM tbl_admins)) WITH CHECK (auth.uid() IN ( SELECT tbl_admins.id FROM tbl_admins));
CREATE POLICY "Authenticated users can read stripe configs" ON public.configuracoes_stripe FOR SELECT USING (true);

-- 4.7. Políticas para Tickets e Mensagens (Admin vê todos, Cliente vê o próprio)
CREATE POLICY "Admin pode gerenciar todos os tickets" ON public.tickets FOR ALL USING (EXISTS ( SELECT 1 FROM tbl_admins WHERE (tbl_admins.id = auth.uid()))) WITH CHECK (EXISTS ( SELECT 1 FROM tbl_admins WHERE (tbl_admins.id = auth.uid())));
CREATE POLICY "Allow owner to manage their own tickets" ON public.tickets FOR ALL USING (auth.uid() = proprietario_id) WITH CHECK (auth.uid() = proprietario_id);
CREATE POLICY "Admin pode gerenciar todas as mensagens" ON public.mensagens_ticket FOR ALL USING (EXISTS ( SELECT 1 FROM tbl_admins WHERE (tbl_admins.id = auth.uid()))) WITH CHECK (EXISTS ( SELECT 1 FROM tbl_admins WHERE (tbl_admins.id = auth.uid())));
CREATE POLICY "insert_mensagens_ticket_if_remetente_is_auth" ON public.mensagens_ticket FOR INSERT WITH CHECK ((remetente_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM tickets t WHERE ((t.id = mensagens_ticket.ticket_id) AND ((t.proprietario_id = auth.uid()) OR (t.empresa_id = auth.uid()))))));

-- 4.8. Políticas para Admin CR/CP (Admin e seus usuários)
CREATE POLICY "Admin can manage own receivables" ON public.admin_contas_receber FOR ALL USING (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid()))) WITH CHECK (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid())));
CREATE POLICY "Admin can manage own installments" ON public.admin_parcelas_receber FOR ALL USING (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid()))) WITH CHECK (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid())));
CREATE POLICY "Admin can manage own receipts" ON public.admin_recebimentos FOR ALL USING (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid()))) WITH CHECK (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid())));
CREATE POLICY "Admin can manage own payables" ON public.admin_contas_pagar FOR ALL USING (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid()))) WITH CHECK (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid())));
CREATE POLICY "Admin can manage own payable installments" ON public.admin_parcelas_pagar FOR ALL USING (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid()))) WITH CHECK (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid())));
CREATE POLICY "Admin can manage own payments" ON public.admin_pagamentos FOR ALL USING (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid()))) WITH CHECK (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid())));

-- 4.9. Políticas para Clientes CR (Admin vê todos, Cliente vê o próprio)
CREATE POLICY "Admins podem ver todos os clientes" ON public.clientes FOR SELECT USING (EXISTS ( SELECT 1 FROM tbl_admins WHERE (tbl_admins.id = auth.uid())));
CREATE POLICY "Admin select own clients" ON public.clientes FOR SELECT USING (auth.uid() = proprietario_id);
CREATE POLICY "Admin insert own clients" ON public.clientes FOR INSERT WITH CHECK (auth.uid() = proprietario_id);
CREATE POLICY "Admin update own clients" ON public.clientes FOR UPDATE USING (auth.uid() = proprietario_id);
CREATE POLICY "Admin delete own clients" ON public.clientes FOR DELETE USING (auth.uid() = proprietario_id);
