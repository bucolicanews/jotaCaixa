# Jota App - Sistema de Gestão Financeira e RH Multi-Tenant

![Version](https://img.shields.io/badge/version-2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-production-brightgreen)

Um sistema robusto de gestão financeira, RH e contratos construído com React, TypeScript, Supabase e Stripe. Oferece soluções completas para administração de empresas, gestão de clientes, contas a receber/pagar, ponto eletrônico, folha de ponto e contratos dinâmicos.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Recursos Principais](#recursos-principais)
- [Requisitos do Sistema](#requisitos-do-sistema)
- [Instalação e Configuração](#instalação-e-configuração)
- [Configuração do Supabase](#configuração-do-supabase)
- [Funcionalidades e Telas](#funcionalidades-e-telas)
- [Arquitetura e Fluxos](#arquitetura-e-fluxos)
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

## Recursos Principais

### 1. 💳 Faturamento e Assinatura (Stripe)
- Planos mensais/anuais configuráveis
- Fluxo de checkout integrado com Stripe
- Renovação automática e manual de assinaturas
- Histórico completo de pagamentos

### 2. 💰 Gestão Financeira Completa
- **Contas a Receber (CR):** Criação, rastreamento e recebimento
- **Contas a Pagar (CP):** Controle de obrigações e pagamentos
- **Bancos e Caixas:** Gestão de múltiplas contas bancárias
- **Fluxo de Caixa:** Visualização em tempo real
- **Lançamentos Contábeis:** Partidas dobradas automáticas
- **Relatórios Financeiros:** DRE, Balanço Patrimonial, Razão

### 3. 👥 Módulo de RH
- **Ponto Eletrônico:** Registro com geolocalização e selfie
- **Folha de Ponto:** Cálculo automático de horas, extras e saldo
- **Gestão de Faltas e Abonos:** Controle de ausências
- **Férias CLT:** Cálculo automático de direitos e descontos

### 4. 📋 Gestão de Contratos
- Criação de templates dinâmicos
- Tags customizáveis e preenchimento automático
- Geração automática de contas a receber
- Assinatura digital e rastreamento

### 5. 📄 Documentos Societários
- Criação de atas, contratos sociais, etc.
- Blocos de conteúdo reutilizáveis
- Modelos com tags dinâmicas

### 6. 🔄 Contas Futuras
- Visualização de parcelas pendentes do Admin
- Lançamento automático em contas a pagar do cliente
- Rastreamento via `ciente_cliente` field

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
VITE_APP_URL=http://localhost:5173

# Google Maps (opcional)
VITE_GOOGLE_MAPS_API_KEY=sua_chave
```

### 4. Iniciar o Servidor de Desenvolvimento

```bash
pnpm dev
# A aplicação estará disponível em http://localhost:5173
```

### 5. Build para Produção

```bash
pnpm build
# Os arquivos compilados estarão em ./dist
```

---

## Configuração do Supabase

### 1. Criar Projeto Supabase

1. Acesse [supabase.com](https://supabase.com)
2. Crie um novo projeto
3. Copie a **Project URL** e **Anon Key**

## Desenvolvimento, Build e Deploy

### Pré-requisitos
- Node.js >= 20 LTS  
- pnpm >= 9 (ou npm/yarn compatível)  
- Supabase CLI ou acesso direto ao editor SQL do painel  
- Conta Supabase/Stripe configurada para as integrações

### Instalação e execução local
1. `git clone https://github.com/seu-usuario/jota-app-basico.git && cd jota-app-basico`
2. `pnpm install`
3. Copie o `.env.example` para `.env.local` e ajuste:
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (projeto Supabase)
   - `VITE_STRIPE_PUBLIC_KEY`, `VITE_APP_URL`, `VITE_GOOGLE_MAPS_API_KEY`
   - `VITE_APP_URL` deve apontar para `http://localhost:8080` em dev
4. Inicie `pnpm dev` e abra `http://localhost:8080`

### Build e preview
- `pnpm build` gera artefatos em `dist/`
- `pnpm preview` roda um servidor estático local para validar a build
- `pnpm lint` roda o ESLint configurado (opcional, mas recomendado antes do deploy)

### Deploy (Vercel, Netlify, Supabase Hosting, etc.)
1. Configure as variáveis de ambiente da mesma forma que no `.env.local`
2. Garanta que as Functions (RPCs) do Supabase estejam implantadas e executadas
3. Execute `pnpm build` no pipeline e publique `dist/`
4. Para o Supabase, aplique `fix-rls-policies.sql` após qualquer restauração de banco:
   - Use o editor SQL (`supabase db query` ou painel) para recriar `saldo_contas`, `plano_contas` e `lancamentos` com o `EXISTS` para `admin_usuarios`
5. Teste rodando `SELECT * FROM admin_usuarios WHERE id = '<admin_usuario_id>'` e confirme `admin_id`
6. Faça logout/login no app após rodar o script para que o JWT receba as novas policies

### Supabase + Stripe
- Supabase Auth com RLS garante que cada tenant só veja seus dados.  
- `fix-rls-policies.sql` está em raiz e sincroniza as políticas (execute após restore).  
- Integrações com Stripe usam as edge functions `create-checkout-session`, `create-renewal-session` e `get-stripe-session` para acesso seguro.

## Visão geral do sistema
- **Admin:** Gerencia clientes, contratos, finanças e suporte via tabelas `admin_*`.  
- **Clientes (tbl_clientes):** Possuem seus próprios cadastros, lançamentos, contratos e relatórios.  
- **Funcionários (`tbl_usuarios` ou `admin_usuarios`):** Herdam permissões configuradas no plano/perfil e acessam apenas o `ownerId` vinculado (cliente ou admin).  
- **Fluxos-chave:** lançamentos contábeis, contratos com tags dinâmicas, conciliações automáticas, folha de ponto, relatórios (balanço, DRE, razão, balancete).  
- **Hooks reutilizáveis:** `useOwner`, `useConciliacao`, `useContasReceber`, `useBalancete`, `useRazao` e demais encapsulam lógica de tenant, RLS e fetchs Supabase.

## RLS e controle de acesso
- A tabela `admin_usuarios` conecta cada colaborador ao `admin_id` do dono.  
- As policies `saldo_contas_select_policy`, `plano_contas_select_policy` e `lancamentos_select_policy` aceitam agora `auth.uid() = proprietario_id` **ou** o administrador delegado (`EXISTS` com `admin_usuarios`).  
- Sempre que restaurar o banco ou promover um cliente, execute `fix-rls-policies.sql` para garantir consistência.  
- Verifique RLS com:
  ```sql
  SELECT * FROM pg_policies WHERE tablename IN ('saldo_contas','plano_contas','lancamentos');
  SELECT id, admin_id FROM admin_usuarios WHERE id = '<admin_usuario_id>';
  ```
- O dropdown `Conta de Débito/Crédito` e as tabelas de lançamentos usam `useOwner()` para resolver `ownerId` do cliente ou admin (funcionários).  
- No Supabase storage/edge functions, confirme que os headers `Authorization: Bearer <supabase_jwt>` estão presentes.
*** End Patch***-BEGIN-END applyPATCH PyTHON"""

### 2. Executar Script de Banco de Dados

Execute o SQL abaixo no editor SQL do Supabase:

#### A. Criar Tabelas Principais

```sql
-- ==========================================
-- 1. TABELAS DE AUTENTICAÇÃO E PERFIS
-- ==========================================

CREATE TABLE tbl_admins (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  stripe_account_id TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE tbl_clientes (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  cnpj TEXT UNIQUE,
  cpf TEXT UNIQUE,
  admin_id UUID REFERENCES tbl_admins(id),
  plano_id TEXT,
  data_fim_acesso TIMESTAMP,
  permissoes JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE tbl_usuarios (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  cliente_id UUID REFERENCES tbl_clientes(id),
  admin_id UUID REFERENCES tbl_admins(id),
  cargo TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- ==========================================
-- 2. TABELAS FINANCEIRAS (ADMIN)
-- ==========================================

CREATE TABLE admin_contas_receber (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES tbl_admins(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES tbl_clientes(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor_total DECIMAL(12, 2),
  data_vencimento DATE,
  status TEXT DEFAULT 'aberta',
  origem TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE admin_parcelas_receber (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_receber_id UUID NOT NULL REFERENCES admin_contas_receber(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES tbl_admins(id) ON DELETE CASCADE,
  numero_parcela INTEGER,
  valor_parcela DECIMAL(12, 2),
  data_vencimento DATE,
  status TEXT DEFAULT 'aberta',
  ciente_cliente BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE admin_contas_pagar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES tbl_admins(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor_total DECIMAL(12, 2),
  data_vencimento DATE,
  status TEXT DEFAULT 'aberto',
  origem TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE admin_parcelas_pagar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_pagar_id UUID NOT NULL REFERENCES admin_contas_pagar(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES tbl_admins(id) ON DELETE CASCADE,
  numero_parcela INTEGER,
  valor_parcela DECIMAL(12, 2),
  data_vencimento DATE,
  status TEXT DEFAULT 'aberta',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- ==========================================
-- 3. TABELAS FINANCEIRAS (CLIENTE)
-- ==========================================

CREATE TABLE contas_receber (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES tbl_clientes(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES tbl_clientes(id),
  descricao TEXT NOT NULL,
  valor_total DECIMAL(12, 2),
  data_vencimento DATE,
  status TEXT DEFAULT 'aberta',
  origem TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE parcelas_contas_receber (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_receber_id UUID NOT NULL REFERENCES contas_receber(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES tbl_clientes(id),
  numero_parcela INTEGER,
  valor_parcela DECIMAL(12, 2),
  data_vencimento DATE,
  data_pagamento DATE,
  valor_pago DECIMAL(12, 2) DEFAULT 0,
  status TEXT DEFAULT 'aberta',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE contas_pagar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES tbl_clientes(id) ON DELETE CASCADE,
  Descricao TEXT NOT NULL,
  fornecedor TEXT,
  valor_total DECIMAL(12, 2),
  data_vencimento DATE,
  status TEXT DEFAULT 'aberto',
  origem TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE parcelas_contas_pagar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_pagar_id UUID NOT NULL REFERENCES contas_pagar(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES tbl_clientes(id),
  numero_parcela INTEGER,
  valor_parcela DECIMAL(12, 2),
  data_vencimento DATE,
  data_pagamento DATE,
  valor_pago DECIMAL(12, 2) DEFAULT 0,
  status TEXT DEFAULT 'aberta',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- ==========================================
-- 4. TABELAS DE BANCOS E SALDOS
-- ==========================================

CREATE TABLE saldo_contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES tbl_clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  saldo_inicial DECIMAL(12, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proprietario_id UUID NOT NULL,
  saldo_conta_id UUID REFERENCES saldo_contas(id),
  tipo TEXT NOT NULL, -- 'Entrada' ou 'Saída'
  valor DECIMAL(12, 2) NOT NULL,
  descricao TEXT,
  data_lancamento DATE NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- ==========================================
-- 5. TABELAS DE PONTO ELETRÔNICO
-- ==========================================

CREATE TABLE registros_ponto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES tbl_usuarios(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES tbl_clientes(id),
  data_registro DATE NOT NULL,
  hora_entrada TIME,
  hora_saida TIME,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  foto_entrada TEXT,
  foto_saida TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE folha_ponto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES tbl_usuarios(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES tbl_clientes(id),
  mes_ano DATE NOT NULL,
  horas_trabalhadas DECIMAL(5, 2),
  horas_extras DECIMAL(5, 2),
  faltas_injustificadas INTEGER DEFAULT 0,
  faltas_justificadas INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

-- ==========================================
-- 6. TABELAS DE CONTRATOS
-- ==========================================

CREATE TABLE contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES tbl_admins(id),
  cliente_id UUID NOT NULL REFERENCES tbl_clientes(id),
  numero_contrato TEXT UNIQUE,
  status TEXT DEFAULT 'ativo',
  data_inicio DATE,
  data_fim DATE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE modelos_contrato (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES tbl_admins(id),
  nome TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  tags JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT now()
);

-- ==========================================
-- 7. TABELAS DE DOCUMENTOS SOCIETÁRIOS
-- ==========================================

CREATE TABLE blocos_societarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES tbl_admins(id),
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE modelos_documentos_societarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES tbl_admins(id),
  nome TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- ==========================================
-- ÍNDICES PARA PERFORMANCE
-- ==========================================

CREATE INDEX idx_admin_contas_receber_admin ON admin_contas_receber(admin_id);
CREATE INDEX idx_admin_contas_receber_cliente ON admin_contas_receber(cliente_id);
CREATE INDEX idx_admin_parcelas_receber_conta ON admin_parcelas_receber(conta_receber_id);
CREATE INDEX idx_contas_pagar_empresa ON contas_pagar(empresa_id);
CREATE INDEX idx_parcelas_contas_pagar_conta ON parcelas_contas_pagar(conta_pagar_id);
CREATE INDEX idx_registros_ponto_usuario ON registros_ponto(usuario_id);
CREATE INDEX idx_registros_ponto_data ON registros_ponto(data_registro);
CREATE INDEX idx_lancamentos_proprietario ON lancamentos(proprietario_id);
CREATE INDEX idx_lancamentos_saldo_conta ON lancamentos(saldo_conta_id);
```

#### B. Criar Políticas de RLS (Row Level Security)

```sql
-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Habilitar RLS
ALTER TABLE admin_contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_parcelas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcelas_contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE saldo_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_ponto ENABLE ROW LEVEL SECURITY;

-- ========== CONTAS A PAGAR (Cliente) ==========

-- Cliente vê apenas suas próprias contas a pagar
CREATE POLICY "Cliente vê suas contas a pagar"
  ON contas_pagar FOR SELECT
  USING (empresa_id = auth.uid());

-- Cliente insere em suas contas a pagar
CREATE POLICY "Cliente insere contas a pagar"
  ON contas_pagar FOR INSERT
  WITH CHECK (empresa_id = auth.uid());

-- Cliente atualiza suas contas a pagar
CREATE POLICY "Cliente atualiza contas a pagar"
  ON contas_pagar FOR UPDATE
  USING (empresa_id = auth.uid())
  WITH CHECK (empresa_id = auth.uid());

-- ========== PARCELAS CONTAS A PAGAR ==========

-- Cliente vê parcelas de suas contas
CREATE POLICY "Cliente vê parcelas contas a pagar"
  ON parcelas_contas_pagar FOR SELECT
  USING (
    empresa_id = auth.uid()
  );

-- Cliente insere parcelas
CREATE POLICY "Cliente insere parcelas contas a pagar"
  ON parcelas_contas_pagar FOR INSERT
  WITH CHECK (empresa_id = auth.uid());

-- ========== ADMIN PARCELAS RECEBER ==========

-- Permite cliente marcar ciente_cliente = true
CREATE POLICY "Cliente marca parcelas como ciente"
  ON admin_parcelas_receber FOR UPDATE
  USING (
    conta_receber_id IN (
      SELECT id FROM admin_contas_receber WHERE cliente_id = auth.uid()
    )
  )
  WITH CHECK (
    conta_receber_id IN (
      SELECT id FROM admin_contas_receber WHERE cliente_id = auth.uid()
    )
  );

-- ========== SALDO CONTAS ==========

CREATE POLICY "Cliente vê suas contas"
  ON saldo_contas FOR SELECT
  USING (empresa_id = auth.uid());

-- ========== REGISTROS PONTO ==========

CREATE POLICY "Funcionário vê seus registros"
  ON registros_ponto FOR SELECT
  USING (usuario_id = auth.uid());

CREATE POLICY "Funcionário insere registros"
  ON registros_ponto FOR INSERT
  WITH CHECK (usuario_id = auth.uid());
```

#### C. Criar Funções RPC

```sql
-- ==========================================
-- FUNÇÕES RPC (Remote Procedure Call)
-- ==========================================

-- Ativar assinatura
CREATE OR REPLACE FUNCTION activate_subscription(
  p_cliente_id UUID,
  p_plano_id TEXT,
  p_dias_trial INTEGER DEFAULT 30
)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
BEGIN
  UPDATE tbl_clientes
  SET 
    plano_id = p_plano_id,
    data_fim_acesso = NOW() + (p_dias_trial || ' days')::INTERVAL,
    updated_at = NOW()
  WHERE id = p_cliente_id;
  
  RETURN QUERY SELECT true::BOOLEAN, 'Assinatura ativada com sucesso'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Renovar assinatura
CREATE OR REPLACE FUNCTION manual_subscription_renewal(
  p_cliente_id UUID,
  p_dias_renovacao INTEGER DEFAULT 30
)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
BEGIN
  UPDATE tbl_clientes
  SET 
    data_fim_acesso = NOW() + (p_dias_renovacao || ' days')::INTERVAL,
    updated_at = NOW()
  WHERE id = p_cliente_id;
  
  RETURN QUERY SELECT true::BOOLEAN, 'Assinatura renovada com sucesso'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Calcular saldo dinâmico de conta
CREATE OR REPLACE FUNCTION calcular_saldo_conta(p_saldo_conta_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_saldo DECIMAL;
  v_saldo_inicial DECIMAL;
BEGIN
  SELECT saldo_inicial INTO v_saldo_inicial
  FROM saldo_contas
  WHERE id = p_saldo_conta_id;
  
  SELECT v_saldo_inicial + 
    COALESCE(SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE -valor END), 0)
  INTO v_saldo
  FROM lancamentos
  WHERE saldo_conta_id = p_saldo_conta_id;
  
  RETURN v_saldo;
END;
$$ LANGUAGE plpgsql;

-- Validar email disponível
CREATE OR REPLACE FUNCTION email_disponivel(p_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS(
    SELECT 1 FROM tbl_admins WHERE email = p_email
    UNION ALL
    SELECT 1 FROM tbl_clientes WHERE email = p_email
    UNION ALL
    SELECT 1 FROM tbl_usuarios WHERE email = p_email
  );
END;
$$ LANGUAGE plpgsql;
```

---

## Histórico de Manutenção e Migrações Críticas

Esta seção documenta as principais alterações de arquitetura e migrações críticas que garantem a estabilidade e segurança do sistema.

### Dezembro 2025: Correção da Recursão Infinita de RLS

O sistema apresentou um erro crítico de "infinite recursion" que bloqueava o acesso de administradores (admin_usuarios) a diversas funcionalidades, como saldos, planos, lançamentos e folha de ponto.

**Contexto do Problema:**
A `tbl_usuarios_select_policy` causava recursão porque, ao avaliar um `SELECT` em `tbl_usuarios`, ela executava uma subquery (`EXISTS`) que tocava em `tbl_clientes` e `admin_usuarios`. Como essas tabelas também possuíam RLS ativo, o PostgreSQL reavaliava as mesmas policies em um loop infinito, impedindo o carregamento dos dados.

**Solução Aplicada:**
A solução definitiva envolveu a criação de uma tabela auxiliar sem RLS e a reescrita de todas as policies problemáticas para usar uma função segura (`SECURITY DEFINER`) que consulta essa tabela.

---

#### Passo 1: Tabela Auxiliar e Função Segura

Primeiro, criamos uma tabela de lookup, seus triggers de sincronização e a função que busca o `admin_id` do usuário logado de forma segura, sem disparar RLS.

```sql
-- 1.1) Cria tabela auxiliar (sem RLS) para mapear admin_id de cada admin_usuario
CREATE TABLE IF NOT EXISTS public.admin_user_lookup (
  id uuid PRIMARY KEY,
  admin_id uuid NOT NULL
);

-- 1.2) Trigger que sincroniza a tabela auxiliar sempre que admin_usuarios muda
CREATE OR REPLACE FUNCTION public.sync_admin_user_lookup()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_admin_usuarios_lookup_aiu ON public.admin_usuarios;
DROP TRIGGER IF EXISTS trg_admin_usuarios_lookup_ad ON public.admin_usuarios;

CREATE TRIGGER trg_admin_usuarios_lookup_aiu
AFTER INSERT OR UPDATE ON public.admin_usuarios
FOR EACH ROW EXECUTE FUNCTION public.sync_admin_user_lookup();

CREATE TRIGGER trg_admin_usuarios_lookup_ad
AFTER DELETE ON public.admin_usuarios
FOR EACH ROW EXECUTE FUNCTION public.sync_admin_user_lookup();

-- 1.3) Backfill (para garantir que todos os usuários atuais estão refletidos)
INSERT INTO public.admin_user_lookup (id, admin_id)
SELECT id, admin_id FROM public.admin_usuarios
ON CONFLICT (id) DO UPDATE SET admin_id = EXCLUDED.admin_id;

-- 1.4) Função segura para obter o admin_id do usuário atual (sem RLS)
-- A função precisa ser VOLATILE porque usa 'SET LOCAL', que é proibido em funções STABLE ou IMMUTABLE.
CREATE OR REPLACE FUNCTION public.get_admin_id_for_current_user()
  RETURNS uuid
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
AS $$
DECLARE
  current_admin uuid;
BEGIN
  SET LOCAL row_security = off;
  SELECT admin_id INTO current_admin FROM public.admin_user_lookup WHERE id = auth.uid();
  RETURN current_admin;
END;
$$;
```

---

#### Passo 2: Recriação das Policies de `tbl_clientes` e `tbl_usuarios`

Com a função `get_admin_id_for_current_user()` disponível, as policies foram reescritas para evitar subqueries recursivas.

```sql
-- Limpa policies antigas de tbl_clientes e tbl_usuarios
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('tbl_clientes', 'tbl_usuarios')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', r.policyname, r.tablename);
  END LOOP;
END$$;

-- tbl_clientes
ALTER TABLE public.tbl_clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tbl_clientes_select ON public.tbl_clientes
FOR SELECT USING (
  id = auth.uid()
  OR admin_id = auth.uid()
  OR public.get_admin_id_for_current_user() = public.tbl_clientes.admin_id
);
CREATE POLICY tbl_clientes_insert ON public.tbl_clientes FOR INSERT WITH CHECK (admin_id = auth.uid());
CREATE POLICY tbl_clientes_update ON public.tbl_clientes FOR UPDATE USING (admin_id = auth.uid());
CREATE POLICY tbl_clientes_delete ON public.tbl_clientes FOR DELETE USING (admin_id = auth.uid());

-- tbl_usuarios
ALTER TABLE public.tbl_usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY tbl_usuarios_select ON public.tbl_usuarios
FOR SELECT USING (
  id = auth.uid()
  OR cliente_id = auth.uid()
  OR (
    public.get_admin_id_for_current_user() IS NOT NULL
    AND public.get_admin_id_for_current_user() = (
      SELECT tc.admin_id FROM public.tbl_clientes tc
      WHERE tc.id = public.tbl_usuarios.cliente_id
      LIMIT 1
    )
  )
);
-- Policies de INSERT, UPDATE, DELETE seguem a mesma lógica da SELECT.
CREATE POLICY tbl_usuarios_insert ON public.tbl_usuarios FOR INSERT WITH CHECK (cliente_id = auth.uid() OR (public.get_admin_id_for_current_user() IS NOT NULL AND public.get_admin_id_for_current_user() = (SELECT tc.admin_id FROM public.tbl_clientes tc WHERE tc.id = public.tbl_usuarios.cliente_id LIMIT 1)));
CREATE POLICY tbl_usuarios_update ON public.tbl_usuarios FOR UPDATE USING (cliente_id = auth.uid() OR (public.get_admin_id_for_current_user() IS NOT NULL AND public.get_admin_id_for_current_user() = (SELECT tc.admin_id FROM public.tbl_clientes tc WHERE tc.id = public.tbl_usuarios.cliente_id LIMIT 1)));
CREATE POLICY tbl_usuarios_delete ON public.tbl_usuarios FOR DELETE USING (cliente_id = auth.uid() OR (public.get_admin_id_for_current_user() IS NOT NULL AND public.get_admin_id_for_current_user() = (SELECT tc.admin_id FROM public.tbl_clientes tc WHERE tc.id = public.tbl_usuarios.cliente_id LIMIT 1)));
```

---

#### Passo 3: Recriação das Policies de `saldo_contas`, `plano_contas`, e `lancamentos`

As tabelas financeiras também foram corrigidas para permitir o acesso do administrador.

```sql
-- Limpa policies antigas
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('saldo_contas','plano_contas','lancamentos')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', r.policyname, r.tablename);
  END LOOP;
END$$;

-- saldo_contas
ALTER TABLE public.saldo_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY saldo_contas_select_policy ON public.saldo_contas FOR SELECT USING (proprietario_id = auth.uid() OR public.get_admin_id_for_current_user() = public.saldo_contas.proprietario_id);
CREATE POLICY saldo_contas_insert_policy ON public.saldo_contas FOR INSERT WITH CHECK (proprietario_id = auth.uid());
CREATE POLICY saldo_contas_update_policy ON public.saldo_contas FOR UPDATE USING (proprietario_id = auth.uid());
CREATE POLICY saldo_contas_delete_policy ON public.saldo_contas FOR DELETE USING (proprietario_id = auth.uid());

-- plano_contas
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY plano_contas_select_policy ON public.plano_contas FOR SELECT USING (proprietario_id = auth.uid() OR public.get_admin_id_for_current_user() = public.plano_contas.proprietario_id);
CREATE POLICY plano_contas_insert_policy ON public.plano_contas FOR INSERT WITH CHECK (proprietario_id = auth.uid());
CREATE POLICY plano_contas_update_policy ON public.plano_contas FOR UPDATE USING (proprietario_id = auth.uid());
CREATE POLICY plano_contas_delete_policy ON public.plano_contas FOR DELETE USING (proprietario_id = auth.uid());

-- lancamentos
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY lancamentos_select_policy ON public.lancamentos FOR SELECT USING (proprietario_id = auth.uid() OR public.get_admin_id_for_current_user() = public.lancamentos.proprietario_id);
CREATE POLICY lancamentos_insert_policy ON public.lancamentos FOR INSERT WITH CHECK (proprietario_id = auth.uid());
CREATE POLICY lancamentos_update_policy ON public.lancamentos FOR UPDATE USING (proprietario_id = auth.uid());
CREATE POLICY lancamentos_delete_policy ON public.lancamentos FOR DELETE USING (proprietario_id = auth.uid());
```

---

#### Passo 4: Recriação das Policies de Ponto e Férias

Finalmente, as tabelas de RH foram ajustadas.

```sql
-- Limpa policies antigas
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('registros_ponto','admin_registros_ponto','ferias','admin_ferias_user')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', r.policyname, r.tablename);
  END LOOP;
END$$;

-- registros_ponto
ALTER TABLE public.registros_ponto ENABLE ROW LEVEL SECURITY;
CREATE POLICY registros_ponto_select ON public.registros_ponto FOR SELECT USING (funcionario_id = auth.uid() OR empresa_id = auth.uid() OR public.get_admin_id_for_current_user() = public.registros_ponto.empresa_id);
CREATE POLICY registros_ponto_insert ON public.registros_ponto FOR INSERT WITH CHECK (funcionario_id = auth.uid() OR empresa_id = auth.uid());
CREATE POLICY registros_ponto_update ON public.registros_ponto FOR UPDATE USING (funcionario_id = auth.uid() OR empresa_id = auth.uid());
CREATE POLICY registros_ponto_delete ON public.registros_ponto FOR DELETE USING (funcionario_id = auth.uid() OR empresa_id = auth.uid());

-- admin_registros_ponto
ALTER TABLE public.admin_registros_ponto ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_registros_ponto_select ON public.admin_registros_ponto FOR SELECT USING (funcionario_id = auth.uid() OR admin_id = auth.uid() OR public.get_admin_id_for_current_user() = public.admin_registros_ponto.admin_id);
CREATE POLICY admin_registros_ponto_insert ON public.admin_registros_ponto FOR INSERT WITH CHECK (funcionario_id = auth.uid() OR admin_id = auth.uid());
CREATE POLICY admin_registros_ponto_update ON public.admin_registros_ponto FOR UPDATE USING (funcionario_id = auth.uid() OR admin_id = auth.uid());
CREATE POLICY admin_registros_ponto_delete ON public.admin_registros_ponto FOR DELETE USING (funcionario_id = auth.uid() OR admin_id = auth.uid());

-- ferias
ALTER TABLE public.ferias ENABLE ROW LEVEL SECURITY;
CREATE POLICY ferias_select ON public.ferias FOR SELECT USING (funcionario_id = auth.uid() OR empresa_id = auth.uid() OR public.get_admin_id_for_current_user() = public.ferias.empresa_id);
CREATE POLICY ferias_insert ON public.ferias FOR INSERT WITH CHECK (funcionario_id = auth.uid() OR empresa_id = auth.uid());
CREATE POLICY ferias_update ON public.ferias FOR UPDATE USING (funcionario_id = auth.uid() OR empresa_id = auth.uid());
CREATE POLICY ferias_delete ON public.ferias FOR DELETE USING (funcionario_id = auth.uid() OR empresa_id = auth.uid());

-- admin_ferias_user
ALTER TABLE public.admin_ferias_user ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_ferias_user_select ON public.admin_ferias_user FOR SELECT USING (funcionario_id = auth.uid() OR admin_id = auth.uid() OR public.get_admin_id_for_current_user() = public.admin_ferias_user.admin_id);
CREATE POLICY admin_ferias_user_insert ON public.admin_ferias_user FOR INSERT WITH CHECK (funcionario_id = auth.uid() OR admin_id = auth.uid());
CREATE POLICY admin_ferias_user_update ON public.admin_ferias_user FOR UPDATE USING (funcionario_id = auth.uid() OR admin_id = auth.uid());
CREATE POLICY admin_ferias_user_delete ON public.admin_ferias_user FOR DELETE USING (funcionario_id = auth.uid() OR admin_id = auth.uid());
```
**Conclusão:**
A aplicação desses scripts eliminou completamente os erros de recursão, restaurando o acesso e a funcionalidade para todos os perfis de usuário. Este conjunto de migrações serve como um ponto de partida estável para o sistema de RLS.

### Dezembro 2025: Correção de Acesso e UX em Documentos Societários

Após a correção da recursão, foram identificados e resolvidos problemas subsequentes no módulo de Documentos Societários, especificamente na criação de modelos.

**1. Problema de Acesso aos Blocos Societários:**
- **Sintoma:** Usuários do tipo `admin_usuario` não conseguiam visualizar os blocos de conteúdo criados pelo seu `admin` proprietário, embora a permissão de RLS devesse permitir.
- **Causa Raiz:** A política de RLS para a tabela `blocos_societarios` estava ausente ou incorreta.
- **Solução:** Foi aplicada uma nova política de RLS para garantir que `admin_usuarios` pudessem ver tanto os seus próprios blocos quanto os do seu `admin` chefe, utilizando a função `get_admin_id_for_current_user()` já existente.

```sql
-- Política de SELECT para blocos_societarios
ALTER POLICY "admin_usuarios_select_blocos_societarios"
ON public.blocos_societarios
USING (
  (proprietario_id = auth.uid())
  OR
  (proprietario_id = public.get_admin_id_for_current_user())
  OR
  (proprietario_id IS NULL)
);
```

**2. Bug na Listagem de Blocos no Formulário:**
- **Sintoma:** Mesmo com a política de RLS correta, a lista de blocos continuava vazia para `admin_usuarios`.
- **Causa Raiz:** Um bug no componente de formulário (`FormDocumentoSocietarioModelo.tsx`). Uma verificação `if (!ownerId) return;` impedia a execução da busca de blocos, pois a função `getOwnerId` retornava `null` para o perfil `admin_usuario`.
- **Solução:** A lógica de busca de dados foi refatorada. A função `fetchBlocos` foi separada da `fetchTags`, permitindo que a busca de blocos seja executada para qualquer usuário autenticado, independentemente do `ownerId`, deixando a segurança a cargo exclusivo do RLS no backend.

**3. Melhoria na Experiência de Arrastar e Soltar (Drag-and-Drop):**
- **Sintoma:** A funcionalidade nativa de arrastar e soltar era pouco intuitiva e a inserção do texto no editor era frágil.
- **Solução:** O componente `RichTextEditor` foi refatorado para expor uma referência à sua API interna. O formulário agora utiliza essa referência para inserir o conteúdo dos blocos de forma mais robusta. Além disso, foi adicionado um feedback visual (um anel de destaque) que aparece na área do editor ao arrastar um bloco sobre ela, melhorando a usabilidade.

## Funcionalidades e Telas

### 1. **Tela de Login e Autenticação**
- Autenticação via email/senha
- Recuperação de senha
- Seleção de perfil (Admin/Cliente/Funcionário)

### 2. **Dashboard / Painel**
- Resumo financeiro (receitas, despesas, saldo)
- Gráficos de fluxo de caixa
- Alertas de contas vencidas
- Notificações de eventos importantes

### 3. **Contas a Receber (`/contas-receber`)**

#### Aba Sintética
- Lista de contas com status
- Valor total e progresso de recebimento
- Ações rápidas (editar, deletar, visualizar parcelas)

#### Aba Parcelas
- Tabela de parcelas com data de vencimento
- Status de cada parcela
- Coluna **"Ciente Cliente"** (Admin apenas) - mostra se o cliente já lançou em suas contas a pagar
- Botão para registrar recebimento

#### Aba Recebimentos
- Histórico de pagamentos recebidos
- Detalhes de forma de pagamento
- Saldo da conta de destino

**Como Usar:**
1. Acesse `/contas-receber`
2. Crie uma nova conta via botão "Nova Conta a Receber"
3. Preencha descrição, valor, datas e cliente
4. Sistema gera parcelas automaticamente
5. Acompanhe recebimentos na aba "Recebimentos"

### 4. **Contas a Pagar (`/contas-pagar`)**

#### Aba Sintética
- Visualização em sintético das contas a pagar
- Filtros por status, período e origem
- Editar ou deletar contas

#### Aba Parcelas
- Lista detalhada de parcelas
- Indicadores de vencimento e saldo
- Registrar pagamento de parcela

#### Aba Pagamentos
- Histórico completo de pagamentos
- Detalhes da forma de pagamento
- Saldo após pagamento

#### Alerta de Contas Futuras
- Mensagem destacada quando há parcelas pendentes do Admin
- Botão para abrir modal de "Contas Futuras"

**Como Usar:**
1. Acesse `/contas-pagar`
2. Se há contas futuras, aparece alerta "Contas Futuras Pendentes"
3. Clique em "Ver Contas Futuras"
4. Modal mostra parcelas do Admin
5. Confirme o lançamento (cria conta + parcelas e marca `ciente_cliente = true`)
6. Modal fecha automaticamente e alerta desaparece

### 5. **Contas Futuras (Modal)**
- Visualiza parcelas criadas pelo Admin
- Mostra nome do Admin como fornecedor
- Lança automaticamente em suas contas a pagar
- Marca como "já lançado" com badge verde

### 6. **Ponto Eletrônico (`/ponto-eletronico`)**
- Registro de entrada/saída com selfie, geolocalização guiada e fallback manual.
- O GPS é solicitado *após* a captura da foto (gesto do usuário), e há um botão “Obter/Atualizar Localização” com status visual para guiar permissões.
- Quando o navegador nega ou dá timeout, o usuário copia coordenadas do Google Maps (botão link abre o Maps) e cola nos campos manuais (latitude, longitude, precisão) antes de salvar.
- O lançamento é permitido com ou sem localização; a confirmação alerta que o envio ficará sem coordenadas quando necessário.
- O histórico registra `latitude`, `longitude`, `accuracy` e `maps_url` somente quando disponíveis.

**Como Usar:**
1. Acesse `/ponto-eletronico`.
2. Capture a selfie (a câmera é ativada automaticamente).
3. Toque em “Obter Localização” depois da foto; aguarde permissão/minutos.
4. Se necessário, cole coordenadas do Google Maps e clique em “Usar coordenadas”.
5. Confirme a Entrada ou Saída; mesmo sem GPS, o registro é salvo, e o alerta no diálogo informa o gestor.

### 7. **Folha de Ponto (`/folha-ponto`)**
- Visualização mensal de horas trabalhadas
- Cálculo automático de horas extras
- Gestão de faltas e abonos
- Impressão de folha

**Como Usar:**
1. Acesse `/folha-ponto`
2. Selecione mês/ano desejado
3. Visualize horas trabalhadas, extras e saldo
4. Ajuste manual de registros se necessário
5. Registre faltas/abonos
6. Imprima via botão "Imprimir Folha"

### 8. **Contratos (`/contratos`)**

#### Gerenciar Modelos
- Upload de templates (HTML/Texto)
- Edição e preview
- Associação de tags

#### Preencher Contrato
- Seleção de modelo e cliente
- Preenchimento de dados
- Preview do contrato renderizado
- Geração automática de contas a receber

#### Visualizar Contratos
- Lista de contratos criados
- Status (ativo, cancelado, finalizado)
- Ações (editar, cancelar, visualizar)

### 9. **Relatórios Financeiros**

#### DRE (Demonstração de Resultado)
- Receitas x Despesas
- Lucro/Prejuízo
- Análise por período

#### Balanço Patrimonial
- Ativo, Passivo, PL
- Estrutura contábil completa
- Conformidade com IFRS

#### Razão
- Lançamentos por conta contábil
- Detalhamento completo
- Exportação em formatos

**Como Usar:**
1. Acesse `/relatorios` ou `/dre` ou `/balanco-patrimonial`
2. Selecione período desejado
3. Visualize gráficos e tabelas
4. Exporte em PDF ou Excel

### 10. **Bancos e Caixas (`/bancos`)**
- Criação de contas bancárias
- Saldo inicial e dinâmico
- Conciliação bancária
- Movimento de transferências

### 11. **Lançamentos (`/lancamentos`)**
- Entrada/Saída manual
- Lançamentos contábeis
- Histórico completo
- Exportação para sistemas contábeis

### 12. **Usuários e Permissões (`/gerenciar-usuarios`)**
- Cadastro de funcionários
- Atribuição de cargos
- Controle de permissões por módulo
- Desativação de usuários

---

### 13. **Tabelas Padrão & Exportação (`/exportar`)**
- **Card de Downloads:** A página `/exportar` agora oferece botões para baixar os CSVs `plano_contas_padrao.csv` e `historicos_padrao.csv` que ficam em `public/` como modelos oficiais antes de importar.
- **Configuração para Admin:** Em Configurações (somente para admin) existe a aba “Configuração Tabelas Padrão” onde o administrador pode subir planos/ históricos no formato CSV ou JSON, ou apontar para um link externo. Os dados são parseados, exibem um resumo e ficam disponíveis para download nos registros listados.
- **Banco e migração:** Os dados vão para a tabela `public.configuracao_tabelas_padrao` (migrada pelo script `supabase/migrations/20241216_configuracao_tabelas_padrao.sql`). A tabela tem FK para `tbl_admins(id)` e guarda JSON em `plano_de_contas` e `historicos`, além de registrar `created_at`. Rode `supabase db push` (ou aplique o SQL manualmente) para criar a tabela antes de usar essa aba.
- **Segurança/RLS:** A tabela habilita Row Level Security e aplica a policy `Admins gerenciam suas tabelas padrão`, portanto apenas o admin autenticado (`auth.uid() = id_admin`) consegue inserir, editar ou deletar seus próprios registros. Edge functions ou scripts que precisam manipular esses dados devem usar a role de serviço (service role key) ou atuar enquanto o admin estiver autenticado para vencer a policy.
- **Permissões e Upsert:** A mesma policy garante isolamento por admin; o campo `configuracao_tabelas_padrao.id_admin` referencia `tbl_admins.id`. Além disso, a migration `supabase/migrations/20241217_configuracao_contabil_unique_constraint.sql` adiciona a constraint única `(proprietario_id, tipo_natureza)` em `configuracao_contabil`, exigida pelos formulários que fazem `upsert(..., { on_conflict: 'proprietario_id, tipo_natureza' })`.

### Guia obrigatório de marcações no Plano de Contas
Depois de importar o plano e os históricos, marque no mínimo uma conta para cada categoria abaixo. O sistema bloqueia o dashboard e os módulos de Contas a Pagar/Receber enquanto algum item estiver pendente (o checklist aparece no topo da tela de Plano de Contas).

1. **Caixa** – abra a conta correspondente e habilite o switch `É Caixa?`.
2. **Banco** – marque ao menos uma conta bancária com o switch `É Banco?`.
3. **Clientes / Contas a Receber** – marque uma conta patrimonial para clientes com o switch `Clientes a Receber`.
4. **Fornecedores / Contas a Pagar** – marque uma conta patrimonial de fornecedores com o switch `Fornecedores a Pagar`.
5. **Capital Social** – identifique a conta de capital social (geralmente em Patrimônio Líquido) e mantenha o flag patrimonial ativo.
6. **Receita** – marque ao menos uma conta de resultado como Receita.
7. **Despesa / Custo** – marque ao menos uma conta de resultado de despesa ou custo.

Esses marcadores abastecem as configurações 3.1/3.2/3.3 e os formulários de lançamentos; sem eles o usuário não consegue registrar entradas/saídas.

## Arquitetura e Fluxos

### Fluxo de Autenticação

```
Usuário → Login → Supabase Auth → JWT Token → Dashboard
```

### Fluxo de Contas Futuras

```
Admin cria CR → Cliente vê em "Contas Futuras"
    ↓
Cliente clica "Lançar em Contas a Pagar"
    ↓
Sistema cria: Conta + Parcelas em CP
Sistema marca: ciente_cliente = true em admin_parcelas_receber
    ↓
Modal fecha → Alerta desaparece
```

### Fluxo de Faturamento (Stripe)

```
Cliente adere plano → Checkout Stripe → Pagamento confirmado
    ↓
RPC activate_subscription é chamada
    ↓
Atualiza: plano_id, data_fim_acesso
    ↓
Cria: Contas a Receber (faturamento)
```

### Fluxo Contábil (Partidas Dobradas)

```
Criação CR:        D: Clientes a Receber  | C: Receita
Recebimento CR:    D: Caixa/Banco         | C: Clientes a Receber

Criação CP:        D: Despesa/Custo       | C: Obrigação a Pagar
Pagamento CP:      D: Obrigação a Pagar   | C: Caixa/Banco
```

### Fluxo de Configuração Inicial

1. Cliente importa plano de contas e históricos **e** marca obrigatoriamente Caixa, Banco, Clientes, Fornecedores, Capital Social, Receita e Despesa no plano de contas.
2. O `SetupBlocker` bloqueia `/painel`, `/contas-pagar`, `/contas-receber` e `/plano-contas` até todas as etapas (planos, históricos, configurações de CP/CR/Contratos e marcações) ficarem completas; o checklist aparece no topo do `PlanoContas`.
3. Após o checklist completo, o alerta "Lançamento inicial obrigatório" instrui o cliente sobre o primeiro lançamento contábil: **D: Caixa/Banco · C: Capital Social**.
4. O sistema exige que este primeiro lançamento manual seja registrado antes de liberar definitivamente os módulos.
5. O alerta desaparece automaticamente assim que qualquer lançamento entra na tabela `lancamentos` para esse `proprietario_id`, pois o hook `fetchSetupStatus` agora marca o campo `firstLaunchCompleted` quando encontra um registro no banco.

---

## API e Integrações

### Stripe
- **Checkout:** `/create-checkout-session`
- **Renovação:** `/create-renewal-session`
- **Webhooks:** Confirmação de pagamentos

### Supabase
- **Auth:** Email/password, JWT, MFA
- **RLS:** Políticas por tenant
- **RPC:** Funções de banco de dados

### Funcionalidades do Supabase

#### Autenticação
- Email/Senha com confirmação
- Recuperação de senha
- MFA (Multi-Factor Authentication)
- Gerenciamento de sessão via JWT

#### Banco de Dados PostgreSQL
- Suporte a JSON/JSONB
- Full-text search
- Triggers e stored procedures
- Replicação e backup automático

#### Storage (Arquivos)
- Upload de imagens (fotos de ponto, documentos)
- Integração com CDN
- Controle de acesso por RLS

---

## Segurança

### RLS (Row Level Security)
- Admin vê dados via tabelas `admin_*`
- Cliente vê apenas seus dados
- Funcionário vê apenas seus registros
- **Configuração inicial exigida:** O `SetupBlocker` trava os módulos financeiros até que o cliente importe plano/históricos, configure contas a pagar/receber/contratos e marque as 7 categorias essenciais. Após a conclusão, um alerta fixa o requisito do primeiro lançamento contábil (D: Caixa/Banco · C: Capital Social) e libera o uso completo do sistema.

### Campos Sensíveis
- Senhas: hash via Supabase Auth
- CPF/CNPJ: criptografia de aplicação (recomendado)
- Dados bancários: não armazenar direto

### Políticas de RLS Críticas

```sql
-- Cliente atualiza ciente_cliente (nova policy)
CREATE POLICY "Cliente marca parcelas como ciente"
  ON admin_parcelas_receber FOR UPDATE
  USING (conta_receber_id IN (
    SELECT id FROM admin_contas_receber WHERE cliente_id = auth.uid()
  ));
```

---

## Estrutura de Dados Simplificada

```
tbl_admins (proprietário da plataforma)
  ├── admin_contas_receber
  │   └── admin_parcelas_receber
  ├── admin_contas_pagar
  │   └── admin_parcelas_pagar
  └── tbl_clientes (gerenciados)

tbl_clientes (empresa/cliente)
  ├── contas_receber
  │   └── parcelas_contas_receber
  ├── contas_pagar
  │   └── parcelas_contas_pagar
  ├── saldo_contas
  ├── lancamentos (contabilidade)
  └── tbl_usuarios (funcionários)
      └── registros_ponto
          └── folha_ponto
```

---

## Testando Localmente

### 1. Criar Admin e Cliente de Teste

```sql
-- Criar usuário Admin (via Supabase Auth)
INSERT INTO tbl_admins (nome, email) VALUES ('Admin Teste', 'admin@teste.com');

-- Criar cliente de teste
INSERT INTO tbl_clientes (nome, email, admin_id) VALUES 
('Empresa Teste', 'empresa@teste.com', (SELECT id FROM tbl_admins LIMIT 1));
```

### 2. Criar Dados de Teste

```sql
-- Inserir conta a receber (Admin)
INSERT INTO admin_contas_receber (admin_id, cliente_id, descricao, valor_total, data_vencimento, origem)
VALUES (
  (SELECT id FROM tbl_admins LIMIT 1),
  (SELECT id FROM tbl_clientes LIMIT 1),
  'Serviço Prestado',
  5000.00,
  NOW() + INTERVAL '30 days',
  'manual'
);

-- Inserir parcelas
INSERT INTO admin_parcelas_receber (conta_receber_id, admin_id, numero_parcela, valor_parcela, data_vencimento)
VALUES (
  (SELECT id FROM admin_contas_receber LIMIT 1),
  (SELECT id FROM tbl_admins LIMIT 1),
  1,
  5000.00,
  NOW() + INTERVAL '30 days'
);
```

### 3. Testar Fluxo de Contas Futuras

1. Faça login como Cliente
2. Acesse `/contas-pagar`
3. Alerta "Contas Futuras Pendentes" deve aparecer
4. Clique "Ver Contas Futuras"
5. Modal mostra parcela do Admin
6. Confirme lançamento
7. Verifique se `ciente_cliente` mudou para `true` em `admin_parcelas_receber`
8. Alerta desaparece

---

## Estrutura de Pastas

```
src/
├── components/          # Componentes React
│   ├── contas-pagar/   # Componentes de CP
│   ├── contas-receber/ # Componentes de CR
│   ├── ponto/          # Ponto eletrônico
│   ├── formularios/    # Formulários dinâmicos
│   └── ui/             # Componentes shadcn/ui
├── pages/              # Páginas/Rotas
├── hooks/              # Custom hooks
├── types/              # Tipos TypeScript
├── utils/              # Funções utilitárias
├── integrations/       # Stripe, Supabase
└── config/             # Configurações
```

---

## Troubleshooting

### Erro: "Could not find the 'cliente_id' column"
- Verificar se a coluna existe na tabela
- Usar `empresa_id` em vez de `cliente_id` para tabelas de cliente

### Erro: "RLS policy violation"
- Verificar policies de RLS no Supabase
- Confirmar se o usuário tem permissão para operação

### Modal não fecha
- Verificar se `onOpenChange(false)` é chamado após lançamento
- Limpar logs de console (F12) para mensagens de erro

### Coluna não atualiza
- Verificar RLS policy para UPDATE
- Usar `.eq()` para filtros específicos em UPDATE

---

## Suporte

Para dúvidas ou problemas:
1. Consulte documentação do Supabase: https://supabase.com/docs
2. Documentação do Stripe: https://stripe.com/docs
3. Issues no GitHub do projeto

---

## Licença

MIT License - veja arquivo LICENSE para detalhes

---

## Autores

Desenvolvido com ❤️ para gestão financeira e RH moderna.

---

**Versão:** 2.0  
**Última atualização:** Dezembro 2025  
**Status:** Production Ready ✅
