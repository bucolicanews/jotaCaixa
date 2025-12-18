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
- [Arquitetura de Acesso e RLS](#️-arquitetura-de-acesso-e-rls-pós-correção-de-recursão)

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
4. As políticas de RLS (Row Level Security) são cruciais. Após qualquer restauração de banco, garanta que a arquitetura de RLS não-recursiva está implantada. Consulte a seção de arquitetura de RLS para mais detalhes.
5. Teste rodando `SELECT * FROM admin_usuarios WHERE id = '<admin_usuario_id>'` e confirme `admin_id`
6. Faça logout/login no app após qualquer alteração de RLS para que o JWT do usuário receba as novas permissões.

### 8. Supabase + Stripe
- Supabase Auth com RLS garante que cada tenant só veja seus dados.
- A segurança é garantida por políticas de RLS (Row Level Security) em nível de banco de dados.
- Integrações com Stripe usam as edge functions `create-checkout-session`, `create-renewal-session` e `get-stripe-session` para acesso seguro.

## Visão geral do sistema
- **Admin:** Gerencia clientes, contratos, finanças e suporte via tabelas `admin_*`.  
- **Clientes (tbl_clientes):** Possuem seus próprios cadastros, lançamentos, contratos e relatórios.  
- **Funcionários (`tbl_usuarios` ou `admin_usuarios`):** Herdam permissões configuradas no plano/perfil e acessam apenas o `ownerId` vinculado (cliente ou admin).  
- **Fluxos-chave:** lançamentos contábeis, contratos com tags dinâmicas, conciliações automáticas, folha de ponto, relatórios (balanço, DRE, razão, balancete).  
- **Hooks reutilizáveis:** `useOwner`, `useConciliacao`, `useContasReceber`, `useBalancete`, `useRazao` e demais encapsulam lógica de tenant, RLS e fetchs Supabase.

## RLS e controle de acesso
O sistema utiliza uma arquitetura de Row Level Security (RLS) robusta e não-recursiva para garantir o isolamento de dados entre tenants (multi-tenant).

**Para detalhes técnicos sobre a implementação, consulte a seção: [🏛️ Arquitetura de Acesso e RLS (Pós-Correção de Recursão)](#️-arquitetura-de-acesso-e-rls-pós-correção-de-recursão).**

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

## 🏛️ Arquitetura de Acesso e RLS (Pós-Correção de Recursão)

Esta seção documenta o ponto de partida definitivo para o controle de acesso no sistema, implementado para resolver erros críticos de "infinite recursion" no PostgreSQL. A arquitetura anterior foi descontinuada.

### O Problema (Depreciado)

As políticas de RLS (Row Level Security) originais causavam recursão infinita porque uma política em uma tabela (ex: `tbl_usuarios`) executava uma subconsulta (`SELECT ... FROM tbl_clientes`) em outra tabela que também possuía uma política de RLS, criando um loop de verificação que impedia o acesso aos dados e gerava erros no banco de dados.

### A Solução Definitiva: Acesso Não-Recursivo

A nova arquitetura elimina completamente a recursão, garantindo performance e estabilidade. Ela se baseia em três pilares:

#### 1. Tabela de Mapeamento `admin_user_lookup`

Foi criada uma tabela auxiliar, `public.admin_user_lookup`, com o RLS **desabilitado**. Sua única função é manter um mapeamento direto entre o `id` de um usuário (`admin_usuarios`) e seu respectivo `admin_id`.

```sql
CREATE TABLE IF NOT EXISTS public.admin_user_lookup (
  id uuid PRIMARY KEY,
  admin_id uuid NOT NULL
);
```

#### 2. Gatilho de Sincronização Automática

Um gatilho (`trg_admin_usuarios_lookup_aiu` e `trg_admin_usuarios_lookup_ad`) na tabela `admin_usuarios` garante que a tabela `admin_user_lookup` seja **automaticamente atualizada** em qualquer operação de `INSERT`, `UPDATE` ou `DELETE`. Isso mantém o mapeamento sempre consistente sem intervenção manual.

```sql
CREATE OR REPLACE FUNCTION public.sync_admin_user_lookup()
RETURNS trigger LANGUAGE plpgsql AS $$
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
```

#### 3. Função Segura `get_admin_id_for_current_user()`

Esta é a peça central da solução. A função `get_admin_id_for_current_user` busca o `admin_id` do usuário logado diretamente da tabela `admin_user_lookup`, mas com três propriedades críticas que evitam a recursão:

- **`SECURITY DEFINER`**: Executa com os privilégios do usuário que a *criou*, não de quem a *chama*.
- **`SET LOCAL row_security = off`**: Desliga temporariamente o RLS **apenas durante a execução desta função**, permitindo a leitura da tabela de lookup sem disparar outras políticas.
- **`VOLATILE`**: Indica ao Postgres que a função tem efeitos colaterais (como `SET LOCAL`) e não pode ser otimizada de forma agressiva.

```sql
CREATE OR REPLACE FUNCTION public.get_admin_id_for_current_user()
  RETURNS uuid
  LANGUAGE plpgsql
  VOLATILE -- Essencial por causa do SET LOCAL
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

### Novo Padrão de Políticas (Exemplo)

Com a função auxiliar, as políticas de RLS se tornaram simples, legíveis e não-recursivas. Elas apenas comparam IDs diretamente ou usam o resultado da função segura.

**Exemplo para `saldo_contas`:**
```sql
-- Acesso permitido se o usuário logado é o dono do registro
-- OU se o admin_id do usuário logado (retornado pela função segura) é o dono do registro.
CREATE POLICY saldo_contas_select_policy ON public.saldo_contas
FOR SELECT USING (
  proprietario_id = auth.uid()
  OR public.get_admin_id_for_current_user() = public.saldo_contas.proprietario_id
);
```
Este padrão foi aplicado a todas as tabelas críticas (`tbl_clientes`, `tbl_usuarios`, `saldo_contas`, `plano_contas`, `lancamentos`, `registros_ponto`, etc.), resolvendo permanentemente os problemas de acesso e garantindo a estabilidade do sistema. **Quaisquer novas políticas devem seguir estritamente este modelo.**

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

### 2. Funções de Banco de Dados (RPCs e Triggers)

| Function Name | Language | Arguments | Purpose |
| :--- | :--- | :--- | :--- |
| `is_owner_or_admin_user` | `sql` | `owner_id uuid` | Verifica se o usuário é o proprietário ou um administrador delegado. |
| `update_updated_at_column` | `plpgsql` | N/A | Função de trigger para atualizar a coluna `updated_at` automaticamente. |
| `activate_subscription` | `plpgsql` | `p_cliente_id uuid, p_plano_id uuid, p_id_conta_resultado uuid` | Ativa a assinatura, atualiza o perfil do cliente e registra o faturamento inicial. |
| `manual_subscription_renewal` | `plpgsql` | `p_cliente_id uuid, p_plano_id uuid, p_conta_pagar_id uuid, p_valor_pago numeric, p_forma_pagamento text` | Renova a assinatura, quita a parcela pendente e gera as próximas parcelas/lançamentos contábeis. |
| `delete_contract_and_reverse_accounting` | `plpgsql` | `p_contrato_id uuid, p_proprietario_id uuid` | Deleta o contrato, verifica parcelas pagas e reverte os lançamentos contábeis associados. |

### 3. Políticas de Segurança (RLS)

| Policy Name | Table | Command | Using Clause (Resumo) |
| :--- | :--- | :--- | :--- |
| `tickets_access_policy` | `tickets` | `*` | Acesso se for proprietário ou admin delegado. |
| `Users can view and update their own profile` | `tbl_usuarios` | `*` | Acesso se `auth.uid() = id`. |
| `plano_contas_access_policy` | `plano_contas` | `*` | Acesso se for proprietário ou admin delegado. |
| `saldo_contas_access_policy` | `saldo_contas` | `*` | Acesso se for proprietário ou admin delegado. |
| `Clientes can view and update their own profile` | `tbl_clientes` | `*` | Acesso se for o próprio cliente ou o admin. |
| `Admins can view and update their own profile` | `tbl_admins` | `*` | Acesso se `auth.uid() = id`. |
| `Admin Users can view and update their own profile` | `admin_usuarios` | `*` | Acesso se `auth.uid() = id`. |
| `Admin pode gerenciar seus usuarios` | `admin_usuarios` | `*` | Acesso se `admin_id = auth.uid()`. |
| `Cliente/Admin ve registros de seus funcionarios` | `registros_ponto` | `*` | Acesso se for o funcionário, a empresa ou o admin da empresa. |
| `Admin e funcionarios veem registros` | `admin_registros_ponto` | `*` | Acesso se for o funcionário, o admin ou o funcionário do admin. |
| `ferias_access_policy` | `ferias` | `*` | Acesso se for o funcionário, a empresa ou o admin da empresa. |
| `admin_ferias_user_access_policy` | `admin_ferias_user` | `*` | Acesso se for o funcionário, o admin ou o funcionário do admin. |
| `Clientes podem gerenciar seus usuarios` | `tbl_usuarios` | `*` | Acesso se for o cliente ou o admin do cliente. |
| `lancamentos_access_policy` | `lancamentos` | `*` | Acesso se for proprietário ou admin delegado. |
| `historicos_access_policy` | `historicos` | `*` | Acesso se for proprietário ou admin delegado. |

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
