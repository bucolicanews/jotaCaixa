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

## 🎯 Visão Geral

O Jota App é uma plataforma SaaS multi-tenant que permite:

- **Administradores (Admin):** Gerenciar múltiplos clientes, criar contratos, monitorar finanças
- **Clientes (Empresas):** Gerenciar suas próprias finanças, colaboradores e contas
- **Funcionários:** Registrar ponto, visualizar folha de ponto e histórico

### Estrutura Multi-Tenant

- **Admin (Proprietário da Plataforma):** Acesso aos dados de todos os clientes via tabelas `admin_*`
- **Cliente (Empresa):** Acesso restrito aos seus próprios dados via tabelas normalizadas

---

## ✨ Recursos Principais

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

## 🖥️ Requisitos do Sistema

### Dependências Principais
- **Node.js:** >= 18.0.0
- **npm/pnpm:** >= 8.0.0
- **Navegador:** Chrome, Firefox, Safari ou Edge (últimas 2 versões)

### Contas e Serviços
- **Supabase:** Banco de dados PostgreSQL + autenticação
- **Stripe:** Processamento de pagamentos
- **Google Cloud:** Geolocalização (opcional)

---

## 🚀 Instalação e Configuração

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

## 🗄️ Configuração do Supabase

### 1. Criar Projeto Supabase

1. Acesse [supabase.com](https://supabase.com)
2. Crie um novo projeto
3. Copie a **Project URL** e **Anon Key**

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

## 📱 Funcionalidades e Telas

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
- Registro de entrada/saída com hora
- Captura de foto (selfie)
- Geolocalização automática
- Histórico diário

**Como Usar:**
1. Acesse `/ponto-eletronico`
2. Clique em "Registrar Entrada" ou "Registrar Saída"
3. Câmera ativa para captura de selfie
4. Sistema registra localização
5. Dados salvos no banco

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

## 🏗️ Arquitetura e Fluxos

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

---

## 🔌 API e Integrações

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

## 🔐 Segurança

### RLS (Row Level Security)
- Admin vê dados via tabelas `admin_*`
- Cliente vê apenas seus dados
- Funcionário vê apenas seus registros

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

## 📊 Estrutura de Dados Simplificada

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

## 🧪 Testando Localmente

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

## 📝 Estrutura de Pastas

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

## 🛠️ Troubleshooting

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

## 📞 Suporte

Para dúvidas ou problemas:
1. Consulte documentação do Supabase: https://supabase.com/docs
2. Documentação do Stripe: https://stripe.com/docs
3. Issues no GitHub do projeto

---

## 📄 Licença

MIT License - veja arquivo LICENSE para detalhes

---

## 👥 Autores

Desenvolvido com ❤️ para gestão financeira e RH moderna.

---

**Versão:** 2.0  
**Última atualização:** Dezembro 2025  
**Status:** Production Ready ✅
