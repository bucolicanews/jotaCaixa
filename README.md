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
- [Supabase Schema e Scripts](#supabase-schema-e-scripts)

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
# A aplicação estará disponível em http://localhost:8080
```

### 5. Build para Produção

```bash
pnpm build
# Os arquivos compilados estarão em ./dist
```

### 6. Build e preview
- `pnpm build` gera artefatos em `dist/`
- `pnpm preview` roda um servidor estático local para validar a build
- `pnpm lint` roda o ESLint configurado (opcional, mas recomendado antes do deploy)
- `pnpm start` roda o servidor estático de produção

### 7. Deploy (Vercel, Netlify, Supabase Hosting, etc.)
1. Configure as variáveis de ambiente da mesma forma que no `.env.local`
2. Garanta que as Functions (RPCs) do Supabase estejam implantadas e executadas
3. Execute `pnpm build` no pipeline e publique `dist/`
4. Para o Supabase, aplique `fix-rls-policies.sql` após qualquer restauração de banco:
   - Use o editor SQL (`supabase db query` ou painel) para recriar `saldo_contas`, `plano_contas` e `lancamentos` com o `EXISTS` para `admin_usuarios`
5. Teste rodando `SELECT * FROM admin_usuarios WHERE id = '<admin_usuario_id>'` e confirme `admin_id`
6. Faça logout/login no app após rodar o script para que o JWT receba as novas policies

### 8. Supabase + Stripe
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

---

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
7. **Despesa / Custo** – marque ao menos uma conta de resultado como Despesa ou Custo.

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

---

## 🛠️ Supabase Schema e Scripts

Esta seção detalha o estado atual do schema do banco de dados Supabase, incluindo todas as tabelas, funções, políticas e Edge Functions implantadas.

### 1. Tabelas (Public Schema)

| Table Name | Purpose |
| :--- | :--- |
| `admin_contas_pagar` | Contas a Pagar do Admin |
| `admin_contas_receber` | Contas a Receber do Admin |
| `admin_descricao_extrato` | Descrições de Extrato do Admin |
| `admin_ferias_user` | Férias de Funcionários do Admin |
| `admin_identificacao_extrato` | Identificadores de Extrato do Admin |
| `admin_pagamentos` | Histórico de Pagamentos do Admin |
| `admin_parcelas_pagar` | Parcelas a Pagar do Admin |
| `admin_parcelas_receber` | Parcelas a Receber do Admin |
| `admin_recebimentos` | Histórico de Recebimentos do Admin |
| `admin_registros_ponto` | Registros de Ponto de Funcionários do Admin |
| `admin_usuarios` | Perfis de Funcionários do Admin |
| `anexos` | Metadados de Anexos |
| `blocos_societarios` | Blocos de Conteúdo Societário |
| `clientes` | Clientes de Contas a Receber (CR) |
| `conciliacao_regras` | Regras de Mapeamento de Conciliação |
| `conciliacoes` | Histórico de Arquivos Conciliados |
| `configuracao_conciliacao` | Configurações de Mapeamento de Extrato |
| `configuracao_contabil` | Mapeamento de Níveis Contábeis |
| `configuracao_contas_pagar` | Mapeamento Contábil CP |
| `configuracao_contas_receber` | Mapeamento Contábil CR |
| `configuracao_contratos` | Configurações de Contratos e Faturamento |
| `configuracao_historico_padrao` | Histórico Padrão para Lançamentos |
| `configuracao_plano_contas` | Máscara de Código do Plano de Contas |
| `configuracoes_calima` | Configurações de Exportação Calima |
| `configuracoes_stripe` | Credenciais e Mapeamento Stripe |
| `contas_pagar` | Contas a Pagar do Cliente |
| `contas_receber` | Contas a Receber do Cliente |
| `contrato_modelos` | Modelos de Contrato |
| `contrato_tags` | Tags Dinâmicas de Contrato |
| `contratos` | Contratos de Recorrência |
| `contratos_gerados` | Instâncias de Contratos Gerados |
| `descricao_extrato` | Descrições de Extrato do Cliente |
| `documentos_societarios_gerados` | Documentos Societários Gerados |
| `extratos` | Transações Brutas de Extrato Bancário |
| `ferias` | Férias de Funcionários do Cliente |
| `historico_auditoria` | Histórico de Auditoria |
| `historicos` | Históricos Padronizados |
| `identificacao_extrato` | Identificadores de Extrato do Cliente |
| `lancamentos` | Lançamentos Contábeis (Partidas Dobradas) |
| `mensagens_ticket` | Mensagens de Tickets de Suporte |
| `modelos_societarios` | Modelos de Documentos Societários |
| `pagamentos` | Histórico de Pagamentos do Cliente |
| `parcelas_contas_pagar` | Parcelas a Pagar do Cliente |
| `parcelas_contas_receber` | Parcelas a Receber do Cliente |
| `periodos_aquisitivos` | Períodos Aquisitivos de Férias |
| `plano_contas` | Plano de Contas Contábil |
| `planos` | Planos de Assinatura |
| `recebimentos` | Histórico de Recebimentos do Cliente |
| `registros_ponto` | Registros de Ponto de Funcionários do Cliente |
| `saldo_contas` | Contas de Saldo (Caixa/Banco/Patrimonial) |
| `tbl_admins` | Perfil do Administrador |
| `tbl_clientes` | Perfil de Clientes do Sistema |
| `tbl_usuarios` | Perfis de Usuários/Funcionários |
| `tickets` | Tickets de Suporte |

### 2. Functions (RPCs e Triggers)

```sql
-- is_owner_or_admin_user
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
$function$

-- update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$function$

-- activate_subscription
CREATE OR REPLACE FUNCTION public.activate_subscription(p_cliente_id uuid, p_plano_id uuid, p_id_conta_resultado uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_plano_nome text;
    v_plano_preco numeric;
    v_proxima_data_fim date;
    v_data_emissao date := CURRENT_DATE;
    v_data_vencimento date := CURRENT_DATE + INTERVAL '5 days'; -- Exemplo: Vencimento em 5 dias
BEGIN
    -- 1. Obter informações do plano (preço e nome)
    SELECT 
        nome, 
        preco_mensal 
    INTO 
        v_plano_nome, 
        v_plano_preco
    FROM 
        public.planos 
    WHERE 
        id = p_plano_id;

    -- Se o plano não for encontrado, levanta um erro
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plano com ID % não encontrado.', p_plano_id;
    END IF;

    -- Calcula a nova data de fim de acesso (Exemplo: 30 dias a partir de hoje)
    v_proxima_data_fim := CURRENT_DATE + INTERVAL '30 days';

    -- 2. Atualizar a tabela tbl_clientes
    UPDATE public.tbl_clientes
    SET 
        plano_id = p_plano_id,
        data_fim_acesso = v_proxima_data_fim,
        aprovado = TRUE -- Aprova o cliente após o pagamento/ativação
    WHERE 
        id = p_cliente_id;

    -- Se o cliente não for encontrado, levanta um erro
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cliente com ID % não encontrado para atualização.', p_cliente_id;
    END IF;

    -- 3. Inserir um novo Título de Contas a Receber (Registro do Pagamento/Assinatura)
    -- NOTA: O status é 'recebido' porque a Edge Function foi chamada APÓS o pagamento do Stripe.
    INSERT INTO public.contas_receber (
        empresa_id, 
        cliente_id, 
        origem, 
        descricao, 
        valor_total, 
        data_emissao, 
        data_vencimento, 
        status, 
        tipo_receita, 
        id_conta_resultado
    )
    VALUES (
        -- Assumimos que o admin_id do cliente é o empresa_id
        (SELECT admin_id FROM public.tbl_clientes WHERE id = p_cliente_id), 
        p_cliente_id, 
        'Stripe Assinatura', 
        'Receita de Assinatura: ' || v_plano_nome, 
        v_plano_preco, 
        v_data_emissao, 
        v_data_vencimento, -- Usado para registro, mas o pagamento já ocorreu
        'recebido',        -- Marca como recebido
        'Assinatura',
        p_id_conta_resultado -- O ID da conta de resultado consultado na Edge Function
    );

    -- 4. Inserir uma Parcela de Recebimento (simplificado, pois o pagamento já ocorreu)
    -- NOTA: Isto assume que você tem uma coluna 'id' em tbl_admins (para a FK admin_id)
    INSERT INTO public.parcelas_contas_receber (
        conta_receber_id, 
        empresa_id,
        numero_parcela, 
        valor_parcela, 
        valor_pago,
        data_vencimento,
        data_pagamento,
        status
    )
    VALUES (
        (SELECT id FROM public.contas_receber WHERE cliente_id = p_cliente_id ORDER BY created_at DESC LIMIT 1),
        (SELECT admin_id FROM public.tbl_clientes WHERE id = p_cliente_id),
        1, 
        v_plano_preco, 
        v_plano_preco, 
        v_data_vencimento,
        CURRENT_DATE,
        'pago' 
    );
    
    -- 5. Opcional: Inserir o Registro de Recebimento (Baixa) na tabela `recebimentos`
    -- ... (Inserir aqui a lógica de inserção na tabela `recebimentos` se necessário)
    
END;
$function$

-- manual_subscription_renewal
CREATE OR REPLACE FUNCTION public.manual_subscription_renewal(p_cliente_id uuid, p_plano_id uuid, p_conta_pagar_id uuid, p_valor_pago numeric, p_forma_pagamento text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_plano_preco NUMERIC;
  v_plano_nome TEXT; -- NOVO: Para usar na descrição
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
  v_segundo_vencimento DATE; -- 60 dias para a segunda
  v_recorrencia_id UUID; -- ID da conta sintética de recorrência
  v_parcela_paga_id UUID; -- ID da parcela que está sendo paga
  v_conta_destino_id UUID; -- NOVO: ID da conta de destino (Stripe/Banco)
  
  -- Variáveis de Configuração Stripe
  v_conta_sintetica_stripe_id UUID; -- conta_sintetica_id
  v_historico_padrao_stripe_id UUID;       -- historico_padrao_id
  v_conta_resultado_stripe_id UUID; -- NOVO: id_conta_resultado do Stripe
  
  -- NOVAS VARIÁVEIS PARA MAPEAR CONTAS CONTÁBEIS
  v_conta_contabil_a_receber UUID;
  v_conta_contabil_parcela UUID;
  v_conta_contabil_recebimento UUID;
  v_conta_resultado_recebimento UUID; -- NOVO: Conta de Resultado (Receita)
  v_historico_padrao_recebimento UUID; -- NOVO: Histórico Padrão para Recebimentos
BEGIN
  -- 1. Verifica permissão (Apenas Admin ou o próprio Cliente pode executar)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso negado. Usuário não autenticado.';
  END IF;
  
  -- 2. Busca o ID do Admin (necessário para registrar o recebimento)
  SELECT admin_id INTO v_admin_id FROM public.tbl_clientes WHERE id = p_cliente_id;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin não encontrado para o cliente.';
  END IF;
  
  -- NOVO: 3. Busca o mapeamento contábil CR (Pode ser NULL, mas é usado nos lançamentos)
  SELECT conta_contabil_id INTO v_conta_contabil_a_receber FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'a_receber' LIMIT 1;
  SELECT conta_contabil_id INTO v_conta_contabil_parcela FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'parcela' LIMIT 1;
  SELECT conta_contabil_id INTO v_conta_contabil_recebimento FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'recebimento' LIMIT 1;
  SELECT conta_contabil_id INTO v_conta_resultado_recebimento FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'recebimento_resultado' LIMIT 1;
  
  -- NOVO: Busca Histórico Padrão de Recebimento (da tabela correta)
  SELECT historico_id INTO v_historico_padrao_recebimento FROM public.configuracao_historico_padrao WHERE proprietario_id = v_admin_id AND tipo_registro = 'recebimento_padrao' LIMIT 1;
  
  -- 4. Busca mapeamento Stripe (incluindo a conta de resultado)
  SELECT conta_sintetica_id, historico_padrao_id, id_conta_resultado INTO v_conta_sintetica_stripe_id, v_historico_padrao_stripe_id, v_conta_resultado_stripe_id FROM public.configuracoes_stripe WHERE proprietario_id = v_admin_id LIMIT 1;
  
  -- 5. VALIDAÇÃO CRÍTICA: Apenas as configurações do Stripe são obrigatórias
  IF v_conta_sintetica_stripe_id IS NULL OR v_historico_padrao_stripe_id IS NULL OR v_conta_resultado_stripe_id IS NULL THEN -- ADICIONADO v_conta_resultado_stripe_id
    RAISE EXCEPTION 'Configurações Stripe incompletas. Verifique: Conta Sintética Stripe, Histórico Padrão Stripe e Conta de Resultado Stripe.';
  END IF;

  -- 6. Busca a saldo_conta do Admin que referencia a conta sintética configurada no Stripe
  SELECT id INTO v_conta_destino_id 
  FROM public.saldo_contas 
  WHERE proprietario_id = v_admin_id AND conta_contabil_id = v_conta_sintetica_stripe_id
  LIMIT 1;
  
  IF v_conta_destino_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma conta de saldo (Stripe/Banco) encontrada para o Admin vinculada à conta contábil configurada no Stripe. Cadastre uma em Bancos/Caixas.';
  END IF;

  -- 7. Busca o preço, NOME e as PERMISSÕES do NOVO plano
  SELECT preco_mensal, nome, permissoes INTO v_plano_preco, v_plano_nome, v_plano_permissoes FROM public.planos WHERE id = p_plano_id;

  IF v_plano_preco IS NULL THEN
    RAISE EXCEPTION 'Plano não encontrado ou sem preço definido.';
  END IF;
  
  -- 8. Busca nome, email e data_fim_acesso atual do cliente
  SELECT nome, email, data_fim_acesso INTO v_cliente_nome, v_cliente_email, v_current_data_fim_acesso FROM public.tbl_clientes WHERE id = p_cliente_id;

  -- 9. Determina a data base para o cálculo de renovação (30 dias)
  v_base_date := v_start_of_today;
  
  -- Calcula a data de vencimento da PRÓXIMA MENSALIDADE (30 dias a partir da data base)
  v_proximo_vencimento := (date_trunc('day', v_base_date) + INTERVAL '30 days')::DATE;
  v_segundo_vencimento := (date_trunc('day', v_base_date) + INTERVAL '60 days')::DATE; -- 60 dias para a segunda
  
  -- A nova data de fim de acesso é o final do dia ANTERIOR ao próximo vencimento.
  v_new_data_fim_acesso := (v_proximo_vencimento::TIMESTAMP WITH TIME ZONE - INTERVAL '1 millisecond') AT TIME ZONE 'America/Sao_Paulo';

  -- 10. Atualiza o perfil do cliente com a nova data de acesso E PERMISSÕES
  UPDATE public.tbl_clientes
  SET 
    plano_id = p_plano_id,
    data_fim_acesso = v_new_data_fim_acesso,
    permissoes = v_plano_permissoes, -- APLICANDO AS PERMISSÕES DO NOVO PLANO
    aprovado = TRUE
  WHERE id = p_cliente_id;

  -- 11. BUSCA A CONTA SINTÉTICA DE RECORRÊNCIA
  SELECT id INTO v_recorrencia_id
  FROM public.admin_contas_receber
  WHERE cliente_id = p_cliente_id AND origem = 'assinatura_recorrente'
  LIMIT 1;

  IF v_recorrencia_id IS NULL THEN
    RAISE EXCEPTION 'Conta de recorrência não encontrada para o cliente %.', p_cliente_id;
  END IF;
  
  -- CORREÇÃO: Atualiza a descrição, o valor total e a conta contábil da conta sintética
  UPDATE public.admin_contas_receber
  SET
    descricao = 'Assinatura Recorrente - Plano ' || v_plano_nome, -- USANDO NOME DO PLANO
    valor_total = v_plano_preco, -- CORREÇÃO: Atualiza o valor total
    data_vencimento = v_proximo_vencimento, -- Atualiza o vencimento sintético para o próximo
    id_conta_patrimonial = v_conta_contabil_a_receber -- NOVO: Atualiza Conta Contábil
  WHERE id = v_recorrencia_id;
  
  -- 12. MARCA A PARCELA CORRESPONDENTE AO PAGAMENTO COMO PAGA
  UPDATE public.admin_parcelas_receber
  SET 
    status = 'paga',
    valor_pago = p_valor_pago,
    data_pagamento = v_data_hoje,
    id_conta_contabil = v_conta_contabil_parcela -- NOVO: Conta Contábil da Parcela
  WHERE id = p_conta_pagar_id -- p_conta_pagar_id agora é o ID da parcela
  RETURNING id INTO v_parcela_paga_id;

  -- 13. DELETA TODAS AS OUTRAS PARCELAS PENDENTES DE ASSINATURA ANTERIORES
  -- ESTA É A LÓGICA CRÍTICA: DELETA TODAS AS PARCELAS ABERTAS/PENDENTES (EXCETO A QUE ACABOU DE SER PAGA)
  DELETE FROM public.admin_parcelas_receber
  WHERE admin_id = v_admin_id
    AND conta_receber_id = v_recorrencia_id
    AND status IN ('aberta', 'reprogramada', 'parcial')
    AND id != v_parcela_paga_id; -- Não altera a parcela que acabou de ser paga

  -- 14. CRIA O REGISTRO DE RECEBIMENTO DO ADMIN (AGORA COM conta_id E id_conta_contabil)
  INSERT INTO public.admin_recebimentos (parcela_id, admin_id, cliente_id, valor_recebido, data_recebimento, tipo_recebimento, forma_pagamento, conta_id, id_conta_contabil, historico_id, id_conta_resultado)
  VALUES (
    v_parcela_paga_id,
    v_admin_id,
    p_cliente_id,
    p_valor_pago,
    NOW() AT TIME ZONE 'America/Sao_Paulo',
    'total',
    p_forma_pagamento, -- Usa a forma de pagamento fornecida
    v_conta_destino_id, -- ID da conta de destino (buscada via conta_sintetica_stripe_id)
    v_conta_contabil_recebimento, -- Conta Contábil do Recebimento (Patrimonial)
    v_historico_padrao_stripe_id,
    v_conta_resultado_stripe_id -- USANDO v_conta_resultado_stripe_id
  );
  
  -- NOVO: 14.1 CRIA O LANÇAMENTO DE ENTRADA NA CONTA DE SALDO (Stripe) - DÉBITO (Ativo)
  IF v_conta_sintetica_stripe_id IS NOT NULL THEN
    INSERT INTO public.lancamentos (proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id)
    VALUES (
      v_admin_id,
      NOW() AT TIME ZONE 'America/Sao_Paulo',
      'Recebimento Renovação Assinatura - Cliente ' || v_cliente_nome || ' (CR ID: ' || v_recorrencia_id::TEXT || ')', -- NOVO: Inclui ID da CR
      p_valor_pago,
      'Entrada',
      v_conta_destino_id, -- ID da saldo_contas (Stripe)
      v_conta_sintetica_stripe_id, -- ID da conta_contabil (Stripe)
      'assinatura_stripe',
      true, -- Pagamentos via Stripe já vêm conciliados
      v_historico_padrao_stripe_id -- NOVO: Histórico Padrão
    );
  END IF;
  
  -- NOVO: 14.2 CRIA O LANÇAMENTO DE RECEITA (DRE) - CRÉDITO (Resultado)
  -- CORREÇÃO CRÍTICA: Tipo deve ser 'Saida' para contas de Receita (Natureza Credora)
  IF v_conta_resultado_stripe_id IS NOT NULL THEN
    INSERT INTO public.lancamentos (proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id)
    VALUES (v_admin_id, v_data_hoje, 'Receita Renovação Assinatura - Plano ' || v_plano_nome || ' (CR ID: ' || v_recorrencia_id::TEXT || ')', p_valor_pago, 'Saida', NULL, v_conta_resultado_stripe_id, 'assinatura_stripe', true, v_historico_padrao_stripe_id); -- NOVO: Inclui ID da CR
  END IF;
  
  -- NOVO: 14.3 CRIA O LANÇAMENTO INICIAL DE DÉBITO (CR) - DÉBITO (Ativo)
  -- Este lançamento deve ser o valor total do plano, pois o valor total da conta sintética foi atualizado no passo 10.
  IF v_conta_contabil_a_receber IS NOT NULL THEN
    INSERT INTO public.lancamentos (proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id)
    VALUES (v_admin_id, v_data_hoje, 'Lançamento Inicial CR: Assinatura Recorrente (CR ID: ' || v_recorrencia_id::TEXT || ')', v_plano_preco, 'Entrada', NULL, v_conta_contabil_a_receber, 'assinatura_stripe', true, v_historico_padrao_stripe_id);
  END IF;
  
  -- NOVO: 14.4 CRIA O LANÇAMENTO DE ESTORNO PATRIMONIAL (CR) - CRÉDITO (Ativo)
  IF v_conta_contabil_a_receber IS NOT NULL THEN
    INSERT INTO public.lancamentos (proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id)
    VALUES (v_admin_id, v_data_hoje, 'Estorno Patrimonial CR - Renovação Assinatura (CR ID: ' || v_recorrencia_id::TEXT || ')', p_valor_pago, 'Saida', NULL, v_conta_contabil_a_receber, 'assinatura_stripe', true, v_historico_padrao_stripe_id); -- NOVO: Inclui ID da CR
  END IF;
  
  -- 15. CRIA AS PRÓXIMAS DUAS PARCELAS PENDENTES (30 e 60 dias)
  IF v_conta_contabil_parcela IS NOT NULL THEN
    -- Próxima Mensalidade (30 dias)
    INSERT INTO public.admin_parcelas_receber (conta_receber_id, admin_id, numero_parcela, valor_parcela, data_vencimento, status, id_conta_contabil)
    VALUES (
      v_recorrencia_id,
      v_admin_id,
      (SELECT COALESCE(MAX(numero_parcela), 1) + 1 FROM public.admin_parcelas_receber WHERE conta_receber_id = v_recorrencia_id), -- Próximo número de parcela
      v_plano_preco,
      v_proximo_vencimento,
      'aberta',
      v_conta_contabil_parcela -- NOVO: Conta Contábil da Parcela
    );
    
    -- Segunda Mensalidade (60 dias)
    INSERT INTO public.admin_parcelas_receber (conta_receber_id, admin_id, numero_parcela, valor_parcela, data_vencimento, status, id_conta_contabil)
    VALUES (
      v_recorrencia_id,
      v_admin_id,
      (SELECT COALESCE(MAX(numero_parcela), 1) + 1 FROM public.admin_parcelas_receber WHERE conta_receber_id = v_recorrencia_id), -- Próximo número de parcela
      v_plano_preco,
      v_segundo_vencimento,
      'aberta',
      v_conta_contabil_parcela -- NOVO: Conta Contábil da Parcela
    );
  END IF;

END;
$function$

-- delete_contract_and_reverse_accounting
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

  -- 3. Reverter Lançamentos Contábeis (Apenas se for Admin e as contas estiverem mapeadas)
  IF v_tabela_contas_receber = 'admin_contas_receber' AND v_conta_patrimonial_id IS NOT NULL AND v_conta_resultado_id IS NOT NULL THEN
    
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
    -- Usamos a descrição padronizada do PreencherContrato.tsx
    
    -- Lançamento Inicial CR (Débito no Ativo)
    DELETE FROM public.lancamentos
    WHERE proprietario_id = p_proprietario_id
      AND origem = 'lancamento_cr'
      AND descricao ILIKE ('Lançamento Inicial CR: Contrato: ' || v_descricao || ' (CR ID: ' || v_conta_receber_id::TEXT || ')%');

    -- Lançamento Receita (Crédito na Receita)
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
$function$

-- handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (
    new.id, 
    new.raw_user_meta_data ->> 'first_name', 
    new.raw_user_meta_data ->> 'last_name'
  );
  RETURN new;
END;
$$;
```

### 3. Policies (RLS)

| Policy Name | Table | Command | Using Clause |
| :--- | :--- | :--- | :--- |
| `tickets_access_policy` | `tickets` | `*` | `is_owner_or_admin_user(proprietario_id)` |
| `Users can view and update their own profile` | `tbl_usuarios` | `*` | `(auth.uid() = id)` |
| `plano_contas_access_policy` | `plano_contas` | `*` | `is_owner_or_admin_user(proprietario_id)` |
| `saldo_contas_access_policy` | `saldo_contas` | `*` | `is_owner_or_admin_user(proprietario_id)` |
| `Clientes can view and update their own profile` | `tbl_clientes` | `*` | `((auth.uid() = id) OR (admin_id = auth.uid()))` |
| `Admins can view and update their own profile` | `tbl_admins` | `*` | `(auth.uid() = id)` |
| `Admin Users can view and update their own profile` | `admin_usuarios` | `*` | `(auth.uid() = id)` |
| `Admin pode gerenciar seus usuarios` | `admin_usuarios` | `*` | `(admin_id = auth.uid())` |
| `Cliente/Admin ve registros de seus funcionarios` | `registros_ponto` | `*` | `((funcionario_id = auth.uid()) OR (empresa_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM tbl_clientes c WHERE ((c.id = registros_ponto.empresa_id) AND (c.admin_id = auth.uid())))))` |
| `Admin e funcionarios veem registros` | `admin_registros_ponto` | `*` | `((funcionario_id = auth.uid()) OR (admin_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM admin_usuarios au WHERE ((au.id = auth.uid()) AND (au.admin_id = admin_registros_ponto.admin_id)))))` |
| `ferias_access_policy` | `ferias` | `*` | `((funcionario_id = auth.uid()) OR (empresa_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM tbl_clientes c WHERE ((c.id = ferias.empresa_id) AND (c.admin_id = auth.uid())))))` |
| `admin_ferias_user_access_policy` | `admin_ferias_user` | `*` | `((funcionario_id = auth.uid()) OR (admin_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM admin_usuarios au WHERE ((au.id = auth.uid()) AND (au.admin_id = admin_ferias_user.admin_id)))))` |
| `Clientes podem gerenciar seus usuarios` | `tbl_usuarios` | `*` | `((cliente_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM tbl_clientes c WHERE ((c.id = tbl_usuarios.cliente_id) AND (c.admin_id = auth.uid())))))` |
| `lancamentos_access_policy` | `lancamentos` | `*` | `is_owner_or_admin_user(proprietario_id)` |
| `historicos_access_policy` | `historicos` | `*` | `is_owner_or_admin_user(proprietario_id)` |

### 4. Edge Functions (Deno)

| Function Name | Purpose |
| :--- | :--- |
| `manage-plano-contas` | Exclui e insere o Plano de Contas (Service Role) |
| `update-plano-contas-fks` | Atualiza FKs e flags booleanas após importação (Service Role) |
| `activate-subscription` | Ativa assinatura e registra faturamento inicial |
| `create-renewal-session` | Cria sessão de checkout Stripe para renovação |
| `get-admin-stripe-config` | Busca chaves Stripe secretas (Admin Only) |
| `get-stripe-session` | Busca metadados da sessão Stripe |
| `promote-client-direct` | Promove Cliente CR para Cliente Sistema (Admin Only) |
| `promote-client-to-system` | Promove Cliente CR para Cliente Sistema (Admin Only) |
| `send-signed-contract` | Simula envio de contrato assinado por email |
| `extract-comprovante-ocr` | Simula extração de dados de comprovantes (OCR) |