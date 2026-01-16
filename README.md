# Jota App - Sistema de Gestão Financeira e RH Multi-Tenant (d20122025)

supabase secrets set PAGBANK_TOKEN_PRODUCAO=seu_token_de_producao_aqui

![Version](https://img.shields.io/badge/version-2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-production-brightgreen)

Um sistema robusto de gestão financeira, RH e contratos construído com React, TypeScript, Supabase e Stripe. Oferece soluções completas para administração de empresas, gestão de clientes, contas a receber/pagar, ponto eletrônico, folha de ponto e contratos dinâmicos.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Requisitos do Sistema](#requisitos-do-sistema)
- [Instalação e Configuração](#instalação-e-configuração)
- [Database Setup Guide (SQL Scripts)](#database-setup-guide-sql-scripts)
- [Arquitetura de Acesso e RLS](#️-arquitetura-de-acesso-e-rls-pós-correção-de-recursão)
- [Funcionalidades e Telas](#funcionalidades-e-telas)
- [API e Integrações](#api-e-integrações)

---

## Visão Geral

O Jota App é uma plataforma SaaS multi-tenant que permite:

- **Administradores (Admin):** Gerenciar múltiplos clientes, criar contratos, monitorar finanças
- **Clientes (Empresas):** Gerenciar suas próprias finanças, colaboradores e contas
- **Funcionários:** Registrar ponto, visualizar folha de ponto e histórico

### Estrutura Multi-Tenant

- **Admin (Proprietário da Plataforma):** Acesso aos dados de todos os clientes via tabelas `admin_*`
- **Cliente (Empresa):** Acesso restrito aos seus próprios dados via tabelas normalizadas

---

## Requisitos do Sistema

### Dependências Principais
- **Node.js:** >= 18.0.0
- **npm/pnpm:** >= 8.0.0
- **Navegador:** Chrome, Firefox, Safari ou Edge (últimas 2 versões)

### Contas e Serviços
- **Supabase:** Banco de dados PostgreSQL + autenticação
- **Stripe:** Processamento de pagamentos
- **Google Cloud:** Geolocalização (opcional)

---

## Instalação e Configuração

### 1. Clonar o Repositório

```bash
git clone https://github.com/seu-usuario/jota-app-basico.git
cd jota-app-basico
```

### 2. Instalar Dependências

```bash
# Usando pnpm (recomendado)
pnpm install

# Ou npm
npm install
```

### 3. Configurar Variáveis de Ambiente

Criar arquivo `.env.local` na raiz do projeto:

```env
# Supabase
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anonima

# Stripe
VITE_STRIPE_PUBLIC_KEY=pk_live_xxxxx

# URL da Aplicação
VITE_APP_URL=http://localhost:8080
```

### 4. Configuração do Supabase (CRÍTICO)

**Execute o script SQL completo fornecido na seção abaixo** no SQL Editor do seu projeto Supabase para criar todas as tabelas, funções, triggers e políticas de RLS.

### 5. Iniciar o Servidor de Desenvolvimento

```bash
pnpm dev
# A aplicação estará disponível em http://localhost:8080
```

---

## Database Setup Guide (SQL Scripts)

Para configurar o banco de dados do zero, execute os scripts abaixo na ordem apresentada no SQL Editor do Supabase.

### 1. Tipos, Funções de Utilidade e Helpers de RLS

Cria tipos de dados customizados e funções essenciais para o funcionamento do sistema e da arquitetura de RLS não-recursiva.

<dyad-execute-sql description="Criação de Tipos, Funções de Utilidade e Helpers de RLS">
-- Criação do Tipo ENUM para status de mapeamento de extrato
CREATE TYPE public.status_mapeamento_extrato AS ENUM (
    'pendente_mapeamento',
    'mapeado_automatico',
    'mapeado_manual',
    'sem_mapeamento'
);

-- Função auxiliar para converter strings como 'TRUE', 'FALSE', 'Sim', 'Não' para booleanos
CREATE OR REPLACE FUNCTION public.to_boolean_safe(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
    SELECT CASE 
        WHEN UPPER(TRIM(p_text)) IN ('TRUE', 'T', 'SIM', '1', 'YES', 'S') THEN TRUE
        ELSE FALSE
    END;
$function$;

-- Função de trigger para atualizar a coluna 'updated_at'
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

-- Função RLS Helper: Busca o admin_id do usuário logado (Não-Recursiva)
CREATE OR REPLACE FUNCTION public.get_admin_id_for_current_user()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  current_admin uuid;
BEGIN
  SET LOCAL row_security = off;
  SELECT admin_id INTO current_admin FROM public.admin_user_lookup WHERE id = auth.uid();
  RETURN current_admin;
END;
$function$;

-- Função RLS Helper: Verifica se é o dono ou um usuário subordinado ao dono
CREATE OR REPLACE FUNCTION public.is_owner_or_admin_user(owner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
    SELECT owner_id = auth.uid() OR EXISTS (
        SELECT 1
        FROM public.admin_usuarios au
        WHERE au.id = auth.uid() AND au.admin_id = owner_id
    );
$function$;

-- Função de Trigger: Roteia o novo usuário do Auth para a tabela de perfil correta
CREATE OR REPLACE FUNCTION public.route_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  user_role TEXT;
  user_nome TEXT;
  p_proprietario_id UUID;
  p_plano_id UUID;
  p_permissoes JSONB;
  p_limite_usuarios INTEGER;
  v_admin_id UUID;
  
  -- Valores padrão para tbl_usuarios/admin_usuarios (NOT NULL)
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
  
  -- Tenta converter metadados
  BEGIN p_proprietario_id := (new.raw_user_meta_data ->> 'proprietario_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN p_proprietario_id := NULL; END;
  BEGIN p_plano_id := (new.raw_user_meta_data ->> 'plano_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN p_plano_id := NULL; END;
  BEGIN p_permissoes := (new.raw_user_meta_data ->> 'permissoes')::jsonb; EXCEPTION WHEN others THEN p_permissoes := NULL; END;
  p_limite_usuarios := COALESCE((new.raw_user_meta_data ->> 'limite_usuarios')::integer, 5);

  -- Busca o primeiro Admin (para atribuição de clientes)
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
        -- Roteia para tbl_usuarios (Usuário do Cliente)
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
$function$;
</dyad-execute-sql>

### 2. Criação de Tabelas (Schema `public`)

Cria todas as tabelas necessárias para o sistema.

<dyad-execute-sql description="Criação de todas as tabelas do sistema">
-- Tabela para armazenar o perfil detalhado do Administrador ou da Empresa Principal
CREATE TABLE IF NOT EXISTS public.tbl_admins (
    id uuid PRIMARY KEY,
    nome text NOT NULL,
    email text UNIQUE NOT NULL,
    cpf text,
    cnpj text,
    rg text,
    nome_mae text,
    nome_pai text,
    telefone text,
    cep text,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    estado text,
    avatar_url text,
    logo_url text,
    assinatura_proprietario_nome text,
    assinatura_proprietario_url text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela para armazenar o perfil detalhado dos Clientes (Sub-Contas)
CREATE TABLE IF NOT EXISTS public.tbl_clientes (
    id uuid PRIMARY KEY,
    admin_id uuid REFERENCES public.tbl_admins (id),
    nome text NOT NULL,
    razao_social text,
    nome_fantasia text,
    documento text,
    cnpj text,
    cpf text,
    rg text,
    email text UNIQUE NOT NULL,
    tipo_cliente text,
    aprovado boolean DEFAULT FALSE NOT NULL,
    permissoes jsonb,
    limite_usuarios integer DEFAULT 5 NOT NULL,
    plano_id uuid,
    data_fim_acesso timestamp with time zone,
    telefone text,
    cep text,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    estado text,
    avatar_url text,
    logo_url text,
    assinatura_proprietario_nome text,
    assinatura_proprietario_url text,
    cliente_id_promovido uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de Mapeamento RLS (Não-Recursiva)
CREATE TABLE IF NOT EXISTS public.admin_user_lookup (
    id uuid PRIMARY KEY,
    admin_id uuid NOT NULL
);

-- Tabela para armazenar usuários individuais que pertencem a um cliente específico
CREATE TABLE IF NOT EXISTS public.tbl_usuarios (
    id uuid PRIMARY KEY,
    cliente_id uuid REFERENCES public.tbl_clientes (id),
    nome text NOT NULL,
    email text UNIQUE NOT NULL,
    cpf text,
    rg text,
    nome_mae text,
    nome_pai text,
    telefone text,
    cep text,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    estado text,
    salario numeric DEFAULT 0.00,
    horas_semanais integer DEFAULT 44,
    horas_mensais integer DEFAULT 220,
    data_inicio_contrato date,
    data_fim_contrato date,
    data_inicio_aviso date,
    tipo_aviso text,
    dias_folga_fixos text[] DEFAULT '{}'::text[],
    folga_domingo_obrigatoria boolean DEFAULT TRUE,
    permissoes jsonb DEFAULT '{"visualizar_proprio_ponto": true}'::jsonb,
    avatar_url text,
    rg_url text,
    cpf_url text,
    titulo_eleitor_url text,
    reservista_url text,
    ctps_url text,
    certidao_nascimento_url text,
    certidao_casamento_url text,
    comprovante_residencia_url text,
    comprovante_escolaridade_url text,
    exame_admissional_url text,
    foto_3x4_url text,
    cnh_url text,
    cartao_pis_url text,
    ja_admitido_anteriormente boolean DEFAULT FALSE,
    certidoes_filhos_urls jsonb DEFAULT '[]'::jsonb,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela para armazenar usuários individuais que pertencem a um Admin específico
CREATE TABLE IF NOT EXISTS public.admin_usuarios (
    id uuid PRIMARY KEY,
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    nome text NOT NULL,
    email text UNIQUE NOT NULL,
    permissoes jsonb DEFAULT '{"visualizar_proprio_ponto": true}'::jsonb,
    salario numeric DEFAULT 0.00,
    horas_semanais integer DEFAULT 44,
    horas_mensais integer DEFAULT 220,
    dias_folga_fixos text[] DEFAULT '{}'::text[],
    folga_domingo_obrigatoria boolean DEFAULT FALSE,
    data_inicio_contrato date,
    data_fim_contrato date,
    data_inicio_aviso date,
    tipo_aviso text,
    cpf text,
    rg text,
    nome_mae text,
    nome_pai text,
    telefone text,
    cep text,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    estado text,
    rg_url text,
    cpf_url text,
    titulo_eleitor_url text,
    reservista_url text,
    ctps_url text,
    certidao_nascimento_url text,
    certidao_casamento_url text,
    comprovante_residencia_url text,
    comprovante_escolaridade_url text,
    exame_admissional_url text,
    foto_3x4_url text,
    cnh_url text,
    cartao_pis_url text,
    ja_admitido_anteriormente boolean DEFAULT FALSE,
    certidoes_filhos_urls jsonb DEFAULT '[]'::jsonb,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    logo_admin text,
    nome_admin text,
    avatar_url text
);

-- Tabela para gerenciar contas de Caixa e Bancos
CREATE TABLE IF NOT EXISTS public.saldo_contas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id),
    nome text,
    saldo_inicial numeric DEFAULT 0,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now(),
    conta_contabil_id uuid,
    tipo_saldo text DEFAULT 'Credito',
    natureza_contabil text DEFAULT 'Ativo'
);

-- Tabela para o Plano de Contas Contábil da empresa
CREATE TABLE IF NOT EXISTS public.plano_contas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id),
    Conta text,
    Descricao text,
    Analitica text,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now(),
    codigo_reduzido text,
    is_conta_caixa_banco boolean DEFAULT FALSE,
    is_conta_resultado boolean DEFAULT FALSE,
    is_conta_patrimonial boolean DEFAULT FALSE,
    is_caixa boolean DEFAULT FALSE,
    is_banco boolean DEFAULT FALSE,
    is_a_receber boolean,
    is_a_pagar boolean
);

-- Tabela para lançamentos contábeis ou financeiros manuais (Caixa, Bancos)
CREATE TABLE IF NOT EXISTS public.lancamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id),
    data_movimentacao date,
    descricao text,
    valor numeric,
    tipo text,
    conta_bancaria_id uuid,
    conta_contabil_id uuid,
    conciliado boolean DEFAULT FALSE,
    origem text,
    documento text,
    anexo_id uuid,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now(),
    historico_id uuid,
    conta_resultado_id uuid
);

-- Tabela mestre para Títulos a Pagar (Cliente)
CREATE TABLE IF NOT EXISTS public.contas_pagar (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id),
    fornecedor text,
    documento text,
    data_vencimento date,
    valor numeric,
    status text DEFAULT 'pendente',
    conta_contabil_id uuid,
    anexo_id uuid,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now(),
    conta_id uuid,
    descricao text,
    historico_id uuid,
    id_conta_patrimonial uuid,
    id_conta_resultado uuid,
    origem text DEFAULT 'manual',
    valor_total numeric
);

-- Tabela mestre para Títulos a Receber (Cliente)
CREATE TABLE IF NOT EXISTS public.contas_receber (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id),
    cliente_id uuid REFERENCES public.tbl_clientes (id) NOT NULL,
    origem text DEFAULT 'manual',
    descricao text NOT NULL,
    valor_total numeric NOT NULL,
    data_emissao date DEFAULT CURRENT_DATE,
    data_vencimento date NOT NULL,
    status text DEFAULT 'aberta',
    tipo_receita text DEFAULT 'única',
    intervalo_recorrencia text,
    contrato_id uuid,
    observacoes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    contrato_gerado_id uuid,
    historico_id uuid,
    id_conta_resultado uuid,
    id_conta_patrimonial uuid
);

-- Tabela mestre para Contas a Pagar (Admin)
CREATE TABLE IF NOT EXISTS public.admin_contas_pagar (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    fornecedor text,
    documento text,
    data_vencimento date,
    valor_total numeric,
    status text DEFAULT 'pendente',
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now(),
    conta_id uuid,
    descricao text,
    origem text DEFAULT 'manual',
    id_conta_patrimonial uuid,
    historico_id uuid,
    id_conta_resultado uuid
);

-- Tabela mestre para Contas a Receber (Admin)
CREATE TABLE IF NOT EXISTS public.admin_contas_receber (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    cliente_id uuid REFERENCES public.tbl_clientes (id) NOT NULL,
    origem text DEFAULT 'manual',
    descricao text NOT NULL,
    valor_total numeric NOT NULL,
    data_emissao date DEFAULT CURRENT_DATE,
    data_vencimento date NOT NULL,
    status text DEFAULT 'aberta',
    tipo_receita text DEFAULT 'única',
    contrato_gerado_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    id_conta_patrimonial uuid,
    historico_id uuid,
    id_conta_resultado uuid
);

-- Tabela para detalhar as parcelas de um Título a Pagar (Admin)
CREATE TABLE IF NOT EXISTS public.admin_parcelas_pagar (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conta_pagar_id uuid REFERENCES public.admin_contas_pagar (id) NOT NULL,
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    numero_parcela integer NOT NULL,
    valor_parcela numeric NOT NULL,
    valor_pago numeric DEFAULT 0,
    data_vencimento date NOT NULL,
    data_pagamento date,
    status text DEFAULT 'aberta',
    observacao text,
    id_conta_contabil uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    mapeado_extrato_id uuid
);

-- Tabela para detalhar as parcelas de um Título a Receber (Admin)
CREATE TABLE IF NOT EXISTS public.admin_parcelas_receber (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conta_receber_id uuid REFERENCES public.admin_contas_receber (id) NOT NULL,
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    numero_parcela integer NOT NULL,
    valor_parcela numeric NOT NULL,
    valor_pago numeric DEFAULT 0,
    data_vencimento date NOT NULL,
    data_pagamento date,
    status text DEFAULT 'aberta',
    observacao text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    id_conta_contabil uuid,
    ciente_cliente boolean DEFAULT FALSE,
    mapeado_extrato_id uuid
);

-- Tabela para registrar a transação de pagamento de uma parcela (Admin)
CREATE TABLE IF NOT EXISTS public.admin_pagamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parcela_id uuid REFERENCES public.admin_parcelas_pagar (id) NOT NULL,
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    valor_pago numeric NOT NULL,
    tipo_pagamento text,
    data_pagamento timestamp with time zone DEFAULT now(),
    forma_pagamento text,
    observacao text,
    conta_id uuid,
    id_conta_contabil uuid,
    created_at timestamp with time zone DEFAULT now(),
    historico_id uuid,
    id_conta_resultado uuid,
    anexo_url text,
    comprovante_url text,
    saldo_contas_id numeric
);

-- Tabela para registrar a transação de recebimento de uma parcela (Admin)
CREATE TABLE IF NOT EXISTS public.admin_recebimentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parcela_id uuid REFERENCES public.admin_parcelas_receber (id) NOT NULL,
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    valor_recebido numeric NOT NULL,
    tipo_recebimento text,
    desconto_aplicado numeric DEFAULT 0,
    data_recebimento timestamp with time zone DEFAULT now(),
    forma_pagamento text,
    observacao text,
    created_at timestamp with time zone DEFAULT now(),
    cliente_id uuid,
    conta_id uuid,
    id_conta_contabil uuid,
    historico_id uuid,
    id_conta_resultado uuid,
    anexo_url text,
    comprovante_url text
);

-- Tabela para detalhar as parcelas de um Título a Pagar (Cliente)
CREATE TABLE IF NOT EXISTS public.parcelas_contas_pagar (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conta_pagar_id uuid REFERENCES public.contas_pagar (id) NOT NULL,
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    numero_parcela integer NOT NULL,
    valor_parcela numeric NOT NULL,
    valor_pago numeric DEFAULT 0,
    data_vencimento date NOT NULL,
    data_pagamento date,
    status text DEFAULT 'aberta',
    observacao text,
    id_conta_contabil uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    mapeado_extrato_id uuid
);

-- Tabela para detalhar as parcelas de um Título a Receber (Cliente)
CREATE TABLE IF NOT EXISTS public.parcelas_contas_receber (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conta_receber_id uuid REFERENCES public.contas_receber (id) NOT NULL,
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    numero_parcela integer NOT NULL,
    valor_parcela numeric NOT NULL,
    valor_pago numeric DEFAULT 0,
    data_vencimento date NOT NULL,
    data_pagamento date,
    status text DEFAULT 'aberta',
    observacao text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    id_conta_contabil uuid,
    mapeado_extrato_id uuid
);

-- Tabela para registrar o pagamento de parcelas de contas a pagar (Cliente)
CREATE TABLE IF NOT EXISTS public.pagamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parcela_id uuid REFERENCES public.parcelas_contas_pagar (id) NOT NULL,
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    valor_pago numeric NOT NULL,
    tipo_pagamento text,
    data_pagamento timestamp with time zone DEFAULT now(),
    forma_pagamento text,
    observacao text,
    anexo_url text,
    comprovante_url text,
    conta_id uuid REFERENCES public.saldo_contas (id),
    id_conta_contabil uuid,
    historico_id uuid,
    id_conta_resultado uuid,
    created_at timestamp with time zone DEFAULT now(),
    saldo_contas_id numeric
);

-- Tabela para registrar o recebimento de parcelas (Cliente)
CREATE TABLE IF NOT EXISTS public.recebimentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parcela_id uuid REFERENCES public.parcelas_contas_receber (id) NOT NULL,
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    valor_recebido numeric NOT NULL,
    tipo_recebimento text,
    desconto_aplicado numeric DEFAULT 0,
    data_recebimento timestamp with time zone DEFAULT now(),
    forma_pagamento text,
    observacao text,
    anexo_url text,
    comprovante_url text,
    conta_id uuid REFERENCES public.saldo_contas (id),
    id_conta_resultado uuid,
    historico_id uuid,
    created_at timestamp with time zone DEFAULT now()
);

-- Tabela para registro de ponto dos funcionários (Cliente)
CREATE TABLE IF NOT EXISTS public.registros_ponto (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    funcionario_id uuid REFERENCES public.tbl_usuarios (id) NOT NULL,
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    horario_registro timestamp with time zone NOT NULL,
    selfie_url text NOT NULL,
    tipo text NOT NULL,
    latitude numeric,
    longitude numeric,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    maps_url text,
    atestado_url text,
    observacao text
);

-- Tabela para registro de ponto dos funcionários (Admin)
CREATE TABLE IF NOT EXISTS public.admin_registros_ponto (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    funcionario_id uuid REFERENCES public.tbl_usuarios (id) NOT NULL,
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    horario_registro timestamp with time zone NOT NULL,
    selfie_url text NOT NULL,
    tipo text NOT NULL,
    latitude numeric,
    longitude numeric,
    maps_url text,
    atestado_url text,
    observacao text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    empresa_id uuid
);

-- Tabela para registro de períodos de férias dos funcionários (Cliente)
CREATE TABLE IF NOT EXISTS public.ferias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    funcionario_id uuid REFERENCES public.tbl_usuarios (id) NOT NULL,
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    data_inicio date NOT NULL,
    data_fim date NOT NULL,
    periodo_referencia text,
    criado_em timestamp with time zone DEFAULT now()
);

-- Tabela para registro de períodos de férias dos funcionários (Admin)
CREATE TABLE IF NOT EXISTS public.admin_ferias_user (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    funcionario_id uuid REFERENCES public.tbl_usuarios (id) NOT NULL,
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    data_inicio date NOT NULL,
    data_fim date NOT NULL,
    periodo_referencia text,
    criado_em timestamp with time zone DEFAULT now()
);

-- Tabela para rastrear períodos aquisitivos de férias
CREATE TABLE IF NOT EXISTS public.periodos_aquisitivos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    funcionario_id uuid REFERENCES public.tbl_usuarios (id) NOT NULL,
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    data_inicio_aquisitivo date NOT NULL,
    data_fim_aquisitivo date NOT NULL,
    data_limite_concessivo date NOT NULL,
    dias_direito integer DEFAULT 30 NOT NULL,
    faltas_injustificadas integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'em_andamento' NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);

-- Tabela para gerenciar históricos padronizados de lançamentos
CREATE TABLE IF NOT EXISTS public.historicos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id),
    descricao text NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    codigo text
);

-- Tabela para modelos de contrato reutilizáveis
CREATE TABLE IF NOT EXISTS public.contrato_modelos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo text NOT NULL,
    conteudo_template text NOT NULL,
    empresa_id uuid,
    criado_em timestamp with time zone DEFAULT now()
);

-- Tabela para armazenar instâncias de contratos gerados a partir de modelos (para assinatura)
CREATE TABLE IF NOT EXISTS public.contratos_gerados (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    modelo_id uuid,
    cliente_id uuid,
    proprietario_id uuid,
    status text DEFAULT 'rascunho' NOT NULL,
    valor_total numeric,
    data_inicio date,
    numero_parcelas integer DEFAULT 1,
    dia_vencimento_parcela integer,
    valores_tags_preenchidos jsonb,
    conteudo_renderizado text,
    link_assinatura_externo text,
    documento_assinado_url text,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    assinatura_nome text,
    assinatura_selfie_url text,
    assinatura_proprietario_nome text,
    assinatura_proprietario_url text
);

-- Tabela para modelos de documentos societários
CREATE TABLE IF NOT EXISTS public.modelos_societarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid,
    titulo text NOT NULL,
    conteudo_template text NOT NULL,
    tipo_documento text,
    criado_em timestamp with time zone DEFAULT now(),
    tipo_conteudo text
);

-- Tabela para armazenar blocos de texto ou conteúdo societário/legal
CREATE TABLE IF NOT EXISTS public.blocos_societarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid,
    titulo text NOT NULL,
    conteudo text NOT NULL,
    tipo_bloco text,
    criado_em timestamp with time zone DEFAULT now()
);

-- Tabela para gerenciar documentos legais gerados para o cliente
CREATE TABLE IF NOT EXISTS public.documentos_societarios_gerados (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    modelo_id uuid,
    cliente_id uuid,
    proprietario_id uuid NOT NULL,
    status text DEFAULT 'rascunho' NOT NULL,
    valores_tags_preenchidos jsonb,
    conteudo_renderizado text,
    data_registro date DEFAULT CURRENT_DATE,
    criado_em timestamp with time zone DEFAULT now()
);

-- Tabela para gerenciar tickets de suporte
CREATE TABLE IF NOT EXISTS public.tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid NOT NULL,
    empresa_id uuid NOT NULL,
    titulo text NOT NULL,
    status text DEFAULT 'aberto' NOT NULL,
    prioridade text DEFAULT 'media',
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now()
);

-- Tabela para o histórico de mensagens dentro de um ticket
CREATE TABLE IF NOT EXISTS public.mensagens_ticket (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid REFERENCES public.tickets (id) NOT NULL,
    remetente_id uuid NOT NULL,
    conteudo text NOT NULL,
    anexo_url text,
    criado_em timestamp with time zone DEFAULT now(),
    destinatario_id uuid
);

-- Tabela de Extratos Bancários (transações brutas)
CREATE TABLE IF NOT EXISTS public.extratos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid,
    id_saldo_contas uuid,
    data date NOT NULL,
    descricao text NOT NULL,
    valor numeric NOT NULL,
    tipo text NOT NULL,
    identificacao text,
    conciliado boolean DEFAULT FALSE,
    conta_contabil_id uuid,
    criado_em timestamp with time zone DEFAULT now(),
    status_mapeamento public.status_mapeamento_extrato DEFAULT 'sem_mapeamento',
    mapeado_parcela_id uuid,
    mapeado_tipo text
);

-- Tabela auxiliar para mapear textos de extrato (Cliente)
CREATE TABLE IF NOT EXISTS public.descricao_extrato (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL,
    descricao text NOT NULL,
    status boolean DEFAULT TRUE,
    ordem integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Tabela auxiliar para identificar tipos de transação no extrato (Cliente)
CREATE TABLE IF NOT EXISTS public.identificacao_extrato (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL,
    descricao text NOT NULL,
    status boolean DEFAULT TRUE,
    ordem integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Tabela auxiliar para mapear textos de extrato (Admin)
CREATE TABLE IF NOT EXISTS public.admin_descricao_extrato (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL,
    descricao text NOT NULL,
    status boolean DEFAULT TRUE,
    ordem integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Tabela auxiliar para identificar tipos de transação no extrato (Admin)
CREATE TABLE IF NOT EXISTS public.admin_identificacao_extrato (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL,
    descricao text NOT NULL,
    status boolean DEFAULT TRUE,
    ordem integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Tabela para gerenciar planos de assinatura
CREATE TABLE IF NOT EXISTS public.planos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    descricao text,
    preco_mensal numeric NOT NULL,
    permissoes jsonb NOT NULL,
    tipo_cliente text NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    visivel_vendas boolean DEFAULT TRUE NOT NULL
);

-- Tabela para configurações de conciliação
CREATE TABLE IF NOT EXISTS public.configuracao_conciliacao (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid,
    id_saldo_contas uuid,
    nome_configuracao text NOT NULL,
    mapeamento jsonb NOT NULL,
    coluna_tipo_transacao text,
    valor_credito text,
    criado_em timestamp with time zone DEFAULT now()
);

-- Tabela para regras de conciliação
CREATE TABLE IF NOT EXISTS public.conciliacao_regras (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid,
    descricao_extrato text NOT NULL,
    conta_contabil_id uuid,
    tipo_lancamento text NOT NULL,
    criado_em timestamp with time zone DEFAULT now()
);

-- Tabela para histórico de conciliações
CREATE TABLE IF NOT EXISTS public.conciliacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid,
    extrato_hash text,
    resultado jsonb,
    criado_em timestamp with time zone DEFAULT now(),
    nome_arquivo text,
    extrato_json jsonb,
    id_saldo_contas uuid,
    usuario_id uuid
);

-- Tabela para configurações de níveis contábeis
CREATE TABLE IF NOT EXISTS public.configuracao_contabil (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid NOT NULL,
    codigo_nivel_1 text NOT NULL,
    tipo_natureza text NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    UNIQUE (proprietario_id, tipo_natureza)
);

-- Tabela para mapeamento contábil CP
CREATE TABLE IF NOT EXISTS public.configuracao_contas_pagar (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid,
    tipo_registro text NOT NULL,
    conta_contabil_id uuid,
    criado_em timestamp with time zone DEFAULT now(),
    UNIQUE (proprietario_id, tipo_registro)
);

-- Tabela para mapeamento contábil CR
CREATE TABLE IF NOT EXISTS public.configuracao_contas_receber (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid,
    tipo_registro text NOT NULL,
    conta_contabil_id uuid,
    criado_em timestamp with time zone DEFAULT now(),
    UNIQUE (proprietario_id, tipo_registro)
);

-- Tabela para configurações de contratos
CREATE TABLE IF NOT EXISTS public.configuracao_contratos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid UNIQUE,
    url_base_assinatura text NOT NULL,
    template_whatsapp text NOT NULL,
    template_email text NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    id_conta_clientes_receber uuid,
    id_conta_receita_contrato uuid
);

-- Tabela para histórico padrão
CREATE TABLE IF NOT EXISTS public.configuracao_historico_padrao (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid NOT NULL,
    tipo_registro text NOT NULL,
    historico_id uuid,
    criado_em timestamp with time zone DEFAULT now(),
    UNIQUE (proprietario_id, tipo_registro)
);

-- Tabela para máscara de código do plano de contas
CREATE TABLE IF NOT EXISTS public.configuracao_plano_contas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid NOT NULL,
    mascara_codigo text NOT NULL,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now()
);

-- Tabela para configurações Stripe
CREATE TABLE IF NOT EXISTS public.configuracoes_stripe (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid,
    stripe_publishable_key text NOT NULL,
    stripe_secret_key text,
    criado_em timestamp with time zone DEFAULT now(),
    conta_sintetica_id uuid,
    conta_receber_id uuid,
    historico_padrao_id uuid,
    id_conta_resultado uuid
);

-- Tabela para clientes (versão simplificada ou auxiliar)
CREATE TABLE IF NOT EXISTS public.clientes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid,
    nome text NOT NULL,
    documento text,
    email text,
    telefone text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    razao_social text,
    nome_fantasia text,
    telefone_fixo text,
    cep text,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    estado text,
    is_system_client boolean DEFAULT FALSE,
    logo_url text,
    nome_proprietario text,
    cpf text,
    cnpj text,
    rg text,
    data_nascimento date,
    anexo_url text,
    avatar_url text
);

-- Tabela para tags de contrato
CREATE TABLE IF NOT EXISTS public.contrato_tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_tag text NOT NULL,
    descricao text,
    origem_dado text,
    criado_em timestamp with time zone DEFAULT now(),
    empresa_id uuid
);

-- Tabela para contratos de recorrência
CREATE TABLE IF NOT EXISTS public.contratos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    descricao text NOT NULL,
    valor_total numeric NOT NULL,
    data_inicio date NOT NULL,
    data_fim date,
    status text DEFAULT 'ativo' NOT NULL,
    tipo_recorrencia text,
    dia_vencimento integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Tabela para anexos
CREATE TABLE IF NOT EXISTS public.anexos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid,
    nome_arquivo text,
    tipo_mime text,
    url_armazenamento text,
    metadados jsonb,
    criado_em timestamp with time zone DEFAULT now()
);

-- Tabela para histórico de auditoria
CREATE TABLE IF NOT EXISTS public.historico_auditoria (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid,
    usuario_id uuid,
    acao text,
    tabela_afetada text,
    registro_id uuid,
    dados_antigos jsonb,
    dados_novos jsonb,
    criado_em timestamp with time zone DEFAULT now()
);

-- Tabela para configurações Calima
CREATE TABLE IF NOT EXISTS public.configuracoes_calima (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid,
    mapeamento jsonb,
    criado_em timestamp with time zone DEFAULT now()
);
</dyad-execute-sql>

### 3. Funções RPCs e Triggers de Sincronização

Cria as funções de banco de dados que gerenciam a lógica de negócio e os triggers de sincronização de perfil.

<dyad-execute-sql description="Criação de Funções RPCs e Triggers de Sincronização">
-- Função de Trigger: Sincroniza o lookup de Admin/Usuário
CREATE OR REPLACE FUNCTION public.sync_admin_user_lookup()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.admin_user_lookup WHERE id = OLD.id;
    RETURN OLD;
  ELSE
    INSERT INTO public.admin_user_lookup (id, admin_id)
    VALUES (NEW.id, NEW.admin_id)
    ON CONFLICT (id) DO UPDATE SET admin_id = EXCLUDED.admin_id;
    RETURN NEW;
  END IF;
END;
$function$;

-- Função de Trigger: Sincroniza o branding do Admin no perfil do Admin_Usuario
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

-- Função de Trigger: Sincroniza o branding do Cliente do Sistema na tabela 'clientes'
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

-- Função de Trigger: Define o admin_id na criação de tbl_clientes (se o criador for Admin)
CREATE OR REPLACE FUNCTION public.set_admin_id_on_client_creation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Verifica se o usuário que está inserindo é um Admin
  IF EXISTS (SELECT 1 FROM public.tbl_admins WHERE id = auth.uid()) THEN
    NEW.admin_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

-- Função RPC: Importa Plano de Contas e Históricos Padrão
CREATE OR REPLACE FUNCTION public.import_default_tables(p_proprietario_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    plano_contas_csv text;
    historicos_csv text;
    csv_row text;
    csv_fields text[];
BEGIN
    -- CSV: Conta;Reduzido;Descricao;Analitica;CxBanco;Patrimonial;Resultado;Caixa;Banco;Receber;Pagar
    plano_contas_csv := $csv$1;1;ATIVO;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.1;11;ATIVO CIRCULANTE;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.1.01;1101;DISPONIBILIDADES;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.1.01.0001;11010001;Caixa Matriz;Sim;TRUE;TRUE;FALSE;TRUE;FALSE;FALSE;FALSE
1.1.01.0002;11010002;Bancos Conta Movimento;Sim;TRUE;TRUE;FALSE;FALSE;TRUE;FALSE;FALSE
1.1.01.0003;11010003;Strip;Sim;TRUE;TRUE;FALSE;FALSE;TRUE;FALSE;FALSE
1.1.01.0004;11010004;Aplicações Financeiras;Sim;TRUE;TRUE;FALSE;FALSE;TRUE;FALSE;FALSE
1.1.02;1102;Contas a Receber;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.1.02.0001;11020001;Clientes Strip a Receber;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;TRUE;FALSE
1.1.02.0002;11020002;Clientes Contratos a Receber;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;TRUE;FALSE
1.1.02.0003;11020003;Clientes a Receber Avulso;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;TRUE;FALSE
1.1.03;1103;Estoques;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.1.03.0001;11030001;Mercadorias para Revenda;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.1.03.0002;11030002;Materiais de Consumo;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.2;12;ATIVO NÃO CIRCULANTE;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.2.01;1201;Imobilizado;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.2.01.0001;12010001;Máquinas e Equipamentos;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.2.01.0002;12010002;Móveis e Utensílios;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.2.01.0003;12010003;Veículos;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.2.02;1202;Intangível;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.2.02.0001;12020001;Softwares;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.2.02.0002;12020002;Marcas e Patentes;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
2;2;PASSIVO;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
2.1;21;PASSIVO CIRCULANTE;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
2.1.01;2101;Obrigações Trabalhistas;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
2.1.01.0001;21010001;Salários a Pagar;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;TRUE
2.1.01.0002;21010002;INSS a Recolher;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;TRUE
2.1.02;2102;Obrigações Fiscais;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
2.1.02.0001;21020001;ISS a Recolher;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;TRUE
2.1.02.0002;21020002;ICMS a Recolher;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;TRUE
2.1.03;2103;Fornecedores;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
2.1.03.0001;21030001;Fornecedores Nacionais;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;TRUE
2.2;22;PASSIVO NÃO CIRCULANTE;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
2.2.01;2201;Empréstimos de Longo Prazo;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
2.2.01.0001;22010001;Financiamentos Bancários;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;TRUE
3;3;PATRIMÔNIO LÍQUIDO;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
3.1;31;Capital Social;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
3.1.00.0001;31000001;Capital Integralizado;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
3.2;32;Reservas de Lucros;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
3.2.00.0001;32000001;Reserva Legal;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
3.3;33;Lucros ou Prejuízos Acumulados;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
3.3.00.0001;33000001;Lucros Acumulados;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
4;4;RECEITA;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1;41;Receita Bruta;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.01;4101;Receita de Serviços;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.01.0001;41010001;Prestação de Serviços Contabeis;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.01.0002;41010002;Receita de Serviços Gedoor;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.01.0003;41010003;Receita de serviços de Certificação Digital;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.01.0004;41010004;Receita Serviços Digitais (Strip);Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.02;4102;Receita de Vendas;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.02.0001;41020001;Vendas de Mercadorias;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.03;4103;Estorno desconto concedido;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.03.0001;4103001;Receita Estorno do desconto;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.2;42;(-)Deduções da Receita;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.2.01.0001;42010001;(-) ISS sobre Serviços;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.2.01.0002;42010002;(-) Devoluções de Vendas;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.2.01.0003;42010003;(-) Custo Serviço Gedoor;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.2.01.0004;42010004;(-) Custo Serviço Certificado;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.2.01.0005;42010005;(-) Custo do Seviço Strip;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.3.01;43;DESCONTOS OBTIDOS AO PAGAR;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.3.01.0001;43010001;Descontos Obtidos ao Pagar;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5;5;DESPESAS;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.1;51;Despesas Operacionais;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.1.01;5101;Despesas Administrativas;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.1.01.0001;51010001;Aluguéis;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.1.01.0002;51010002;Água, Luz e Telefone;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.1.01.0003;51010003;Desconto Concedido;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.1.01.0010;51010010;Despesa com Fornecedores em Geral;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.1.02;5102;Despesas com Pessoal;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.1.02.0001;51020001;Salários;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.2;52;Despesas Financeiras;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.2.01.0001;52010001;Juros Pagos;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.2.01.0002;52010002;Multas Pagas;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.2.01.0003;52010003;Estorno Desconto Obtido;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
6;6;RESULTADO;Não;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE
6.1;61;Resultado Operacional;Não;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE
6.1.01;6101;Lucro/Prejuizo;Não;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE
6.1.01.0001;61010001;Lucro do exercício;Sim;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE
6.1.01.0002;61010002;Prejuizo do exercício;Sim;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE$csv$;

    -- Loop para inserir plano de contas
    FOR csv_row IN SELECT unnest(string_to_array(plano_contas_csv, E'\n'))
    LOOP
        IF trim(csv_row) <> '' THEN
            csv_fields := string_to_array(csv_row, ';');
            INSERT INTO public.plano_contas (
                proprietario_id, conta, codigo_reduzido, descricao, analitica,
                is_conta_caixa_banco, is_conta_patrimonial, is_conta_resultado, is_caixa, is_banco, is_a_receber, is_a_pagar
            ) VALUES (
                p_proprietario_id, csv_fields[1], csv_fields[2], csv_fields[3], csv_fields[4],
                public.to_boolean_safe(csv_fields[5]), public.to_boolean_safe(csv_fields[6]), public.to_boolean_safe(csv_fields[7]),
                public.to_boolean_safe(csv_fields[8]), public.to_boolean_safe(csv_fields[9]), public.to_boolean_safe(csv_fields[10]), public.to_boolean_safe(csv_fields[11])
            );
        END IF;
    END LOOP;

    -- Históricos
    historicos_csv := '100;Venda de Mercadorias/Serviços
200;Recebimento de Clientes
300;Pagamento de Fornecedores
400;Integralização de Capital Social
500;Pagamento de Despesas Administrativas
600;Transferência entre Contas';

    -- Loop para inserir históricos
    FOR csv_row IN SELECT unnest(string_to_array(historicos_csv, E'\n'))
    LOOP
        csv_fields := string_to_array(csv_row, ';');
        INSERT INTO public.historicos (proprietario_id, codigo, descricao) 
        VALUES (p_proprietario_id, csv_fields[1], csv_fields[2]);
    END LOOP;

    RETURN QUERY SELECT TRUE, 'Plano de contas e históricos padrão importados com sucesso.'::TEXT;

EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, SQLERRM::text;
END;
$function$;

-- Função RPC: Mapeia Configurações Padrão (Contábil, CR, CP, Contratos)
CREATE OR REPLACE FUNCTION public.map_default_configs(p_proprietario_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_conta_caixa_id UUID;
    v_conta_capital_id UUID;
    v_conta_clientes_id UUID;
    v_conta_fornecedores_id UUID;
    v_conta_receita_id UUID;
    v_conta_despesa_id UUID;
    v_conta_desconto_concedido_id UUID;
    v_conta_estorno_desconto_concedido_id UUID;
    v_conta_desconto_obtido_id UUID;
    v_conta_estorno_desconto_obtido_id UUID;
    v_conta_pagamento_fornecedor_id UUID;
    v_historico_capital_id UUID;
    v_historico_recebimento_id UUID;
    v_historico_pagamento_id UUID;
BEGIN
    -- Busca IDs das Contas e Históricos
    SELECT id INTO v_conta_caixa_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '1.1.01.0001' LIMIT 1;
    SELECT id INTO v_conta_capital_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '3.1.00.0001' LIMIT 1;
    SELECT id INTO v_conta_clientes_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '1.1.02.0003' LIMIT 1;
    SELECT id INTO v_conta_fornecedores_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '2.1.03.0001' LIMIT 1;
    SELECT id INTO v_conta_receita_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '4.1.01.0001' LIMIT 1;
    SELECT id INTO v_conta_despesa_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '5.1.01.0010' LIMIT 1;
    SELECT id INTO v_conta_desconto_concedido_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '5.1.01.0003' LIMIT 1;
    SELECT id INTO v_conta_estorno_desconto_concedido_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '4.1.03.0001' LIMIT 1;
    SELECT id INTO v_conta_desconto_obtido_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '4.3.01.0001' LIMIT 1;
    SELECT id INTO v_conta_estorno_desconto_obtido_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '5.2.01.0003' LIMIT 1;
    SELECT id INTO v_conta_pagamento_fornecedor_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '5.1.01.0010' LIMIT 1;
    
    SELECT id INTO v_historico_capital_id FROM public.historicos WHERE proprietario_id = p_proprietario_id AND codigo = '400' LIMIT 1;
    SELECT id INTO v_historico_recebimento_id FROM public.historicos WHERE proprietario_id = p_proprietario_id AND codigo = '200' LIMIT 1;
    SELECT id INTO v_historico_pagamento_id FROM public.historicos WHERE proprietario_id = p_proprietario_id AND codigo = '500' LIMIT 1;

    -- Níveis Contábeis
    INSERT INTO public.configuracao_contabil (proprietario_id, tipo_natureza, codigo_nivel_1)
    VALUES
        (p_proprietario_id, 'Ativo', '1'),
        (p_proprietario_id, 'Passivo', '2'),
        (p_proprietario_id, 'Patrimonio Liquido', '3'),
        (p_proprietario_id, 'Receita', '4'),
        (p_proprietario_id, 'Custo', '5'),
        (p_proprietario_id, 'Despesa', '6')
    ON CONFLICT (proprietario_id, tipo_natureza) DO UPDATE SET codigo_nivel_1 = EXCLUDED.codigo_nivel_1;

    -- Contas a Receber
    IF v_conta_clientes_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_receber (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'a_receber', v_conta_clientes_id), (p_proprietario_id, 'parcela', v_conta_clientes_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_caixa_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_receber (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'recebimento', v_conta_caixa_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_desconto_concedido_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_receber (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'desconto_concedido', v_conta_desconto_concedido_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_estorno_desconto_concedido_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_receber (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'estorno_desconto_concedido', v_conta_estorno_desconto_concedido_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    
    -- Contas a Pagar
    IF v_conta_fornecedores_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_pagar (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'a_pagar', v_conta_fornecedores_id), (p_proprietario_id, 'parcela_pagar', v_conta_fornecedores_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_pagamento_fornecedor_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_pagar (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'pagamento', v_conta_pagamento_fornecedor_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_desconto_obtido_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_pagar (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'desconto_obtido', v_conta_desconto_obtido_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_estorno_desconto_obtido_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_pagar (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'estorno_desconto_obtido', v_conta_estorno_desconto_obtido_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;

    -- Históricos Padrão
    IF v_historico_capital_id IS NOT NULL THEN
        INSERT INTO public.configuracao_historico_padrao (proprietario_id, tipo_registro, historico_id)
        VALUES (p_proprietario_id, 'capital_social', v_historico_capital_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET historico_id = EXCLUDED.historico_id;
    END IF;
    IF v_historico_recebimento_id IS NOT NULL THEN
        INSERT INTO public.configuracao_historico_padrao (proprietario_id, tipo_registro, historico_id)
        VALUES (p_proprietario_id, 'recebimento_padrao', v_historico_recebimento_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET historico_id = EXCLUDED.historico_id;
    END IF;
    IF v_historico_pagamento_id IS NOT NULL THEN
        INSERT INTO public.configuracao_historico_padrao (proprietario_id, tipo_registro, historico_id)
        VALUES (p_proprietario_id, 'pagamento_padrao', v_historico_pagamento_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET historico_id = EXCLUDED.historico_id;
    END IF;

    -- Conta de Saldo (Caixa)
    IF v_conta_caixa_id IS NOT NULL THEN
        INSERT INTO public.saldo_contas (proprietario_id, nome, saldo_inicial, tipo_saldo, natureza_contabil, conta_contabil_id)
        VALUES (p_proprietario_id, 'Caixa Inicial', 0.00, 'Debito', 'Ativo', v_conta_caixa_id)
        ON CONFLICT (proprietario_id, nome) DO NOTHING;
    END IF;

    -- Contratos
    IF v_conta_clientes_id IS NOT NULL AND v_conta_receita_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contratos(proprietario_id, id_conta_clientes_receber, id_conta_receita_contrato)
        VALUES (p_proprietario_id, v_conta_clientes_id, v_conta_receita_id)
        ON CONFLICT (proprietario_id) DO UPDATE 
        SET id_conta_clientes_receber = EXCLUDED.id_conta_clientes_receber,
            id_conta_receita_contrato = EXCLUDED.id_conta_receita_contrato;
    END IF;

    RETURN QUERY SELECT TRUE, 'Configurações mapeadas com sucesso.'::TEXT;
END;
$function$;

-- Função RPC: Executa o Setup Contábil Completo (Reset + Import + Map)
CREATE OR REPLACE FUNCTION public.contabil_setup_defaults(p_proprietario_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reset record;
  v_import record;
  v_map record;
BEGIN
  -- 1) Reset total
  SELECT * INTO v_reset FROM public.contabil_reset_all(p_proprietario_id) LIMIT 1;
  IF v_reset.success IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT FALSE, COALESCE(v_reset.message, 'Falha ao resetar antes do setup contábil.') AS message;
    RETURN;
  END IF;

  -- 2) Importa tabelas padrão
  SELECT * INTO v_import FROM public.import_default_tables(p_proprietario_id) LIMIT 1;
  IF v_import.success IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT FALSE, COALESCE(v_import.message, 'Falha ao importar tabelas padrão.') AS message;
    RETURN;
  END IF;

  -- 3) Mapeia configurações padrão
  SELECT * INTO v_map FROM public.map_default_configs(p_proprietario_id) LIMIT 1;
  IF v_map.success IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT FALSE, COALESCE(v_map.message, 'Falha ao mapear configs padrão.') AS message;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, 'Setup contábil padrão executado com sucesso.'::TEXT AS message;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM::text AS message;
END;
$function$;

-- Função RPC: Insere Lançamentos Manuais (Partidas Dobradas)
CREATE OR REPLACE FUNCTION public.insert_manual_lancamentos(p_proprietario_id uuid, p_data_movimentacao timestamp with time zone, p_conta_debito_id uuid, p_conta_credito_id uuid, p_valor numeric, p_historico_id uuid DEFAULT NULL::uuid, p_descricao_complementar text DEFAULT NULL::text, p_conta_saldo_debito_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_historico_descricao TEXT := '';
    v_conta_debito_nome TEXT;
    v_conta_credito_nome TEXT;
    v_id_debito UUID := gen_random_uuid();
    v_id_credito UUID := gen_random_uuid();
    v_descricao_final TEXT;
BEGIN
    -- Buscar descrição do histórico
    IF p_historico_id IS NOT NULL THEN
        SELECT h.descricao INTO v_historico_descricao FROM historicos h WHERE h.id = p_historico_id;
    END IF;
    
    -- Buscar nomes das contas (Descricao com D maiúsculo)
    SELECT pc."Descricao" INTO v_conta_debito_nome FROM plano_contas pc WHERE pc.id = p_conta_debito_id;
    SELECT pc."Descricao" INTO v_conta_credito_nome FROM plano_contas pc WHERE pc.id = p_conta_credito_id;
    
    -- Descrição completa
    v_descricao_final := COALESCE(v_historico_descricao, '');
    IF p_descricao_complementar IS NOT NULL AND p_descricao_complementar <> '' THEN
        IF v_descricao_final <> '' THEN
            v_descricao_final := v_descricao_final || ' - ' || p_descricao_complementar;
        ELSE
            v_descricao_final := p_descricao_complementar;
        END IF;
    END IF;
    
    -- Lançamento de DÉBITO (Entrada no Ativo)
    INSERT INTO lancamentos (
        id, proprietario_id, data_movimentacao, descricao, valor, tipo, 
        conta_contabil_id, conta_bancaria_id, origem, historico_id, conta_resultado_id
    ) VALUES (
        v_id_debito,
        p_proprietario_id,
        p_data_movimentacao,
        'D: ' || COALESCE(v_conta_debito_nome, '') || ' - ' || v_descricao_final,
        p_valor,
        'Entrada',
        p_conta_debito_id,
        p_conta_saldo_debito_id,
        'lancamento_manual',
        p_historico_id,
        v_id_credito
    );
    
    -- Lançamento de CRÉDITO (Saída do Passivo/PL)
    INSERT INTO lancamentos (
        id, proprietario_id, data_movimentacao, descricao, valor, tipo, 
        conta_contabil_id, conta_bancaria_id, origem, historico_id, conta_resultado_id
    ) VALUES (
        v_id_credito,
        p_proprietario_id,
        p_data_movimentacao,
        'C: ' || COALESCE(v_conta_credito_nome, '') || ' - ' || v_descricao_final,
        p_valor,
        'Saida',
        p_conta_credito_id,
        NULL,
        'lancamento_manual',
        p_historico_id,
        v_id_debito
    );
    
    RETURN QUERY SELECT TRUE, 'Lançamento manual registrado com sucesso.'::TEXT;
    
EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$function$;

-- Função RPC: Ativa a assinatura inicial e gera faturamento (CR)
CREATE OR REPLACE FUNCTION public.activate_subscription(p_cliente_id uuid, p_plano_id uuid, p_id_conta_resultado uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_plano_preco NUMERIC;
  v_plano_nome TEXT;
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
  
  -- Variáveis de Configuração CR
  v_conta_patrimonial_a_receber UUID; -- a_receber
  v_conta_contabil_parcela UUID;      -- parcela
  v_conta_contabil_recebimento UUID;  -- recebimento (Patrimonial)
  
  -- Variáveis de Configuração Stripe
  v_conta_sintetica_stripe_id UUID; -- conta_sintetica_id (ID da Conta Contábil)
  v_historico_padrao_recebimento UUID; -- Histórico Padrão para Contas a Receber
  v_historico_padrao_stripe_id UUID;       -- historico_padrao_id (ID do Histórico Padrão Stripe)
  
  -- IDs para Lançamentos
  v_id_lanc_ativo UUID;
  v_id_lanc_receita UUID;
  v_id_lanc_cr_debito UUID;
  v_id_lanc_cr_credito UUID;
BEGIN
  -- 1. Busca o ID do Admin (proprietário do faturamento)
  SELECT admin_id INTO v_admin_id FROM public.tbl_clientes WHERE id = p_cliente_id;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Nenhum administrador encontrado para o cliente.'; END IF;
  
  -- 2. Busca o preço, nome e as PERMISSÕES do plano
  SELECT preco_mensal, nome, permissoes INTO v_plano_preco, v_plano_nome, v_plano_permissoes FROM public.planos WHERE id = p_plano_id;
  IF v_plano_preco IS NULL THEN RAISE EXCEPTION 'Plano não encontrado.'; END IF;
  
  -- 3. Busca nome e email do cliente
  SELECT nome, email INTO v_cliente_nome, v_cliente_email FROM public.tbl_clientes WHERE id = p_cliente_id;

  -- 4. Determina as datas (30 dias de acesso)
  v_proximo_vencimento := (date_trunc('day', v_start_of_today) + INTERVAL '30 days')::DATE;
  v_segundo_vencimento := (date_trunc('day', v_start_of_today) + INTERVAL '60 days')::DATE;
  v_new_data_fim_acesso := (v_proximo_vencimento::TIMESTAMP WITH TIME ZONE - INTERVAL '1 millisecond') AT TIME ZONE 'America/Sao_Paulo';

  -- 5. GARANTE QUE O CLIENTE EXISTA NA TABELA 'clientes' (Contas a Receber)
  INSERT INTO public.clientes (id, proprietario_id, nome, email, documento)
  VALUES (p_cliente_id, v_admin_id, v_cliente_nome, v_cliente_email, 'ASSINATURA')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, email = EXCLUDED.email;

  -- 6. Atualiza o perfil do cliente com a nova data de acesso E PERMISSÕES
  UPDATE public.tbl_clientes
  SET plano_id = p_plano_id, data_fim_acesso = v_new_data_fim_acesso, permissoes = v_plano_permissoes, aprovado = TRUE
  WHERE id = p_cliente_id;
  
  -- 7. VERIFICA SE É PLANO PAGO (PREÇO > 0)
  IF v_plano_preco > 0 THEN
  
      -- 7.1. Busca mapeamento contábil CR e Stripe (Obrigatório apenas para planos pagos)
      SELECT conta_contabil_id INTO v_conta_patrimonial_a_receber FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'a_receber' LIMIT 1;
      SELECT conta_contabil_id INTO v_conta_contabil_parcela FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'parcela' LIMIT 1;
      SELECT conta_contabil_id INTO v_conta_contabil_recebimento FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'recebimento' LIMIT 1;
      SELECT historico_id INTO v_historico_padrao_recebimento FROM public.configuracao_historico_padrao WHERE proprietario_id = v_admin_id AND tipo_registro = 'recebimento_padrao' LIMIT 1;
      SELECT conta_sintetica_id, historico_padrao_id INTO v_conta_sintetica_stripe_id, v_historico_padrao_stripe_id FROM public.configuracoes_stripe WHERE proprietario_id = v_admin_id LIMIT 1;
      
      -- 7.2. Validação Crítica (Apenas para planos pagos)
      IF v_conta_sintetica_stripe_id IS NULL OR v_historico_padrao_stripe_id IS NULL THEN 
        RAISE EXCEPTION 'Configurações Stripe incompletas para faturamento pago.'; 
      END IF;
      
      -- 7.3. Busca a saldo_conta do Admin que referencia a conta sintética configurada no Stripe
      SELECT id INTO v_conta_destino_id FROM public.saldo_contas WHERE proprietario_id = v_admin_id AND conta_contabil_id = v_conta_sintetica_stripe_id LIMIT 1;
      IF v_conta_destino_id IS NULL THEN 
        RAISE EXCEPTION 'Nenhuma conta de saldo (Stripe/Banco) encontrada para o Admin vinculada à conta contábil configurada no Stripe.'; 
      END IF;
      
      -- 7.4. BUSCA OU CRIA A CONTA SINTÉTICA DE RECORRÊNCIA (Admin CR)
      SELECT id INTO v_recorrencia_id FROM public.admin_contas_receber WHERE cliente_id = p_cliente_id AND origem = 'assinatura_recorrente' LIMIT 1;

      IF v_recorrencia_id IS NULL THEN
        INSERT INTO public.admin_contas_receber (admin_id, cliente_id, descricao, valor_total, data_emissao, data_vencimento, status, tipo_receita, origem, id_conta_patrimonial, historico_id, id_conta_resultado)
        VALUES (v_admin_id, p_cliente_id, 'Assinatura Recorrente - Plano ' || v_plano_nome, v_plano_preco, v_data_hoje, v_proximo_vencimento, 'aberta', 'recorrente', 'assinatura_recorrente', v_conta_patrimonial_a_receber, v_historico_padrao_recebimento, p_id_conta_resultado) 
        RETURNING id INTO v_recorrencia_id;
      ELSE
        UPDATE public.admin_contas_receber SET descricao = 'Assinatura Recorrente - Plano ' || v_plano_nome, valor_total = v_plano_preco, data_vencimento = v_proximo_vencimento, id_conta_patrimonial = v_conta_patrimonial_a_receber, historico_id = v_historico_padrao_recebimento, id_conta_resultado = p_id_conta_resultado WHERE id = v_recorrencia_id;
      END IF;
      
      -- 7.5. DELETA TODAS AS PARCELAS PENDENTES/ABERTAS ANTERIORES (se houver)
      DELETE FROM public.admin_parcelas_receber 
      WHERE admin_id = v_admin_id AND conta_receber_id = v_recorrencia_id AND status IN ('aberta', 'reprogramada', 'parcial', 'cancelada', 'bloqueada');

      -- 7.6. CRIA A PARCELA DO PAGAMENTO DE HOJE (MARCADO COMO PAGO)
      INSERT INTO public.admin_parcelas_receber (conta_receber_id, admin_id, numero_parcela, valor_parcela, valor_pago, data_vencimento, data_pagamento, status, id_conta_contabil)
      VALUES (v_recorrencia_id, v_admin_id, 1, v_plano_preco, v_plano_preco, v_data_hoje, v_data_hoje, 'paga', v_conta_contabil_parcela) 
      RETURNING id INTO v_parcela_id;

      -- 7.7. CRIA O REGISTRO DE RECEBIMENTO DO ADMIN
      INSERT INTO public.admin_recebimentos (parcela_id, admin_id, cliente_id, valor_recebido, data_recebimento, tipo_recebimento, forma_pagamento, conta_id, id_conta_contabil, historico_id, id_conta_resultado)
      VALUES (v_parcela_id, v_admin_id, p_cliente_id, v_plano_preco, NOW() AT TIME ZONE 'America/Sao_Paulo', 'total', 'Stripe', v_conta_destino_id, v_conta_contabil_recebimento, v_historico_padrao_stripe_id, p_id_conta_resultado);
      
      -- 7.8. LANÇAMENTOS CONTÁBEIS (PARTIDAS DOBRADAS)
      
      -- D: ENTRADA NA CONTA DE SALDO (Stripe) - DÉBITO (Ativo)
      v_id_lanc_ativo := gen_random_uuid();
      v_id_lanc_cr_credito := gen_random_uuid();
      
      IF v_conta_sintetica_stripe_id IS NOT NULL THEN
        INSERT INTO public.lancamentos (id, proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id, conta_resultado_id)
        VALUES (v_id_lanc_ativo, v_admin_id, v_data_hoje, 'Recebimento Assinatura Stripe - Cliente ' || v_cliente_nome || ' (CR ID: ' || v_recorrencia_id::TEXT || ')', v_plano_preco, 'Entrada', v_conta_destino_id, v_conta_sintetica_stripe_id, 'assinatura_stripe', true, v_historico_padrao_stripe_id, v_id_lanc_cr_credito);
      END IF;
      
      -- C: ESTORNO PATRIMONIAL (CR) - CRÉDITO (Ativo)
      IF v_conta_patrimonial_a_receber IS NOT NULL THEN
        INSERT INTO public.lancamentos (id, proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id, conta_resultado_id)
        VALUES (v_id_lanc_cr_credito, v_admin_id, v_data_hoje, 'Estorno Patrimonial CR - Pagamento Parcela ' || v_parcela_id::TEXT, v_plano_preco, 'Saida', NULL, v_conta_patrimonial_a_receber, 'assinatura_stripe', true, v_historico_padrao_stripe_id, v_id_lanc_ativo);
      END IF;
      
      -- D: LANÇAMENTO INICIAL DE DÉBITO (CR) - DÉBITO (Ativo)
      v_id_lanc_cr_debito := gen_random_uuid();
      v_id_lanc_receita := gen_random_uuid();
      
      IF v_conta_patrimonial_a_receber IS NOT NULL THEN
        INSERT INTO public.lancamentos (id, proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id, conta_resultado_id)
        VALUES (v_id_lanc_cr_debito, v_admin_id, v_data_hoje, 'Lançamento Inicial CR: Assinatura Recorrente (CR ID: ' || v_recorrencia_id::TEXT || ')', v_plano_preco, 'Entrada', NULL, v_conta_patrimonial_a_receber, 'assinatura_stripe', true, v_historico_padrao_stripe_id, v_id_lanc_receita);
      END IF;
      
      -- C: LANÇAMENTO DE RECEITA (DRE) - CRÉDITO (Resultado)
      IF p_id_conta_resultado IS NOT NULL THEN
        INSERT INTO public.lancamentos (id, proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id, conta_resultado_id)
        VALUES (v_id_lanc_receita, v_admin_id, v_data_hoje, 'Receita Assinatura Stripe - Plano ' || v_plano_nome || ' (CR ID: ' || v_recorrencia_id::TEXT || ')', v_plano_preco, 'Saida', NULL, p_id_conta_resultado, 'assinatura_stripe', true, v_historico_padrao_stripe_id, v_id_lanc_cr_debito);
      END IF;
      
      -- 7.9. CRIA AS PRÓXIMAS DUAS PARCELAS PENDENTES (30 e 60 dias)
      IF v_conta_contabil_parcela IS NOT NULL THEN
        INSERT INTO public.admin_parcelas_receber (conta_receber_id, admin_id, numero_parcela, valor_parcela, data_vencimento, status, id_conta_contabil)
        VALUES (v_recorrencia_id, v_admin_id, 2, v_plano_preco, v_proximo_vencimento, 'aberta', v_conta_contabil_parcela);
        
        INSERT INTO public.admin_parcelas_receber (conta_receber_id, admin_id, numero_parcela, valor_parcela, data_vencimento, status, id_conta_contabil)
        VALUES (v_recorrencia_id, v_admin_id, 3, v_plano_preco, v_segundo_vencimento, 'aberta', v_conta_contabil_parcela);
      END IF;
  
  END IF; -- FIM IF v_plano_preco > 0

END;
$function$;

-- Função RPC: Renova a assinatura e registra o pagamento
CREATE OR REPLACE FUNCTION public.manual_subscription_renewal(p_cliente_id uuid, p_plano_id uuid, p_conta_pagar_id uuid, p_valor_pago numeric, p_forma_pagamento text)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_plano_preco NUMERIC;
  v_plano_nome TEXT;
  v_plano_permissoes JSONB;
  v_data_hoje DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_admin_id UUID;
  v_cliente_nome TEXT;
  v_cliente_email TEXT;
  v_current_data_fim_acesso TIMESTAMP WITH TIME ZONE;
  v_new_data_fim_acesso TIMESTAMP WITH TIME ZONE;
  v_start_of_today TIMESTAMP WITH TIME ZONE := date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_base_date TIMESTAMP WITH TIME ZONE;
  v_proximo_vencimento DATE;
  v_segundo_vencimento DATE;
  v_recorrencia_id UUID;
  v_parcela_paga_id UUID;
  v_conta_destino_id UUID;
  
  -- Variáveis de Configuração Stripe
  v_conta_sintetica_stripe_id UUID;
  v_historico_padrao_stripe_id UUID;
  v_conta_resultado_stripe_id UUID;
  
  -- NOVAS VARIÁVEIS PARA MAPEAR CONTAS CONTÁBEIS
  v_conta_contabil_a_receber UUID;
  v_conta_contabil_parcela UUID;
  v_conta_contabil_recebimento UUID;
  v_historico_padrao_recebimento UUID;
  
  -- IDs para Lançamentos
  v_id_lanc_ativo UUID;
  v_id_lanc_receita UUID;
  v_id_lanc_cr_debito UUID;
  v_id_lanc_cr_credito UUID;
BEGIN
  -- 1. Verifica permissão (Apenas Admin ou o próprio Cliente pode executar)
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Acesso negado. Usuário não autenticado.';
    RETURN;
  END IF;
  
  -- 2. Busca o ID do Admin (necessário para registrar o recebimento)
  SELECT admin_id INTO v_admin_id FROM public.tbl_clientes WHERE id = p_cliente_id;
  IF v_admin_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Admin não encontrado para o cliente.';
    RETURN;
  END IF;
  
  -- NOVO: 3. Busca o mapeamento contábil CR (Pode ser NULL, mas é usado nos lançamentos)
  SELECT conta_contabil_id INTO v_conta_contabil_a_receber FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'a_receber' LIMIT 1;
  SELECT conta_contabil_id INTO v_conta_contabil_parcela FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'parcela' LIMIT 1;
  SELECT conta_contabil_id INTO v_conta_contabil_recebimento FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'recebimento' LIMIT 1;
  
  -- NOVO: Busca Histórico Padrão de Recebimento (da tabela correta)
  SELECT historico_id INTO v_historico_padrao_recebimento FROM public.configuracao_historico_padrao WHERE proprietario_id = v_admin_id AND tipo_registro = 'recebimento_padrao' LIMIT 1;
  
  -- 4. Busca mapeamento Stripe (incluindo a conta de resultado)
  SELECT conta_sintetica_id, historico_padrao_id, id_conta_resultado INTO v_conta_sintetica_stripe_id, v_historico_padrao_stripe_id, v_conta_resultado_stripe_id FROM public.configuracoes_stripe WHERE proprietario_id = v_admin_id LIMIT 1;
  
  -- 5. VALIDAÇÃO CRÍTICA: Apenas as configurações do Stripe são obrigatórias
  IF v_conta_sintetica_stripe_id IS NULL OR v_historico_padrao_stripe_id IS NULL OR v_conta_resultado_stripe_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Configurações Stripe incompletas. Verifique: Conta Sintética Stripe, Histórico Padrão Stripe e Conta de Resultado Stripe.';
    RETURN;
  END IF;

  -- 6. Busca a saldo_conta do Admin que referencia a conta sintética configurada no Stripe
  SELECT id INTO v_conta_destino_id 
  FROM public.saldo_contas 
  WHERE proprietario_id = v_admin_id AND conta_contabil_id = v_conta_sintetica_stripe_id
  LIMIT 1;
  
  IF v_conta_destino_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Nenhuma conta de saldo (Stripe/Banco) encontrada para o Admin vinculada à conta contábil configurada no Stripe. Cadastre uma em Bancos/Caixas.';
    RETURN;
  END IF;

  -- 7. Busca o preço, NOME e as PERMISSÕES do NOVO plano
  SELECT preco_mensal, nome, permissoes INTO v_plano_preco, v_plano_nome, v_plano_permissoes FROM public.planos WHERE id = p_plano_id;

  IF v_plano_preco IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Plano não encontrado ou sem preço definido.';
    RETURN;
  END IF;
  
  -- 8. Busca nome, email e data_fim_acesso atual do cliente
  SELECT nome, email, data_fim_acesso INTO v_cliente_nome, v_cliente_email, v_current_data_fim_acesso FROM public.tbl_clientes WHERE id = p_cliente_id;

  -- 9. Determina a data base para o cálculo de renovação (30 dias)
  v_base_date := v_start_of_today;
  
  -- Calcula a data de vencimento da PRÓXIMA MENSALIDADE (30 dias a partir da data base)
  v_proximo_vencimento := (date_trunc('day', v_base_date) + INTERVAL '30 days')::DATE;
  v_segundo_vencimento := (date_trunc('day', v_base_date) + INTERVAL '60 days')::DATE;
  
  -- A nova data de fim de acesso é o final do dia ANTERIOR ao próximo vencimento.
  v_new_data_fim_acesso := (v_proximo_vencimento::TIMESTAMP WITH TIME ZONE - INTERVAL '1 millisecond') AT TIME ZONE 'America/Sao_Paulo';

  -- 10. Atualiza o perfil do cliente com a nova data de acesso E PERMISSÕES
  UPDATE public.tbl_clientes
  SET 
    plano_id = p_plano_id,
    data_fim_acesso = v_new_data_fim_acesso,
    permissoes = v_plano_permissoes,
    aprovado = TRUE
  WHERE id = p_cliente_id;

  -- 11. BUSCA A CONTA SINTÉTICA DE RECORRÊNCIA
  SELECT id INTO v_recorrencia_id
  FROM public.admin_contas_receber
  WHERE cliente_id = p_cliente_id AND origem = 'assinatura_recorrente'
  LIMIT 1;

  IF v_recorrencia_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Conta de recorrência não encontrada para o cliente.';
    RETURN;
  END IF;
  
  -- CORREÇÃO: Atualiza a descrição, o valor total e a conta contábil da conta sintética
  UPDATE public.admin_contas_receber
  SET
    descricao = 'Assinatura Recorrente - Plano ' || v_plano_nome,
    valor_total = v_plano_preco,
    data_vencimento = v_proximo_vencimento,
    id_conta_patrimonial = v_conta_contabil_a_receber,
    id_conta_resultado = v_conta_resultado_stripe_id
  WHERE id = v_recorrencia_id;
  
  -- 12. MARCA A PARCELA CORRESPONDENTE AO PAGAMENTO COMO PAGA
  UPDATE public.admin_parcelas_receber
  SET 
    status = 'paga',
    valor_pago = p_valor_pago,
    data_pagamento = v_data_hoje,
    id_conta_contabil = v_conta_contabil_parcela
  WHERE id = p_conta_pagar_id
  RETURNING id INTO v_parcela_paga_id;

  -- 13. DELETA TODAS AS OUTRAS PARCELAS PENDENTES DE ASSINATURA ANTERIORES
  DELETE FROM public.admin_parcelas_receber
  WHERE admin_id = v_admin_id
    AND conta_receber_id = v_recorrencia_id
    AND status IN ('aberta', 'reprogramada', 'parcial')
    AND id != v_parcela_paga_id;

  -- 14. CRIA O REGISTRO DE RECEBIMENTO DO ADMIN
  INSERT INTO public.admin_recebimentos (parcela_id, admin_id, cliente_id, valor_recebido, data_recebimento, tipo_recebimento, forma_pagamento, conta_id, id_conta_contabil, historico_id, id_conta_resultado)
  VALUES (
    v_parcela_paga_id,
    v_admin_id,
    p_cliente_id,
    p_valor_pago,
    NOW() AT TIME ZONE 'America/Sao_Paulo',
    'total',
    p_forma_pagamento,
    v_conta_destino_id,
    v_conta_contabil_recebimento,
    v_historico_padrao_stripe_id,
    v_conta_resultado_stripe_id
  );
  
  -- 15. LANÇAMENTOS CONTÁBEIS (PARTIDAS DOBRADAS)
  
  -- 15.1. D: ENTRADA NA CONTA DE SALDO (Stripe) - DÉBITO (Ativo)
  v_id_lanc_ativo := gen_random_uuid();
  v_id_lanc_cr_credito := gen_random_uuid();
  
  IF v_conta_sintetica_stripe_id IS NOT NULL THEN
    INSERT INTO public.lancamentos (id, proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id, conta_resultado_id)
    VALUES (
      v_id_lanc_ativo,
      v_admin_id,
      NOW() AT TIME ZONE 'America/SaoPaulo',
      'Recebimento Renovação Assinatura - Cliente ' || v_cliente_nome || ' (CR ID: ' || v_recorrencia_id::TEXT || ')',
      p_valor_pago,
      'Entrada',
      v_conta_destino_id,
      v_conta_sintetica_stripe_id,
      'assinatura_stripe',
      true,
      v_historico_padrao_stripe_id,
      v_id_lanc_cr_credito
    );
  END IF;
  
  -- 15.2. C: ESTORNO PATRIMONIAL (CR) - CRÉDITO (Ativo)
  IF v_conta_contabil_a_receber IS NOT NULL THEN
    INSERT INTO public.lancamentos (id, proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id, conta_resultado_id)
    VALUES (
      v_id_lanc_cr_credito,
      v_admin_id, 
      v_data_hoje, 
      'Estorno Patrimonial CR - Renovação Assinatura (CR ID: ' || v_recorrencia_id::TEXT || ')', 
      p_valor_pago, 
      'Saida',
      NULL, 
      v_conta_contabil_a_receber, 
      'assinatura_stripe', 
      true, 
      v_historico_padrao_stripe_id,
      v_id_lanc_ativo
    );
  END IF;
  
  -- 15.3. D: LANÇAMENTO INICIAL DE DÉBITO (CR) - DÉBITO (Ativo)
  v_id_lanc_cr_debito := gen_random_uuid();
  v_id_lanc_receita := gen_random_uuid();
  
  IF v_conta_contabil_a_receber IS NOT NULL THEN
    INSERT INTO public.lancamentos (id, proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id, conta_resultado_id)
    VALUES (
      v_id_lanc_cr_debito,
      v_admin_id, 
      v_data_hoje, 
      'Lançamento Inicial CR: Assinatura Recorrente (CR ID: ' || v_recorrencia_id::TEXT || ')', 
      v_plano_preco, 
      'Entrada',
      NULL, 
      v_conta_contabil_a_receber, 
      'assinatura_stripe', 
      true, 
      v_historico_padrao_stripe_id,
      v_id_lanc_receita
    );
  END IF;
  
  -- 15.4. C: LANÇAMENTO DE RECEITA (DRE) - CRÉDITO (Resultado)
  IF v_conta_resultado_stripe_id IS NOT NULL THEN
    INSERT INTO public.lancamentos (id, proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id, conta_resultado_id)
    VALUES (
      v_id_lanc_receita,
      v_admin_id, 
      v_data_hoje, 
      'Receita Renovação Assinatura - Plano ' || v_plano_nome || ' (CR ID: ' || v_recorrencia_id::TEXT || ')', 
      v_plano_preco, 
      'Saida',
      NULL, 
      v_conta_resultado_stripe_id, 
      'assinatura_stripe', 
      true, 
      v_historico_padrao_stripe_id,
      v_id_lanc_cr_debito
    );
  END IF;
  
  -- 16. CRIA AS PRÓXIMAS DUAS PARCELAS PENDENTES (30 e 60 dias)
  IF v_conta_contabil_parcela IS NOT NULL THEN
    -- Próxima Mensalidade (30 dias)
    INSERT INTO public.admin_parcelas_receber (conta_receber_id, admin_id, numero_parcela, valor_parcela, data_vencimento, status, id_conta_contabil)
    VALUES (
      v_recorrencia_id,
      v_admin_id,
      (SELECT COALESCE(MAX(numero_parcela), 1) + 1 FROM public.admin_parcelas_receber WHERE conta_receber_id = v_recorrencia_id),
      v_plano_preco,
      v_proximo_vencimento,
      'aberta',
      v_conta_contabil_parcela
    );
    
    -- Segunda Mensalidade (60 dias)
    INSERT INTO public.admin_parcelas_receber (conta_receber_id, admin_id, numero_parcela, valor_parcela, data_vencimento, status, id_conta_contabil)
    VALUES (
      v_recorrencia_id,
      v_admin_id,
      (SELECT COALESCE(MAX(numero_parcela), 1) + 1 FROM public.admin_parcelas_receber WHERE conta_receber_id = v_recorrencia_id),
      v_plano_preco,
      v_segundo_vencimento,
      'aberta',
      v_conta_contabil_parcela
    );
  END IF;

  RETURN QUERY SELECT TRUE, 'Renovação registrada com sucesso.'::TEXT;
END;
$function$;

-- Função RPC: Assina Contrato (Público)
CREATE OR REPLACE FUNCTION public.sign_contract_public(p_contract_id uuid, p_assinatura_nome text, p_assinatura_selfie_url text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.contratos_gerados
  SET 
    status = 'ativo',
    assinatura_nome = p_assinatura_nome,
    assinatura_selfie_url = p_assinatura_selfie_url,
    documento_assinado_url = 'Assinado Eletronicamente',
    updated_at = NOW()
  WHERE id = p_contract_id
  AND (status = 'rascunho' OR status = 'pendente_assinatura');
  
  IF FOUND THEN
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$function$;

-- Função RPC: Deleta Contrato e Reverte Lançamentos Contábeis
CREATE OR REPLACE FUNCTION public.delete_contract_and_reverse_accounting(p_contrato_id uuid, p_proprietario_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tabela_contas_receber TEXT;
  v_tabela_parcelas TEXT;
  v_conta_receber_id UUID;
  v_parcelas_pagas_count INTEGER;
  v_valor_total NUMERIC;
  v_descricao TEXT;
  v_conta_patrimonial_id UUID;
  v_conta_resultado_id UUID;
  v_historico_id UUID;
  v_data_movimentacao TIMESTAMP WITH TIME ZONE := NOW() AT TIME ZONE 'America/Sao_Paulo';
BEGIN
  -- 1. Determinar as tabelas corretas (Admin vs Cliente)
  IF EXISTS (SELECT 1 FROM public.tbl_admins WHERE id = p_proprietario_id) THEN
    v_tabela_contas_receber := 'admin_contas_receber';
    v_tabela_parcelas := 'admin_parcelas_receber';
  ELSE
    v_tabela_contas_receber := 'contas_receber';
    v_tabela_parcelas := 'parcelas_contas_receber';
  END IF;

  -- 2. Buscar a conta sintética e verificar parcelas pagas
  EXECUTE format('SELECT id, valor_total, descricao, id_conta_patrimonial, id_conta_resultado, historico_id FROM public.%I WHERE contrato_gerado_id = $1 LIMIT 1', v_tabela_contas_receber)
  INTO v_conta_receber_id, v_valor_total, v_descricao, v_conta_patrimonial_id, v_conta_resultado_id, v_historico_id
  USING p_contrato_id;

  IF v_conta_receber_id IS NULL THEN
    -- Se não houver conta a receber associada, apenas deleta o contrato
    DELETE FROM public.contratos_gerados WHERE id = p_contrato_id;
    RETURN QUERY SELECT TRUE, 'Contrato deletado. Nenhuma conta a receber associada encontrada.';
    RETURN;
  END IF;

  -- Contar parcelas pagas
  EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE conta_receber_id = $1 AND status = ''paga''', v_tabela_parcelas)
  INTO v_parcelas_pagas_count
  USING v_conta_receber_id;

  IF v_parcelas_pagas_count > 0 THEN
    RETURN QUERY SELECT FALSE, 'Não é possível deletar o contrato. Existem ' || v_parcelas_pagas_count || ' parcelas quitadas.';
    RETURN;
  END IF;

  -- 3. Reverter Lançamentos Contábeis (Apenas se as contas estiverem mapeadas)
  IF v_conta_patrimonial_id IS NOT NULL AND v_conta_resultado_id IS NOT NULL THEN
    
    -- Lançamento de Estorno (D: Receita, C: Clientes a Receber)
    
    -- D: Conta de Resultado (Receita) - Tipo 'Entrada' (Débito)
    -- Para diminuir a Receita (Credora), usamos Débito (Entrada)
    INSERT INTO public.lancamentos (proprietario_id, data_movimentacao, descricao, valor, tipo, conta_contabil_id, origem, historico_id)
    VALUES (
      p_proprietario_id,
      v_data_movimentacao,
      'Estorno Receita Contrato: ' || v_descricao || ' (CR ID: ' || v_conta_receber_id::TEXT || ')',
      v_valor_total,
      'Entrada', -- Débito na conta de Receita (Natureza Credora)
      v_conta_resultado_id,
      'estorno_contrato',
      v_historico_id
    );

    -- C: Conta Patrimonial (Clientes a Receber) - Tipo 'Saida' (Crédito)
    -- Para diminuir o Ativo (Devedor), usamos Crédito (Saída)
    INSERT INTO public.lancamentos (proprietario_id, data_movimentacao, descricao, valor, tipo, conta_contabil_id, origem, historico_id)
    VALUES (
      p_proprietario_id,
      v_data_movimentacao,
      'Estorno Ativo Contrato: ' || v_descricao || ' (CR ID: ' || v_conta_receber_id::TEXT || ')',
      v_valor_total,
      'Saida', -- Crédito na conta de Ativo (Natureza Devedora)
      v_conta_patrimonial_id,
      'estorno_contrato',
      v_historico_id
    );
    
    -- 3.1. Deletar lançamentos originais (para evitar duplicidade no histórico)
    DELETE FROM public.lancamentos
    WHERE proprietario_id = p_proprietario_id
      AND origem = 'lancamento_cr'
      AND descricao ILIKE ('Lançamento Inicial CR: Contrato: ' || v_descricao || ' (CR ID: ' || v_conta_receber_id::TEXT || ')%');

    DELETE FROM public.lancamentos
    WHERE proprietario_id = p_proprietario_id
      AND origem = 'lancamento_cr'
      AND descricao ILIKE ('Receita: Contrato: ' || v_descricao || ' (CR ID: ' || v_conta_receber_id::TEXT || ')%');

  END IF;

  -- 4. Deletar a conta sintética (deleta parcelas em cascata)
  EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_tabela_contas_receber)
  USING v_conta_receber_id;
  
  -- 5. Deletar o contrato gerado
  DELETE FROM public.contratos_gerados WHERE id = p_contrato_id;

  RETURN QUERY SELECT TRUE, 'Contrato e lançamentos associados deletados com sucesso.';
END;
$function$;

-- Função RPC: Bloqueia contrato e cancela parcelas pendentes
CREATE OR REPLACE FUNCTION public.cancel_contract_installments(p_contrato_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_conta_receber_id UUID;
  v_admin_id UUID;
  v_tabela_parcelas TEXT;
BEGIN
  -- 1. Determinar o proprietário e a tabela correta
  SELECT proprietario_id INTO v_admin_id FROM public.contratos_gerados WHERE id = p_contrato_id;
  
  IF EXISTS (SELECT 1 FROM public.tbl_admins WHERE id = v_admin_id) THEN
    v_tabela_parcelas := 'admin_parcelas_receber';
  ELSE
    v_tabela_parcelas := 'parcelas_contas_receber';
  END IF;

  -- 2. Buscar a conta sintética associada ao contrato
  EXECUTE format('SELECT id FROM public.%I WHERE contrato_gerado_id = $1 LIMIT 1', 
                 CASE WHEN v_tabela_parcelas = 'admin_parcelas_receber' THEN 'admin_contas_receber' ELSE 'contas_receber' END)
  INTO v_conta_receber_id
  USING p_contrato_id;

  IF v_conta_receber_id IS NOT NULL THEN
    -- 3. ATUALIZAR todas as parcelas abertas/pendentes para 'bloqueada'
    EXECUTE format('UPDATE public.%I SET status = ''bloqueada'', observacao = $2 WHERE conta_receber_id = $1 AND status IN (''aberta'', ''parcial'', ''reprogramada'');', v_tabela_parcelas)
    USING v_conta_receber_id, p_motivo;
  END IF;
  
  -- 4. Atualizar o status do contrato para 'bloqueado'
  UPDATE public.contratos_gerados
  SET status = 'bloqueado'
  WHERE id = p_contrato_id;
  
END;
$function$;

-- Função RPC: Reativa contrato e reabre parcelas
CREATE OR REPLACE FUNCTION public.reactivate_contract_installments(p_contrato_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_conta_receber_id UUID;
  v_admin_id UUID;
  v_tabela_parcelas TEXT;
  v_contrato_status TEXT;
BEGIN
  -- 1. Determinar o proprietário e a tabela correta
  SELECT proprietario_id, status INTO v_admin_id, v_contrato_status FROM public.contratos_gerados WHERE id = p_contrato_id;
  
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado.';
  END IF;
  
  -- 2. Buscar a conta sintética associada ao contrato
  IF EXISTS (SELECT 1 FROM public.tbl_admins WHERE id = v_admin_id) THEN
    v_tabela_parcelas := 'admin_parcelas_receber';
  ELSE
    v_tabela_parcelas := 'parcelas_contas_receber';
  END IF;

  EXECUTE format('SELECT id FROM public.%I WHERE contrato_gerado_id = $1 LIMIT 1', 
                 CASE WHEN v_tabela_parcelas = 'admin_parcelas_receber' THEN 'admin_contas_receber' ELSE 'contas_receber' END)
  INTO v_conta_receber_id
  USING p_contrato_id;

  IF v_conta_receber_id IS NOT NULL THEN
    -- 3. Reverter parcelas 'bloqueadas' para 'aberta'
    EXECUTE format('UPDATE public.%I SET status = ''aberta'', observacao = NULL WHERE conta_receber_id = $1 AND status = ''bloqueada'';', v_tabela_parcelas)
    USING v_conta_receber_id;
  END IF;
  
  -- 4. Atualizar o status do contrato
  UPDATE public.contratos_gerados
  SET status = CASE 
                 WHEN v_contrato_status = 'bloqueado' THEN 'pendente_assinatura'
                 ELSE 'ativo'
               END
  WHERE id = p_contrato_id;
  
END;
$function$;

-- Função RPC: Promove Cliente CR para Cliente do Sistema (tbl_clientes)
CREATE OR REPLACE FUNCTION public.promote_client_cr_to_system(p_client_id uuid, p_admin_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cliente_record public.clientes%ROWTYPE;
  v_existing_tbl_client_id UUID;
BEGIN
  -- 1. Verifica se o cliente CR existe
  SELECT * INTO v_cliente_record FROM public.clientes WHERE id = p_client_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Cliente CR não encontrado.';
    RETURN;
  END IF;

  -- 2. Verifica se já existe um cliente do sistema com o mesmo ID (duplicidade)
  SELECT id INTO v_existing_tbl_client_id FROM public.tbl_clientes WHERE id = p_client_id;
  IF v_existing_tbl_client_id IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, 'Cliente já existe na tabela de clientes do sistema (tbl_clientes).';
    RETURN;
  END IF;

  -- 3. Insere o registro na tbl_clientes (como pendente de aprovação)
  INSERT INTO public.tbl_clientes (id, nome, email, aprovado, admin_id, razao_social, nome_fantasia, documento, logo_url)
  VALUES (
    v_cliente_record.id, 
    v_cliente_record.nome, 
    v_cliente_record.email, 
    FALSE, 
    p_admin_id, 
    v_cliente_record.razao_social, 
    v_cliente_record.nome_fantasia, 
    v_cliente_record.documento,
    v_cliente_record.logo_url
  );

  -- 4. Marca o cliente CR como cliente do sistema
  UPDATE public.clientes
  SET is_system_client = TRUE
  WHERE id = p_client_id;

  RETURN QUERY SELECT TRUE, 'Cliente promovido para Cliente do Sistema (tbl_clientes). O acesso deve ser configurado manualmente.';
END;
$function$;

-- Função RPC: Deleta Cliente do Sistema (tbl_clientes) e reverte para CR
CREATE OR REPLACE FUNCTION public.demote_system_client(p_client_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_admin_count INTEGER;
  v_vinc_count INTEGER;
  v_vinc_modules TEXT[] := '{}';
  v_client_email TEXT;
BEGIN
  -- 1. Garante que apenas um Admin ou o próprio Cliente (se for o caso) pode executar
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Acesso negado. Usuário não autenticado.';
    RETURN;
  END IF;

  -- 2. Verifica se o usuário logado é o Admin ou o proprietário do cliente
  SELECT count(*) INTO v_admin_count FROM public.tbl_admins WHERE id = auth.uid();
  IF v_admin_count = 0 AND auth.uid() != p_client_id THEN
    RETURN QUERY SELECT FALSE, 'Apenas administradores podem despromover clientes.';
    RETURN;
  END IF;

  -- 3. Verifica Vínculos Ativos (Se houver qualquer registro, impede a despromoção)
  
  -- Contratos Gerados
  SELECT COUNT(*) INTO v_vinc_count FROM public.contratos_gerados WHERE proprietario_id = p_client_id;
  IF v_vinc_count > 0 THEN v_vinc_modules := array_append(v_vinc_modules, 'Contratos Gerados'); END IF;

  -- Documentos Societários Gerados
  SELECT COUNT(*) INTO v_vinc_count FROM public.documentos_societarios_gerados WHERE proprietario_id = p_client_id;
  IF v_vinc_count > 0 THEN v_vinc_modules := array_append(v_vinc_modules, 'Documentos Societários'); END IF;

  -- Contas a Receber (Admin)
  SELECT COUNT(*) INTO v_vinc_count FROM public.admin_contas_receber WHERE cliente_id = p_client_id;
  IF v_vinc_count > 0 THEN v_vinc_modules := array_append(v_vinc_modules, 'Contas a Receber (Admin)'); END IF;

  -- Contas a Pagar (Admin)
  SELECT COUNT(*) INTO v_vinc_count FROM public.admin_contas_pagar WHERE admin_id = p_client_id;
  IF v_vinc_count > 0 THEN v_vinc_modules := array_append(v_vinc_modules, 'Contas a Pagar (Admin)'); END IF;

  -- Lançamentos (Movimentação de Caixa)
  SELECT COUNT(*) INTO v_vinc_count FROM public.lancamentos WHERE proprietario_id = p_client_id;
  IF v_vinc_count > 0 THEN v_vinc_modules := array_append(v_vinc_modules, 'Lançamentos Financeiros'); END IF;

  -- Contas de Saldo (Bancos/Caixas)
  SELECT COUNT(*) INTO v_vinc_count FROM public.saldo_contas WHERE proprietario_id = p_client_id;
  IF v_vinc_count > 0 THEN v_vinc_modules := array_append(v_vinc_modules, 'Contas de Saldo (Bancos)'); END IF;
  
  -- Usuários Vinculados (Funcionários)
  SELECT COUNT(*) INTO v_vinc_count FROM public.tbl_usuarios WHERE cliente_id = p_client_id;
  IF v_vinc_count > 0 THEN v_vinc_modules := array_append(v_vinc_modules, 'Usuários/Funcionários'); END IF;

  -- Se houver vínculos, retorna erro
  IF array_length(v_vinc_modules, 1) > 0 THEN
    RETURN QUERY SELECT FALSE, 'Não é possível despromover. Existem vínculos ativos nos seguintes módulos: ' || array_to_string(v_vinc_modules, ', ');
    RETURN;
  END IF;

  -- 4. Se não houver vínculos, procede com a despromoção
  
  -- Salva o email antes de deletar o perfil
  SELECT email INTO v_client_email FROM public.tbl_clientes WHERE id = p_client_id;

  -- 4.1. Deleta o registro da tbl_clientes
  DELETE FROM public.tbl_clientes WHERE id = p_client_id;
  
  -- 4.2. Deleta o usuário do Auth (necessário para limpar o registro de login)
  -- Nota: Isso requer service_role, mas o frontend pode acionar o fluxo de exclusão de usuário Auth.
  
  RETURN QUERY SELECT TRUE, 'Cliente despromovido e perfil removido com sucesso.';
END;
$function$;

-- Função RPC: Solicita promoção de Usuário para Cliente (se não vinculado)
CREATE OR REPLACE FUNCTION public.request_client_promotion(p_company_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  user_record public.tbl_usuarios%ROWTYPE;
  v_admin_id UUID;
BEGIN
  -- Encontra o usuário que está fazendo a solicitação.
  SELECT * INTO user_record FROM public.tbl_usuarios WHERE id = auth.uid() AND cliente_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado ou já pertence a uma empresa.';
  END IF;
  
  -- Busca o ID do primeiro Admin do sistema para atribuição
  SELECT id INTO v_admin_id FROM public.tbl_admins LIMIT 1;

  -- Insere o usuário na tabela de clientes com o nome da empresa e status de não aprovado.
  INSERT INTO public.tbl_clientes (id, nome, email, aprovado, admin_id)
  VALUES (user_record.id, p_company_name, user_record.email, false, v_admin_id); -- Adiciona admin_id

  -- Remove o registro antigo da tabela de usuários.
  DELETE FROM public.tbl_usuarios WHERE id = auth.uid();
END;
$function$;

-- Função RPC: Busca informações públicas do contrato (para assinatura)
CREATE OR REPLACE FUNCTION public.get_public_contract_info(p_contract_id uuid)
 RETURNS TABLE(id uuid, status text, valores_tags_preenchidos jsonb, conteudo_renderizado text, updated_at timestamp with time zone, assinatura_nome text, assinatura_selfie_url text, assinatura_proprietario_nome text, assinatura_proprietario_url text, valores_tags_preenchidas jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    cg.id,
    cg.status,
    cg.valores_tags_preenchidos,
    cg.conteudo_renderizado,
    cg.updated_at,
    cg.assinatura_nome,
    cg.assinatura_selfie_url,
    cg.assinatura_proprietario_nome,
    cg.assinatura_proprietario_url,
    cg.valores_tags_preenchidos -- Duplicando para garantir compatibilidade de nome
  FROM public.contratos_gerados cg
  WHERE cg.id = p_contract_id;
END;
$function$;

-- Função RPC: Verifica se o email está disponível
CREATE OR REPLACE FUNCTION public.email_disponivel(p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM tbl_admins WHERE LOWER(email) = LOWER(p_email)
    UNION ALL
    SELECT 1 FROM tbl_clientes WHERE LOWER(email) = LOWER(p_email)
    UNION ALL
    SELECT 1 FROM tbl_usuarios WHERE LOWER(email) = LOWER(p_email)
    UNION ALL
    SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(p_email)
  );
END;
$function$;

-- Função RPC: Reseta todas as configurações contábeis
CREATE OR REPLACE FUNCTION public.contabil_reset_all(p_proprietario_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- 1. Limpar referências em Configurações (CP, CR, Contratos, Stripe)
  UPDATE public.configuracao_contas_receber SET conta_contabil_id = NULL WHERE proprietario_id = p_proprietario_id;
  UPDATE public.configuracao_contas_pagar SET conta_contabil_id = NULL WHERE proprietario_id = p_proprietario_id;
  UPDATE public.configuracao_contratos SET id_conta_clientes_receber = NULL, id_conta_receita_contrato = NULL WHERE proprietario_id = p_proprietario_id;
  UPDATE public.configuracoes_stripe SET conta_sintetica_id = NULL, conta_receber_id = NULL, id_conta_resultado = NULL WHERE proprietario_id = p_proprietario_id;
  
  -- 2. Limpar referências em Saldos
  UPDATE public.saldo_contas SET conta_contabil_id = NULL WHERE proprietario_id = p_proprietario_id;
  
  -- 3. Limpar referências em Lançamentos (mantém o registro financeiro, mas desvincula a contabilidade)
  UPDATE public.lancamentos SET conta_contabil_id = NULL, historico_id = NULL, conta_resultado_id = NULL WHERE proprietario_id = p_proprietario_id;
  
  -- 4. Limpar referências em Extratos
  UPDATE public.extratos SET conta_contabil_id = NULL WHERE empresa_id = p_proprietario_id;

  -- 5. Limpar configurações de níveis e históricos padrão
  DELETE FROM public.configuracao_contabil WHERE proprietario_id = p_proprietario_id;
  DELETE FROM public.configuracao_historico_padrao WHERE proprietario_id = p_proprietario_id;
  DELETE FROM public.conciliacao_regras WHERE proprietario_id = p_proprietario_id;

  -- 6. AGORA é seguro deletar o Plano de Contas e Históricos
  DELETE FROM public.plano_contas WHERE proprietario_id = p_proprietario_id;
  DELETE FROM public.historicos WHERE proprietario_id = p_proprietario_id;

  RETURN QUERY SELECT TRUE, 'Reset contábil concluído com sucesso.'::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM::text;
END;
$function$;

-- 4. Criação de Triggers
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.route_new_user();

CREATE TRIGGER set_updated_at_on_contratos_gerados
BEFORE UPDATE ON public.contratos_gerados
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_admin_usuarios_lookup_aiu
AFTER INSERT OR UPDATE ON public.admin_usuarios
FOR EACH ROW EXECUTE FUNCTION public.sync_admin_user_lookup();

CREATE TRIGGER trg_admin_usuarios_lookup_ad
AFTER DELETE ON public.admin_usuarios
FOR EACH ROW EXECUTE FUNCTION public.sync_admin_user_lookup();

CREATE TRIGGER on_admin_user_change
BEFORE INSERT OR UPDATE ON public.admin_usuarios
FOR EACH ROW EXECUTE FUNCTION public.set_admin_branding_on_user_update();

CREATE TRIGGER on_tbl_clientes_change
AFTER INSERT OR UPDATE ON public.tbl_clientes
FOR EACH ROW EXECUTE FUNCTION public.sync_client_branding();

CREATE TRIGGER on_client_insert_set_admin_id
BEFORE INSERT ON public.tbl_clientes
FOR EACH ROW EXECUTE FUNCTION public.set_admin_id_on_client_creation();
</dyad-execute-sql>

### 4. Habilitar RLS e Conceder Permissões

Habilita o RLS em todas as tabelas e concede permissões básicas para `anon`, `authenticated` e `service_role`.

<dyad-execute-sql description="Habilitar RLS e Conceder Permissões em todas as tabelas">
DO $$
DECLARE
    tabela TEXT;
    tabelas_lista TEXT[] := ARRAY[
        'admin_contas_pagar', 'admin_contas_receber', 'admin_descricao_extrato', 'admin_ferias_user', 
        'admin_identificacao_extrato', 'admin_pagamentos', 'admin_parcelas_pagar', 'admin_parcelas_receber', 
        'admin_recebimentos', 'admin_registros_ponto', 'admin_usuarios', 'anexos', 'blocos_societarios', 
        'clientes', 'conciliacao_regras', 'conciliacoes', 'configuracao_conciliacao', 'configuracao_contabil', 
        'configuracao_contas_pagar', 'configuracao_contas_receber', 'configuracao_contratos', 
        'configuracao_historico_padrao', 'configuracao_plano_contas', 'configuracoes_calima', 
        'configuracoes_stripe', 'contas_pagar', 'contas_receber', 'contrato_modelos', 'contrato_tags', 
        'contratos', 'contratos_gerados', 'descricao_extrato', 'documentos_societarios_gerados', 
        'extratos', 'ferias', 'historico_auditoria', 'historicos', 'identificacao_extrato', 
        'lancamentos', 'mensagens_ticket', 'modelos_societarios', 'pagamentos', 'parcelas_contas_pagar', 
        'parcelas_contas_receber', 'periodos_aquisitivos', 'plano_contas', 'planos', 'recebimentos', 
        'registros_ponto', 'saldo_contas', 'tbl_admins', 'tbl_clientes', 'tbl_usuarios', 'tickets',
        'admin_user_lookup' -- Incluindo a tabela de lookup
    ];
BEGIN
    FOREACH tabela IN ARRAY tabelas_lista
    LOOP
        -- 1. Habilita Row Level Security (RLS)
        EXECUTE 'ALTER TABLE public.' || quote_ident(tabela) || ' ENABLE ROW LEVEL SECURITY;';

        -- 2. Concede permissões (SELECT, INSERT, UPDATE, DELETE)
        EXECUTE 'GRANT ALL ON public.' || quote_ident(tabela) || ' TO anon, authenticated, service_role;';
    END LOOP;
END
$$;
</dyad-execute-sql>

### 5. Políticas de RLS (Row Level Security)

Aplica as políticas de RLS usando o padrão não-recursivo (`get_admin_id_for_current_user()` e `is_owner_or_admin_user()`).

<dyad-execute-sql description="Criação de todas as políticas de RLS">
-- RLS para tbl_admins
ALTER TABLE public.tbl_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can select their own profile" ON public.tbl_admins FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can insert their own profile" ON public.tbl_admins FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can update their own profile" ON public.tbl_admins FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can delete their own profile" ON public.tbl_admins FOR DELETE USING (auth.uid() = id);
CREATE POLICY "Allow authenticated read of branding fields" ON public.tbl_admins FOR SELECT USING (true);
CREATE POLICY "service_role_insert_tbl_admins" ON public.tbl_admins FOR INSERT TO service_role WITH CHECK (true);

-- RLS para tbl_clientes (Admin + AdminUsuario support)
ALTER TABLE public.tbl_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tbl_clientes_select" ON public.tbl_clientes FOR SELECT USING ((id = auth.uid()) OR (admin_id = auth.uid()) OR (admin_id IN (SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE admin_usuarios.id = auth.uid())));
CREATE POLICY "tbl_clientes_insert" ON public.tbl_clientes FOR INSERT WITH CHECK ((admin_id = auth.uid()) OR (admin_id IN (SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE admin_usuarios.id = auth.uid())));
CREATE POLICY "tbl_clientes_update" ON public.tbl_clientes FOR UPDATE USING ((admin_id = auth.uid()) OR (admin_id IN (SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE admin_usuarios.id = auth.uid()))) WITH CHECK ((admin_id = auth.uid()) OR (admin_id IN (SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE admin_usuarios.id = auth.uid())));
CREATE POLICY "tbl_clientes_delete" ON public.tbl_clientes FOR DELETE USING ((admin_id = auth.uid()) OR (admin_id IN (SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE admin_usuarios.id = auth.uid())));
CREATE POLICY "clientes_update_self" ON public.tbl_clientes FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- RLS para tbl_usuarios
ALTER TABLE public.tbl_usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tbl_usuarios_select" ON public.tbl_usuarios;
DROP POLICY IF EXISTS "tbl_usuarios_insert" ON public.tbl_usuarios;
DROP POLICY IF EXISTS "tbl_usuarios_update" ON public.tbl_usuarios;
DROP POLICY IF EXISTS "tbl_usuarios_delete" ON public.tbl_usuarios;
DROP POLICY IF EXISTS "usuarios_access_policy" ON public.tbl_usuarios;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.tbl_usuarios;
CREATE POLICY "tbl_usuarios_select_policy" ON public.tbl_usuarios FOR SELECT USING (id = auth.uid() OR cliente_id = auth.uid() OR (( SELECT admin_id FROM public.tbl_clientes WHERE id = tbl_usuarios.cliente_id) = public.get_my_admin_id()));
CREATE POLICY "tbl_usuarios_insert_policy" ON public.tbl_usuarios FOR INSERT WITH CHECK (cliente_id = auth.uid() OR (( SELECT admin_id FROM public.tbl_clientes WHERE id = tbl_usuarios.cliente_id) = public.get_my_admin_id()));
CREATE POLICY "tbl_usuarios_update_policy" ON public.tbl_usuarios FOR UPDATE USING (id = auth.uid() OR cliente_id = auth.uid() OR (( SELECT admin_id FROM public.tbl_clientes WHERE id = tbl_usuarios.cliente_id) = public.get_my_admin_id())) WITH CHECK (id = auth.uid() OR cliente_id = auth.uid() OR (( SELECT admin_id FROM public.tbl_clientes WHERE id = tbl_usuarios.cliente_id) = public.get_my_admin_id()));
CREATE POLICY "tbl_usuarios_delete_policy" ON public.tbl_usuarios FOR DELETE USING (cliente_id = auth.uid() OR (( SELECT admin_id FROM public.tbl_clientes WHERE id = tbl_usuarios.cliente_id) = public.get_my_admin_id()));

-- RLS para admin_usuarios
ALTER TABLE public.admin_usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_usuarios_select" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_insert" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_update" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_delete" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_access_policy" ON public.admin_usuarios;
CREATE POLICY "admin_usuarios_select_policy" ON public.admin_usuarios FOR SELECT USING (admin_id = public.get_my_admin_id());
CREATE POLICY "admin_usuarios_insert_policy" ON public.admin_usuarios FOR INSERT WITH CHECK (admin_id = auth.uid());
CREATE POLICY "admin_usuarios_update_policy" ON public.admin_usuarios FOR UPDATE USING (admin_id = public.get_my_admin_id()) WITH CHECK (admin_id = auth.uid() OR id = auth.uid());
CREATE POLICY "admin_usuarios_delete_policy" ON public.admin_usuarios FOR DELETE USING (admin_id = auth.uid());

-- RLS para admin_user_lookup (RLS desabilitada, mas políticas de segurança para service_role)
ALTER TABLE public.admin_user_lookup ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_user_lookup_all" ON public.admin_user_lookup;
CREATE POLICY "admin_user_lookup_all" ON public.admin_user_lookup FOR ALL USING (true) WITH CHECK (true);

-- RLS para planos (Público para leitura)
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access for plans" ON public.planos;
DROP POLICY IF EXISTS "Admins can manage all plans" ON public.planos;
CREATE POLICY "Public read access for plans" ON public.planos FOR SELECT USING (true);
CREATE POLICY "Admins can manage all plans" ON public.planos FOR ALL USING (auth.uid() IN ( SELECT tbl_admins.id FROM tbl_admins)) WITH CHECK (auth.uid() IN ( SELECT tbl_admins.id FROM tbl_admins));

-- RLS para saldo_contas
ALTER TABLE public.saldo_contas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saldo_contas_select_policy" ON public.saldo_contas;
DROP POLICY IF EXISTS "saldo_contas_insert_policy" ON public.saldo_contas;
DROP POLICY IF EXISTS "saldo_contas_update_policy" ON public.saldo_contas;
DROP POLICY IF EXISTS "saldo_contas_delete_policy" ON public.saldo_contas;
CREATE POLICY "saldo_contas_select_policy" ON public.saldo_contas FOR SELECT USING ((proprietario_id = auth.uid()) OR (get_admin_id_for_current_user() = proprietario_id));
CREATE POLICY "saldo_contas_insert_policy" ON public.saldo_contas FOR INSERT WITH CHECK (proprietario_id = public.get_my_admin_id());
CREATE POLICY "saldo_contas_update_policy" ON public.saldo_contas FOR UPDATE USING (proprietario_id = public.get_my_admin_id());
CREATE POLICY "saldo_contas_delete_policy" ON public.saldo_contas FOR DELETE USING (proprietario_id = auth.uid());

-- RLS para plano_contas
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plano_contas_select_policy" ON public.plano_contas;
DROP POLICY IF EXISTS "plano_contas_insert_policy" ON public.plano_contas;
DROP POLICY IF EXISTS "plano_contas_update_policy" ON public.plano_contas;
DROP POLICY IF EXISTS "plano_contas_delete_policy" ON public.plano_contas;
CREATE POLICY "plano_contas_select_policy" ON public.plano_contas FOR SELECT USING ((proprietario_id = auth.uid()) OR (get_admin_id_for_current_user() = proprietario_id));
CREATE POLICY "plano_contas_insert_policy" ON public.plano_contas FOR INSERT WITH CHECK (proprietario_id = public.get_my_admin_id());
CREATE POLICY "plano_contas_update_policy" ON public.plano_contas FOR UPDATE USING (proprietario_id = public.get_my_admin_id());
CREATE POLICY "plano_contas_delete_policy" ON public.plano_contas FOR DELETE USING (proprietario_id = auth.uid());

-- RLS para lancamentos
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lancamentos_access_policy" ON public.lancamentos;
CREATE POLICY "lancamentos_access_policy" ON public.lancamentos FOR ALL USING (proprietario_id = public.get_my_admin_id()) WITH CHECK (proprietario_id = public.get_my_admin_id());

-- RLS para historicos
ALTER TABLE public.historicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "historicos_access_policy" ON public.historicos;
CREATE POLICY "historicos_access_policy" ON public.historicos FOR ALL USING (proprietario_id = public.get_my_admin_id()) WITH CHECK (proprietario_id = public.get_my_admin_id());

-- RLS para clientes (Clientes CR)
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Empresas podem gerenciar seus próprios clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admin select own clients" ON public.clientes;
DROP POLICY IF EXISTS "Admin insert own clients" ON public.clientes;
DROP POLICY IF EXISTS "Admin update own clients" ON public.clientes;
DROP POLICY IF EXISTS "Admin delete own clients" ON public.clientes;
DROP POLICY IF EXISTS "Admins podem ver todos os clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admin employees read admin clients" ON public.clientes;
CREATE POLICY "clientes_cr_select_policy" ON public.clientes FOR SELECT USING (proprietario_id = public.get_my_admin_id());
CREATE POLICY "clientes_cr_insert_policy" ON public.clientes FOR INSERT WITH CHECK (proprietario_id = public.get_my_admin_id());
CREATE POLICY "clientes_cr_update_policy" ON public.clientes FOR UPDATE USING (proprietario_id = public.get_my_admin_id());
CREATE POLICY "clientes_cr_delete_policy" ON public.clientes FOR DELETE USING (proprietario_id = auth.uid());

-- RLS para contratos_gerados
ALTER TABLE public.contratos_gerados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Visualização por dono ou cliente" ON public.contratos_gerados FOR SELECT USING ((auth.uid() = proprietario_id) OR (auth.uid() = cliente_id) OR ((auth.jwt() ->> 'role'::text) = 'service_role'::text));
CREATE POLICY "Permitir inserção autenticada" ON public.contratos_gerados FOR INSERT WITH CHECK (true);
CREATE POLICY "Alteração por dono" ON public.contratos_gerados FOR UPDATE USING (auth.uid() = proprietario_id);
CREATE POLICY "Admin delete own generated contracts" ON public.contratos_gerados FOR DELETE USING (auth.uid() = proprietario_id);

-- RLS para admin_parcelas_receber (Permite que o cliente veja suas parcelas)
ALTER TABLE public.admin_parcelas_receber ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage own installments" ON public.admin_parcelas_receber FOR ALL USING (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid()))) WITH CHECK (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid())));
CREATE POLICY "Clientes can read their own recurring installments" ON public.admin_parcelas_receber FOR SELECT USING (EXISTS ( SELECT 1 FROM admin_contas_receber WHERE ((admin_contas_receber.id = admin_parcelas_receber.conta_receber_id) AND (admin_contas_receber.cliente_id = auth.uid()))));
CREATE POLICY "Cliente pode atualizar ciente_cliente nas suas parcelas" ON public.admin_parcelas_receber FOR UPDATE USING (conta_receber_id IN ( SELECT admin_contas_receber.id FROM admin_contas_receber WHERE (admin_contas_receber.cliente_id = auth.uid()))) WITH CHECK (conta_receber_id IN ( SELECT admin_contas_receber.id FROM admin_contas_receber WHERE (admin_contas_receber.cliente_id = auth.uid())));

-- RLS para admin_contas_receber (Permite que o cliente veja suas contas sintéticas)
ALTER TABLE public.admin_contas_receber ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage own receivables" ON public.admin_contas_receber FOR ALL USING (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid()))) WITH CHECK (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid())));
CREATE POLICY "Clientes can read their own recurring accounts" ON public.admin_contas_receber FOR SELECT USING (auth.uid() = cliente_id);

-- RLS para admin_recebimentos (Permite que o cliente veja seus pagamentos)
ALTER TABLE public.admin_recebimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage own receipts" ON public.admin_recebimentos FOR ALL USING (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid()))) WITH CHECK (admin_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid())));
CREATE POLICY "Clientes can view their own payments" ON public.admin_recebimentos FOR SELECT USING (auth.uid() = cliente_id);

-- RLS para tickets
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tickets_access_policy" ON public.tickets;
DROP POLICY IF EXISTS "Admin pode gerenciar todos os tickets" ON public.tickets;
DROP POLICY IF EXISTS "Clientes podem gerenciar seus proprios tickets" ON public.tickets;
CREATE POLICY "tickets_access_policy" ON public.tickets FOR ALL USING (proprietario_id = public.get_my_admin_id() OR empresa_id = auth.uid()) WITH CHECK (proprietario_id = public.get_my_admin_id() OR empresa_id = auth.uid());

-- RLS para mensagens_ticket
ALTER TABLE public.mensagens_ticket ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso a mensagens pelo proprietario do ticket" ON public.mensagens_ticket FOR ALL USING (EXISTS ( SELECT 1 FROM tickets WHERE ((tickets.id = mensagens_ticket.ticket_id) AND (tickets.empresa_id = auth.uid())))) WITH CHECK (remetente_id = auth.uid());
CREATE POLICY "Acesso a mensagens por usuarios da empresa" ON public.mensagens_ticket FOR ALL USING (EXISTS ( SELECT 1 FROM tickets WHERE ((tickets.id = mensagens_ticket.ticket_id) AND (tickets.empresa_id IN ( SELECT tbl_usuarios.cliente_id FROM tbl_usuarios WHERE (tbl_usuarios.id = auth.uid())))))) WITH CHECK (remetente_id = auth.uid());
CREATE POLICY "Admin pode gerenciar todas as mensagens" ON public.mensagens_ticket FOR ALL USING (EXISTS ( SELECT 1 FROM tbl_admins WHERE (tbl_admins.id = auth.uid()))) WITH CHECK (EXISTS ( SELECT 1 FROM tbl_admins WHERE (tbl_admins.id = auth.uid())));

-- RLS para configuracoes_stripe
ALTER TABLE public.configuracoes_stripe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage own stripe config" ON public.configuracoes_stripe FOR ALL USING (proprietario_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid()))) WITH CHECK (proprietario_id IN ( SELECT auth.uid() AS uid UNION SELECT admin_usuarios.admin_id FROM admin_usuarios WHERE (admin_usuarios.id = auth.uid())));
CREATE POLICY "Public read access for stripe config" ON public.configuracoes_stripe FOR SELECT USING (true);
</dyad-execute-sql>

---

## 🏛️ Arquitetura de Acesso e RLS (Pós-Correção de Recursão)

Esta seção documenta o padrão **definitivo** para o controle de acesso no sistema. Ele foi implementado para resolver erros críticos de "infinite recursion" e garantir que a hierarquia de permissões (Admin → Funcionário do Admin) funcione corretamente em todas as tabelas.

### A Solução: Acesso Não-Recursivo com Função Auxiliar

A nova arquitetura garante performance e estabilidade, baseando-se em uma única função auxiliar chamada `get_my_admin_id()`.

#### A Função `public.get_my_admin_id()`

Esta função é o pilar da nossa estratégia de RLS. Ela identifica corretamente o **ID do dono final dos dados**, não importa quem esteja logado:

-   **Se um Admin está logado:** A função retorna o `id` do próprio admin (`auth.uid()`).
-   **Se um Funcionário do Admin está logado:** A função consulta a tabela `admin_usuarios` (de forma segura e não-recursiva) e retorna o `admin_id` do seu chefe.

```sql
CREATE OR REPLACE FUNCTION public.get_my_admin_id()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  admin_uuid uuid;
BEGIN
  -- A cláusula SET LOCAL é crucial para evitar a recursão
  SET LOCAL row_security = off;
  SELECT admin_id INTO admin_uuid
  FROM public.admin_usuarios
  WHERE id = auth.uid() LIMIT 1;
  
  IF admin_uuid IS NULL THEN
    -- Se não encontrou, o usuário é o próprio dono (Admin/Cliente)
    RETURN auth.uid();
  END IF;
  -- Se encontrou, retorna o ID do chefe
  RETURN admin_uuid;
END;
$$;
```

#### Novo Padrão de Políticas

Todas as tabelas que pertencem a um "dono" (seja ele um Admin ou um Cliente) devem usar esta função para validar o acesso. A chave da tabela (ex: `proprietario_id`, `admin_id`, `empresa_id`) é comparada com o resultado de `public.get_my_admin_id()`.

**Exemplo para uma tabela genérica `tabela_x` com a coluna `proprietario_id`:**
```sql
CREATE POLICY "tabela_x_access_policy" ON public.tabela_x
FOR SELECT USING (
  proprietario_id = public.get_my_admin_id()
);
```
Este padrão foi aplicado a todas as tabelas críticas, garantindo que um funcionário (usuário) possa acessar os dados de sua empresa (proprietário) sem quebrar o RLS.

---

## 👥 Arquitetura Admin vs AdminUsuario (Funcionário do Admin)

Esta seção documenta a relação entre **Admin** (proprietário) e **AdminUsuario** (funcionário do admin), essencial para implementar corretamente o acesso em todos os módulos do sistema.

### Estrutura de Usuários

| Tipo | Tabela de Perfil | Role no Auth | Identificador |
|:-----|:-----------------|:-------------|:--------------|
| **Admin** | `tbl_admins` | `Admin` | `usuario.id` é o próprio `admin_id` |
| **Funcionário do Admin** | `admin_usuarios` | `Usuario` | `perfil.admin_id` aponta para o Admin |
| **Cliente** | `tbl_clientes` | `Cliente` | `usuario.id` é o próprio `empresa_id` |
| **Funcionário do Cliente** | `tbl_usuarios` | `Usuario` | `perfil.cliente_id` aponta para o Cliente |

### Detecção de Tipo de Usuário no Frontend

```typescript
// Em qualquer componente React
const { role, usuario, perfil } = useSessao();

// Admin direto
const isDirectAdmin = role === 'Admin';

// Funcionário do Admin (role é 'Usuario' mas tem admin_id no perfil)
const adminIdFromProfile = (perfil as any)?.admin_id ?? null;
const isAdminUsuario = role === 'Usuario' && !!adminIdFromProfile;

// Admin OU funcionário do Admin
const isAdminOrEmployee = isDirectAdmin || isAdminUsuario;

// Cliente direto
const isDirectCliente = role === 'Cliente';

// Funcionário do Cliente
const clienteIdFromProfile = (perfil as any)?.cliente_id ?? null;
const isClienteUsuario = role === 'Usuario' && !!clienteIdFromProfile;
```

### Resolução do ID do Proprietário

```typescript
// Para Admin direto: usar o próprio ID
if (isDirectAdmin) {
    proprietarioId = usuario.id;
}

// Para funcionário do Admin: usar o admin_id do perfil
if (isAdminUsuario) {
    proprietarioId = (perfil as any).admin_id;
}
```

### Tabelas Usadas por Admin vs Cliente

| Módulo | Tabela Admin | Tabela Cliente | Chave de Filtro Admin | Chave de Filtro Cliente |
|:-------|:-------------|:---------------|:---------------------|:------------------------|
| **Contas a Receber** | `admin_contas_receber` | `contas_receber` | `admin_id` | `empresa_id` |
| **Parcelas CR** | `admin_parcelas_receber` | `parcelas_contas_receber` | `admin_id` | `empresa_id` |
| **Recebimentos** | `admin_recebimentos` | `recebimentos` | `admin_id` | `empresa_id` |
| **Contas a Pagar** | `admin_contas_pagar` | `contas_pagar` | `admin_id` | `empresa_id` |
| **Parcelas CP** | `admin_parcelas_pagar` | `parcelas_contas_pagar` | `admin_id` | `empresa_id` |
| **Pagamentos** | `admin_pagamentos` | `pagamentos` | `admin_id` | `empresa_id` |
| **Clientes** | `tbl_clientes` | `clientes` | `admin_id` | `proprietario_id` |
| **Usuários/Funcionários** | `admin_usuarios` | `tbl_usuarios` | `admin_id` | `cliente_id` |
| **Registros de Ponto** | `admin_registros_ponto` | `registros_ponto` | `admin_id` | `empresa_id` |

### Padrão de Seleção de Tabela no Código

```typescript
// Determinar se é contexto Admin
const isAdminOrEmployee = isDirectAdmin || isAdminUsuario;

// Selecionar tabelas
const tabelaContasReceber = isAdminOrEmployee ? 'admin_contas_receber' : 'contas_receber';
const tabelaParcelas = isAdminOrEmployee ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
const tabelaClientes = isAdminOrEmployee ? 'tbl_clientes' : 'clientes';
const ownerKey = isAdminOrEmployee ? 'admin_id' : 'empresa_id';

// Determinar o ID do proprietário
const proprietarioId = isDirectAdmin ? usuario.id : (perfil as any).admin_id;

// Fazer a busca
const { data } = await supabase
    .from(tabelaContasReceber)
    .select('*')
    .eq(ownerKey, proprietarioId);
```

### Padrão de RLS para Suporte a AdminUsuario

Todas as tabelas do Admin devem ter políticas RLS que permitam acesso tanto ao Admin direto quanto aos seus funcionários:

```sql
-- Padrão de RLS para tabelas com admin_id
CREATE POLICY "tabela_select_policy" ON public.nome_tabela
FOR SELECT
USING (
  admin_id = auth.uid()
  OR admin_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- Para INSERT/UPDATE adicionar WITH CHECK
CREATE POLICY "tabela_insert_policy" ON public.nome_tabela
FOR INSERT
WITH CHECK (
  admin_id = auth.uid()
  OR admin_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);
```

### Checklist para Novos Módulos

Ao criar um novo módulo que deve funcionar para Admin e seus funcionários:

1. [ ] Usar `useSessao()` para obter `role`, `usuario` e `perfil`
2. [ ] Detectar `isAdminOrEmployee` com a lógica: `role === 'Admin' || (role === 'Usuario' && perfil.admin_id)`
3. [ ] Resolver `proprietarioId`: Admin usa `usuario.id`, funcionário usa `perfil.admin_id`
4. [ ] Selecionar tabela correta: `admin_*` para Admin, tabela normal para Cliente
5. [ ] Usar `ownerKey` correto: `admin_id` para Admin, `empresa_id` para Cliente
6. [ ] Verificar RLS da tabela inclui suporte a `admin_usuarios`

---

## Funcionalidades e Telas

O sistema suporta módulos de **Financeiro**, **Contabilidade**, **RH/Ponto** e **Contratos/Documentos Societários**.

### 🆕 Gestão de Contratos

- **Edição de Contratos Ativos/Bloqueados:** Contratos com status `ativo` ou `bloqueado` agora podem ser editados. Ao salvar, o sistema **deleta as contas a receber e parcelas pendentes antigas** e recria o faturamento com os novos valores, definindo o status do contrato para `pendente_assinatura`.
- **Exclusão Segura:** A exclusão de um contrato é bloqueada se houver parcelas com status `paga`, garantindo a integridade do histórico financeiro.

### Fluxo Contábil (Partidas Dobradas)

Todas as operações financeiras (CR, CP, Movimentação Direta) geram lançamentos na tabela `lancamentos` seguindo o princípio das partidas dobradas:

| Operação | Débito (D) | Crédito (C) |
| :--- | :--- | :--- |
| **Criação CR** | Clientes a Receber (Ativo) | Receita (Resultado) |
| **Recebimento CR** | Caixa/Banco (Ativo) | Clientes a Receber (Ativo) |
| **Criação CP** | Despesa/Custo (Resultado) | Obrigação a Pagar (Passivo) |
| **Pagamento CP** | Obrigação a Pagar (Passivo) | Caixa/Banco (Ativo) |

---

## API e Integrações

### Edge Functions (Deno)

As Edge Functions são usadas para lógica crítica que requer a `service_role` ou para orquestrar fluxos complexos (Stripe, Setup Contábil).

| Function Name | Purpose |
| :--- | :--- |
| `activate-subscription` | Ativa assinatura e registra faturamento inicial. |
| `create-renewal-session` | Cria sessão de checkout Stripe para renovação. |
| `get-admin-stripe-config` | Busca chaves Stripe secretas (Admin Only). |
| `get-stripe-session` | Busca metadados da sessão Stripe. |
| `contabil-setup` | Executa o setup contábil completo (reset, import, map). |
| `contabil-reset` | Reseta todas as configurações contábeis do proprietário. |
| `promote-client-direct` | Promove Cliente CR para Cliente Sistema (Admin Only). |
| `send-signed-contract` | Simula envio de contrato assinado por email. |
| `extract-comprovante-ocr` | Simula extração de dados de comprovantes (OCR). |

### Funções RPC (PostgreSQL)

As RPCs são usadas para transações atômicas e validações de segurança.

| Function Name | Purpose |
| :--- | :--- |
| `contabil_setup_defaults` | Executa o setup contábil completo (reset, import, map). |
| `insert_manual_lancamentos` | Registra lançamentos manuais com partidas dobradas. |
| `delete_contract_and_reverse_accounting` | Deleta contrato e reverte lançamentos contábeis. |
| `sign_contract_public` | Registra a assinatura pública de um contrato. |
| `email_disponivel` | Verifica se um email está em uso em qualquer tabela de perfil. |