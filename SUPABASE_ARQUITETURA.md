# 🗄️ Arquitetura do Banco de Dados (Supabase/PostgreSQL)

Este documento detalha o esquema do banco de dados, incluindo a criação de tabelas, funções RPC e políticas de Row Level Security (RLS).

## 1. SQL de Criação de Schema (Tabelas Essenciais)

O esquema abaixo inclui as tabelas de perfis (`tbl_admins`, `tbl_clientes`, `tbl_usuarios`), cadastros (`clientes`, `planos`, `historicos`, `plano_contas`), e módulos (`registros_ponto`, `contratos_gerados`, `admin_contas_receber`, `lancamentos`, `saldo_contas`).

```sql
-- Habilita extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------
-- 1. TABELAS DE PERFIS (AUTH)
-- ----------------------------------------------------------------

-- Tabela de Administradores (Proprietários do Sistema)
CREATE TABLE public.tbl_admins (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
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
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.tbl_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can select their own profile" ON public.tbl_admins FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can insert their own profile" ON public.tbl_admins FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can update their own profile" ON public.tbl_admins FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can delete their own profile" ON public.tbl_admins FOR DELETE TO authenticated USING (auth.uid() = id);


-- Tabela de Clientes (Empresas/Inquilinos)
CREATE TABLE public.tbl_clientes (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  admin_id UUID REFERENCES public.tbl_admins(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  limite_usuarios INTEGER NOT NULL DEFAULT 5,
  aprovado BOOLEAN NOT NULL DEFAULT FALSE,
  permissoes JSONB NOT NULL DEFAULT '{"bancos": true, "importar": true, "relatorios": true, "conciliacao": true, "contas_pagar": true, "plano_contas": true, "configuracoes": true, "contas_receber": true, "ponto_eletronico": true}'::jsonb,
  plano_id UUID,
  data_fim_acesso TIMESTAMP WITH TIME ZONE,
  tipo_cliente TEXT,
  
  -- Campos cadastrais para tags de contrato
  cpf TEXT, rg TEXT, nome_mae TEXT, nome_pai TEXT, telefone TEXT, cep TEXT, endereco TEXT, numero TEXT, complemento TEXT, bairro TEXT, cidade TEXT, estado TEXT,
  
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.tbl_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins podem gerenciar todos os clientes" ON public.tbl_clientes FOR ALL TO authenticated USING ((SELECT count(*) FROM tbl_admins WHERE id = auth.uid()) > 0) WITH CHECK ((SELECT count(*) FROM tbl_admins WHERE id = auth.uid()) > 0);
CREATE POLICY "Clientes podem ver seus próprios dados" ON public.tbl_clientes FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Usuarios podem ler os dados da sua empresa" ON public.tbl_clientes FOR SELECT TO authenticated USING (EXISTS ( SELECT 1 FROM tbl_usuarios WHERE ((tbl_usuarios.id = auth.uid()) AND (tbl_clientes.id = tbl_usuarios.cliente_id))));
CREATE POLICY "Allow authenticated users to update their own client profile" ON public.tbl_clientes FOR UPDATE TO authenticated USING (auth.uid() = id);


-- Tabela de Usuários (Funcionários)
CREATE TABLE public.tbl_usuarios (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  cliente_id UUID REFERENCES public.tbl_clientes(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  permissoes JSONB DEFAULT '{"visualizar_proprio_ponto": true}'::jsonb,
  
  -- Dados de RH/Ponto
  salario NUMERIC DEFAULT 0.00,
  horas_semanais INTEGER DEFAULT 44,
  horas_mensais INTEGER DEFAULT 220,
  dias_folga_fixos TEXT[] DEFAULT '{}'::text[],
  folga_domingo_obrigatoria BOOLEAN DEFAULT TRUE,
  data_inicio_contrato DATE,
  data_fim_contrato DATE,
  data_inicio_aviso DATE,
  tipo_aviso TEXT,
  
  -- Campos cadastrais e documentos (para RH/Contrato)
  cpf TEXT, rg TEXT, nome_mae TEXT, nome_pai TEXT, telefone TEXT, cep TEXT, endereco TEXT, numero TEXT, complemento TEXT, bairro TEXT, cidade TEXT, estado TEXT,
  rg_url TEXT, cpf_url TEXT, titulo_eleitor_url TEXT, reservista_url TEXT, ctps_url TEXT, certidao_nascimento_url TEXT, certidao_casamento_url TEXT, comprovante_residencia_url TEXT, comprovante_escolaridade_url TEXT, exame_admissional_url TEXT, foto_3x4_url TEXT, cnh_url TEXT, cartao_pis_url TEXT, ja_admitido_anteriormente BOOLEAN DEFAULT FALSE, certidoes_filhos_urls JSONB DEFAULT '[]'::jsonb,
  
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.tbl_usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios podem ver seus próprios dados" ON public.tbl_usuarios FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Clientes podem gerenciar seus próprios usuários" ON public.tbl_usuarios FOR ALL TO authenticated USING (cliente_id = auth.uid());
CREATE POLICY "Admins podem ver todos os usuários" ON public.tbl_usuarios FOR SELECT TO authenticated USING ((SELECT count(*) FROM tbl_admins WHERE id = auth.uid()) > 0);


-- ----------------------------------------------------------------
-- 2. TABELAS DE CADASTRO (Clientes CR, Planos, Históricos)
-- ----------------------------------------------------------------

-- Tabela de Clientes (Contas a Receber)
CREATE TABLE public.clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proprietario_id UUID, -- ID do Admin ou Cliente (tbl_admins/tbl_clientes)
  nome TEXT NOT NULL,
  razao_social TEXT,
  nome_fantasia TEXT,
  documento TEXT,
  email TEXT,
  telefone TEXT,
  telefone_fixo TEXT,
  cep TEXT, endereco TEXT, numero TEXT, complemento TEXT, bairro TEXT, cidade TEXT, estado TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Empresas podem gerenciar seus próprios clientes" ON public.clientes FOR ALL TO authenticated USING (proprietario_id IN ( SELECT tbl_clientes.id FROM tbl_clientes WHERE (tbl_clientes.id = auth.uid()) UNION SELECT tbl_usuarios.cliente_id FROM tbl_usuarios WHERE ((tbl_usuarios.id = auth.uid()) AND (tbl_usuarios.cliente_id IS NOT NULL))));
CREATE POLICY "Admins podem ver todos os clientes" ON public.clientes FOR SELECT USING (EXISTS ( SELECT 1 FROM tbl_admins WHERE (tbl_admins.id = auth.uid())));
CREATE POLICY "Admin select own clients" ON public.clientes FOR SELECT TO authenticated USING (auth.uid() = proprietario_id);
CREATE POLICY "Admin insert own clients" ON public.clientes FOR INSERT TO authenticated WITH CHECK (auth.uid() = proprietario_id);
CREATE POLICY "Admin update own clients" ON public.clientes FOR UPDATE TO authenticated USING (auth.uid() = proprietario_id);
CREATE POLICY "Admin delete own clients" ON public.clientes FOR DELETE TO authenticated USING (auth.uid() = proprietario_id);


-- Tabela de Planos de Assinatura
CREATE TABLE public.planos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco_mensal NUMERIC NOT NULL,
  permissoes JSONB NOT NULL,
  tipo_cliente TEXT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access for plans" ON public.planos FOR SELECT USING (true);
CREATE POLICY "Admins can manage all plans" ON public.planos FOR ALL TO authenticated USING (auth.uid() IN ( SELECT tbl_admins.id FROM tbl_admins));


-- Tabela de Históricos (Para Lançamentos Contábeis)
CREATE TABLE public.historicos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proprietario_id UUID,
  descricao TEXT NOT NULL,
  codigo TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.historicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow owner to manage historicos" ON public.historicos FOR ALL TO authenticated USING (auth.uid() = proprietario_id);
CREATE POLICY "Allow users to manage company historicos" ON public.historicos FOR ALL TO authenticated USING (proprietario_id IN ( SELECT tbl_clientes.id FROM tbl_clientes WHERE (tbl_clientes.id = auth.uid()) UNION SELECT tbl_usuarios.cliente_id FROM tbl_usuarios WHERE ((tbl_usuarios.id = auth.uid()) AND (tbl_usuarios.cliente_id IS NOT NULL))));


-- Tabela de Plano de Contas
CREATE TABLE public.plano_contas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proprietario_id UUID,
  Conta TEXT,
  Descricao TEXT,
  Analitica TEXT,
  codigo_reduzido TEXT,
  is_conta_saldo BOOLEAN DEFAULT FALSE,
  is_conta_resultado BOOLEAN DEFAULT FALSE,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated users to manage their own plan of accounts" ON public.plano_contas FOR ALL TO authenticated USING ((auth.uid() = proprietario_id) OR (proprietario_id IN ( SELECT tbl_usuarios.cliente_id FROM tbl_usuarios WHERE ((tbl_usuarios.id = auth.uid()) AND (tbl_usuarios.cliente_id IS NOT NULL)))));


-- ----------------------------------------------------------------
-- 3. MÓDULO FINANCEIRO (Contas, Lançamentos, Recebimentos/Pagamentos)
-- ----------------------------------------------------------------

-- Tabela de Contas/Caixas (Saldo Contas)
CREATE TABLE public.saldo_contas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proprietario_id UUID, -- RENOMEADO DE empresa_id PARA proprietario_id
  nome TEXT,
  saldo_inicial NUMERIC DEFAULT 0,
  conta_contabil_id UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  tipo_saldo TEXT DEFAULT 'Credito'::text,
  natureza_contabil TEXT DEFAULT 'Ativo'::text,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.saldo_contas ENABLE ROW LEVEL SECURITY;
-- Políticas atualizadas para usar proprietario_id
CREATE POLICY "Empresas podem gerenciar seus saldos de contas" ON public.saldo_contas FOR ALL TO authenticated USING (proprietario_id IN ( SELECT tbl_clientes.id FROM tbl_clientes WHERE (tbl_clientes.id = auth.uid()) UNION SELECT tbl_usuarios.cliente_id FROM tbl_usuarios WHERE ((tbl_usuarios.id = auth.uid()) AND (tbl_usuarios.cliente_id IS NOT NULL)))) WITH CHECK (proprietario_id IN ( SELECT tbl_clientes.id FROM tbl_clientes WHERE (tbl_clientes.id = auth.uid()) UNION SELECT tbl_usuarios.cliente_id FROM tbl_usuarios WHERE ((tbl_usuarios.id = auth.uid()) AND (tbl_usuarios.cliente_id IS NOT NULL))));
CREATE POLICY "Admin pode gerenciar suas contas" ON public.saldo_contas FOR ALL TO authenticated USING (auth.uid() = proprietario_id) WITH CHECK (auth.uid() = proprietario_id);


-- Tabela de Lançamentos (Movimentação de Saldo)
CREATE TABLE public.lancamentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proprietario_id UUID, -- ID do Admin ou Cliente
  data_movimentacao DATE,
  descricao TEXT,
  valor NUMERIC,
  tipo TEXT, -- 'Entrada' ou 'Saida'
  conta_bancaria_id UUID REFERENCES public.saldo_contas(id) ON DELETE SET NULL,
  conta_contabil_id UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  historico_id UUID REFERENCES public.historicos(id) ON DELETE SET NULL,
  conciliado BOOLEAN DEFAULT FALSE,
  origem TEXT,
  documento TEXT,
  anexo_id UUID,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage own launches" ON public.lancamentos FOR ALL TO authenticated USING (auth.uid() = proprietario_id);
-- Adicionar política para Cliente/Usuário (se necessário)


-- Tabela de Contas a Receber (Sintético - Admin)
CREATE TABLE public.admin_contas_receber (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES public.tbl_admins(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  origem TEXT DEFAULT 'manual'::text,
  descricao TEXT NOT NULL,
  valor_total NUMERIC NOT NULL,
  data_emissao DATE DEFAULT CURRENT_DATE,
  data_vencimento DATE NOT NULL,
  status TEXT DEFAULT 'aberta'::text,
  tipo_receita TEXT DEFAULT 'única'::text,
  contrato_gerado_id UUID,
  id_conta_contabil UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.admin_contas_receber ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage own receivables" ON public.admin_contas_receber FOR ALL TO authenticated USING (auth.uid() = admin_id);
CREATE POLICY "Clientes can read their own recurring accounts" ON public.admin_contas_receber FOR SELECT TO authenticated USING (auth.uid() = cliente_id);


-- Tabela de Parcelas a Receber (Analítico - Admin)
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
  id_conta_contabil UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.admin_parcelas_receber ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage own installments" ON public.admin_parcelas_receber FOR ALL TO authenticated USING (auth.uid() = admin_id);
CREATE POLICY "Clientes can read their own recurring installments" ON public.admin_parcelas_receber FOR SELECT TO authenticated USING (EXISTS ( SELECT 1 FROM admin_contas_receber WHERE ((admin_contas_receber.id = admin_parcelas_receber.conta_receber_id) AND (admin_contas_receber.cliente_id = auth.uid()))));


-- Tabela de Recebimentos (Histórico - Admin)
CREATE TABLE public.admin_recebimentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parcela_id UUID NOT NULL REFERENCES public.admin_parcelas_receber(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.tbl_admins(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.tbl_clientes(id) ON DELETE RESTRICT,
  valor_recebido NUMERIC NOT NULL,
  tipo_recebimento TEXT,
  desconto_aplicado NUMERIC DEFAULT 0.00,
  data_recebimento TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  forma_pagamento TEXT,
  observacao TEXT,
  conta_id UUID REFERENCES public.saldo_contas(id) ON DELETE SET NULL,
  id_conta_contabil UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  historico_id UUID REFERENCES public.historicos(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.admin_recebimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage own receipts" ON public.admin_recebimentos FOR ALL TO authenticated USING (auth.uid() = admin_id);
CREATE POLICY "Clientes can view their own payments" ON public.admin_recebimentos FOR SELECT TO authenticated USING (auth.uid() = cliente_id);


-- ----------------------------------------------------------------
-- 4. MÓDULO RH (Ponto e Férias)
-- ----------------------------------------------------------------

-- Tabela de Registros de Ponto
CREATE TABLE public.registros_ponto (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id UUID NOT NULL REFERENCES public.tbl_usuarios(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL, -- ID do Cliente (tbl_clientes)
  horario_registro TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  selfie_url TEXT NOT NULL,
  tipo TEXT NOT NULL, -- 'Entrada', 'Saida', 'Falta', 'Abono', 'Compensacao', 'Extra100'
  latitude NUMERIC,
  longitude NUMERIC,
  maps_url TEXT,
  atestado_url TEXT,
  observacao TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
ALTER TABLE public.registros_ponto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Funcionários podem criar seus próprios registros" ON public.registros_ponto FOR INSERT TO authenticated WITH CHECK (auth.uid() = funcionario_id);
CREATE POLICY "Funcionários podem ver seus próprios registros" ON public.registros_ponto FOR SELECT TO authenticated USING (auth.uid() = funcionario_id);
CREATE POLICY "Clientes podem ver os registros de sua empresa" ON public.registros_ponto FOR SELECT TO authenticated USING (EXISTS ( SELECT 1 FROM tbl_clientes WHERE ((tbl_clientes.id = auth.uid()) AND (registros_ponto.empresa_id = tbl_clientes.id))));
CREATE POLICY "Clients can manage their company's point records" ON public.registros_ponto FOR ALL TO authenticated USING (EXISTS ( SELECT 1 FROM tbl_clientes WHERE ((tbl_clientes.id = auth.uid()) AND (registros_ponto.empresa_id = tbl_clientes.id))));
CREATE POLICY "Admins podem ver todos os registros" ON public.registros_ponto FOR ALL TO authenticated USING (EXISTS ( SELECT 1 FROM tbl_admins WHERE (tbl_admins.id = auth.uid())));


-- Tabela de Férias
CREATE TABLE public.ferias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id UUID NOT NULL REFERENCES public.tbl_usuarios(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  periodo_referencia TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.ferias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employees can view their own ferias" ON public.ferias FOR SELECT TO authenticated USING (auth.uid() = funcionario_id);
CREATE POLICY "Clients can manage their employees ferias" ON public.ferias FOR ALL TO authenticated USING (empresa_id IN ( SELECT tbl_clientes.id FROM tbl_clientes WHERE (tbl_clientes.id = auth.uid())));
CREATE POLICY "Admins can manage all ferias" ON public.ferias FOR ALL TO authenticated USING (EXISTS ( SELECT 1 FROM tbl_admins WHERE (tbl_admins.id = auth.uid())));


-- ----------------------------------------------------------------
-- 5. FUNÇÕES RPC (Remote Procedure Calls)
-- ----------------------------------------------------------------

-- Função para rotear novos usuários para a tabela correta (Admin, Cliente, Usuario)
CREATE OR REPLACE FUNCTION public.route_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  user_role TEXT;
  user_nome TEXT;
  p_cliente_id UUID;
  p_plano_id UUID;
  p_permissoes JSONB;
  p_limite_usuarios INTEGER;
  v_admin_id UUID;
BEGIN
  user_role := COALESCE(new.raw_user_meta_data ->> 'role', 'Cliente');
  user_nome := COALESCE(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1));
  
  BEGIN p_cliente_id := (new.raw_user_meta_data ->> 'cliente_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN p_cliente_id := NULL; END;
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
        (new.raw_user_meta_data ->> 'data_fim_acesso')::timestamp with time zone -- Novo campo
    );
  ELSIF user_role = 'Usuario' THEN
    INSERT INTO public.tbl_usuarios (id, nome, email, cliente_id) VALUES (new.id, user_nome, new.email, p_cliente_id);
  ELSE
    RAISE EXCEPTION 'Papel de usuário inválido: %', user_role;
  END IF;
  RETURN new;
END;
$$;

-- Trigger para rotear novos usuários
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.route_new_user();


-- Função RPC para ativar a assinatura após o pagamento (Fluxo de Adesão)
CREATE OR REPLACE FUNCTION public.activate_subscription(p_cliente_id uuid, p_plano_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_plano_preco NUMERIC;
  v_plano_permissoes JSONB;
  v_data_hoje DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_parcela_id UUID;
  v_admin_id UUID;
  v_cliente_nome TEXT;
  v_cliente_email TEXT;
  v_new_data_fim_acesso TIMESTAMP WITH TIME ZONE;
  v_start_of_today TIMESTAMP WITH TIME ZONE := date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_proximo_vencimento DATE;
  v_segundo_vencimento DATE;
  v_recorrencia_id UUID;
  v_conta_destino_id UUID;
  v_conta_sintetica_stripe_id UUID;
  v_historico_padrao_id UUID;
  v_conta_contabil_a_receber UUID;
  v_conta_contabil_parcela UUID;
  v_conta_contabil_recebimento UUID;
BEGIN
  -- 1. Busca o ID do Admin (proprietário do faturamento)
  SELECT id INTO v_admin_id FROM public.tbl_admins LIMIT 1;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Nenhum administrador encontrado.'; END IF;
  
  -- 2. Busca mapeamento contábil e Stripe Config
  SELECT conta_contabil_id INTO v_conta_contabil_a_receber FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'a_receber' LIMIT 1;
  SELECT conta_contabil_id INTO v_conta_contabil_parcela FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'parcela' LIMIT 1;
  SELECT conta_contabil_id INTO v_conta_contabil_recebimento FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'recebimento' LIMIT 1;
  SELECT conta_sintetica_id, historico_padrao_id INTO v_conta_sintetica_stripe_id, v_historico_padrao_id FROM public.configuracoes_stripe WHERE proprietario_id = v_admin_id LIMIT 1;
  
  IF v_conta_contabil_a_receber IS NULL OR v_conta_sintetica_stripe_id IS NULL THEN RAISE EXCEPTION 'Configurações contábeis/Stripe incompletas.'; END IF;

  -- 3. Busca a saldo_conta do Admin que referencia a conta sintética configurada no Stripe
  SELECT id INTO v_conta_destino_id FROM public.saldo_contas WHERE proprietario_id = v_admin_id AND conta_contabil_id = v_conta_sintetica_stripe_id LIMIT 1;
  IF v_conta_destino_id IS NULL THEN RAISE EXCEPTION 'Nenhuma conta de saldo (Stripe/Banco) encontrada para o Admin.'; END IF;

  -- 4. Busca o preço e as PERMISSÕES do plano
  SELECT preco_mensal, permissoes INTO v_plano_preco, v_plano_permissoes FROM public.planos WHERE id = p_plano_id;
  IF v_plano_preco IS NULL THEN RAISE EXCEPTION 'Plano não encontrado.'; END IF;
  
  -- 5. Busca nome e email do cliente
  SELECT nome, email INTO v_cliente_nome, v_cliente_email FROM public.tbl_clientes WHERE id = p_cliente_id;

  -- 6. Determina as datas (30 dias de acesso)
  v_proximo_vencimento := (date_trunc('day', v_start_of_today) + INTERVAL '30 days')::DATE;
  v_segundo_vencimento := (date_trunc('day', v_start_of_today) + INTERVAL '60 days')::DATE;
  v_new_data_fim_acesso := (v_proximo_vencimento::TIMESTAMP WITH TIME ZONE - INTERVAL '1 millisecond') AT TIME ZONE 'America/Sao_Paulo';

  -- 7. GARANTE QUE O CLIENTE EXISTA NA TABELA 'clientes' (Contas a Receber)
  INSERT INTO public.clientes (id, proprietario_id, nome, email, documento)
  VALUES (p_cliente_id, v_admin_id, v_cliente_nome, v_cliente_email, 'ASSINATURA')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, email = EXCLUDED.email;

  -- 8. Atualiza o perfil do cliente com a nova data de acesso E PERMISSÕES
  UPDATE public.tbl_clientes
  SET plano_id = p_plano_id, data_fim_acesso = v_new_data_fim_acesso, permissoes = v_plano_permissoes, aprovado = TRUE
  WHERE id = p_cliente_id;
  
  -- 9. BUSCA OU CRIA A CONTA SINTÉTICA DE RECORRÊNCIA (Admin CR)
  SELECT id INTO v_recorrencia_id FROM public.admin_contas_receber WHERE cliente_id = p_cliente_id AND origem = 'assinatura_recorrente' LIMIT 1;

  IF v_recorrencia_id IS NULL THEN
    INSERT INTO public.admin_contas_receber (admin_id, cliente_id, descricao, valor_total, data_emissao, data_vencimento, status, tipo_receita, origem, id_conta_contabil)
    VALUES (v_admin_id, p_cliente_id, 'Assinatura Recorrente - Plano ' || v_plano_preco, v_plano_preco, v_data_hoje, v_proximo_vencimento, 'aberta', 'recorrente', 'assinatura_recorrente', v_conta_contabil_a_receber) 
    RETURNING id INTO v_recorrencia_id;
  ELSE
    UPDATE public.admin_contas_receber SET descricao = 'Assinatura Recorrente - Plano ' || v_plano_preco, valor_total = v_plano_preco, data_vencimento = v_proximo_vencimento, id_conta_contabil = v_conta_contabil_a_receber WHERE id = v_recorrencia_id;
  END IF;
  
  -- 10. QUITA TODAS AS PARCELAS PENDENTES/ABERTAS ANTERIORES (se houver)
  UPDATE public.admin_parcelas_receber SET status = 'cancelada', observacao = 'Cancelada por nova ativação/renovação'
  WHERE admin_id = v_admin_id AND conta_receber_id = v_recorrencia_id AND status IN ('aberta', 'reprogramada', 'parcial');

  -- 11. CRIA A PARCELA DO PAGAMENTO DE HOJE (MARCADO COMO PAGO)
  INSERT INTO public.admin_parcelas_receber (conta_receber_id, admin_id, numero_parcela, valor_parcela, valor_pago, data_vencimento, data_pagamento, status, id_conta_contabil)
  VALUES (v_recorrencia_id, v_admin_id, 1, v_plano_preco, v_plano_preco, v_data_hoje, v_data_hoje, 'paga', v_conta_contabil_parcela) 
  RETURNING id INTO v_parcela_id;

  -- 12. CRIA O REGISTRO DE RECEBIMENTO DO ADMIN
  INSERT INTO public.admin_recebimentos (parcela_id, admin_id, cliente_id, valor_recebido, data_recebimento, tipo_recebimento, forma_pagamento, conta_id, id_conta_contabil, historico_id)
  VALUES (v_parcela_id, v_admin_id, p_cliente_id, v_plano_preco, NOW() AT TIME ZONE 'America/Sao_Paulo', 'total', 'Stripe', v_conta_destino_id, v_conta_contabil_recebimento, v_historico_padrao_id);
  
  -- 13. CRIA O LANÇAMENTO DE ENTRADA NA CONTA DE SALDO (Stripe)
  INSERT INTO public.lancamentos (proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id)
  VALUES (v_admin_id, v_data_hoje, 'Recebimento Assinatura Stripe - Cliente ' || v_cliente_nome, v_plano_preco, 'Entrada', v_conta_destino_id, v_conta_sintetica_stripe_id, 'assinatura_stripe', true, v_historico_padrao_id);
  
  -- 14. CRIA AS PRÓXIMAS DUAS PARCELAS PENDENTES (30 e 60 dias)
  INSERT INTO public.admin_parcelas_receber (conta_receber_id, admin_id, numero_parcela, valor_parcela, data_vencimento, status, id_conta_contabil)
  VALUES (v_recorrencia_id, v_admin_id, 2, v_plano_preco, v_proximo_vencimento, 'aberta', v_conta_contabil_parcela);
  
  INSERT INTO public.admin_parcelas_receber (conta_receber_id, admin_id, numero_parcela, valor_parcela, data_vencimento, status, id_conta_contabil)
  VALUES (v_recorrencia_id, v_admin_id, 3, v_plano_preco, v_segundo_vencimento, 'aberta', v_conta_contabil_parcela);

END;
$function$;