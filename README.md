# Fluxo de Caixa - Sistema de Gestão Financeira (v2.0)

# PROXIMO PASSO

- VERIFICAR CONTAS  APAGAR

Este é um sistema de gestão financeira e RH multi-inquilino (multi-tenant) construído com React, TypeScript e Supabase.

## 🚀 Novas Funcionalidades e Módulos

A versão 2.0 introduz módulos robustos de RH e Contratos, além de um fluxo completo de vendas e gestão de assinaturas via Stripe.

### 1. Módulo de Assinatura e Faturamento (Stripe)

Implementação completa do ciclo de vida da assinatura, desde a adesão até o faturamento recorrente.

*   **Fluxo de Vendas (`/vendas`):** Permite a adesão a planos (PF/PJ) e inicia o Trial de 30 dias.
*   **Checkout Stripe (Edge Function):** Utiliza a função `create-checkout-session` para gerar sessões de pagamento único (Edge Function) e registrar o pagamento inicial.
*   **Ativação de Assinatura (RPC `activate_subscription`):** Função de banco de dados que, após o pagamento, atualiza o `plano_id` e a `data_fim_acesso` do cliente (30 dias de renovação) e gera os registros de faturamento do Admin.
*   **Minha Assinatura (`/minha-assinatura`):** Exibe o plano atual, a próxima data de cobrança (vencimento da `contas_pagar`) e o histórico de pagamentos.

### 2. Módulo de Ponto Eletrônico e Folha de Ponto

Sistema completo para registro de ponto por funcionários e acompanhamento por gestores.

*   **Registro de Ponto (`/ponto-eletronico`):** Permite que o usuário (Funcionário) registre Entrada/Saída com captura de selfie e geolocalização.
*   **Folha de Ponto (`/folha-ponto`):** Interface de gestão para Clientes/Admin, permitindo:
    *   Visualização detalhada da jornada mensal (horas trabalhadas, saldo, horas extras).
    *   Ajuste manual de registros de Entrada/Saída.
    *   Gerenciamento de Faltas (Justificadas/Injustificadas) e Abonos (4h, 6h, 8h).
    *   Gestão de Folgas Trabalhadas (Compensação ou Pagamento Extra 100%).
    *   Impressão da Folha de Ponto.

### 3. Módulo de Contratos

Criação, gestão e preenchimento de contratos dinâmicos.

*   **Gerenciamento de Tags (`/contratos/tags`):** Criação de tags dinâmicas customizadas.
*   **Gerenciamento de Modelos (`/contratos/modelos`):** Criação e importação de templates de contrato (HTML ou Texto Simples).
*   **Geração de Contrato (`/contratos/preencher/:modeloId`):** Fluxo para selecionar um cliente, preencher tags customizadas e dados financeiros (valor, parcelamento), renderizar o contrato e gerar as Contas a Receber correspondentes.

---

## 🗄️ Arquitetura do Banco de Dados (Supabase/PostgreSQL)

### 1. Configuração de RLS e Permissões

Foram adicionadas políticas de RLS cruciais para garantir que os Clientes possam acessar seus próprios dados financeiros e de RH, mas não os dados de outros clientes ou os dados de faturamento do Admin.

| Tabela | Política Adicionada | Propósito |
| :--- | :--- | :--- |
| `public.contas_pagar` | `Empresas podem gerenciar suas contas a pagar` | Permite que Clientes (`empresa_id = auth.uid()`) e seus Usuários (`empresa_id = cliente_id`) vejam suas próprias contas a pagar. |
| `public.admin_recebimentos` | `Clientes can view their own payments` | Permite que o Cliente logado veja os registros de recebimento do Admin onde ele é o pagador (`cliente_id = auth.uid()`). |
| `public.tbl_admins` | `Allow read access for authenticated users` | Permite que qualquer usuário autenticado leia a tabela `tbl_admins` (necessário para o `SessionContext` determinar a role). |

### 2. Integridade de Dados (Foreign Keys)

Foram adicionadas chaves estrangeiras nas tabelas de faturamento do Admin para garantir a integridade dos dados:

```sql
-- FKs para admin_contas_receber
ALTER TABLE public.admin_contas_receber ADD CONSTRAINT fk_admin_id FOREIGN KEY (admin_id) REFERENCES public.tbl_admins(id) ON DELETE CASCADE;
ALTER TABLE public.admin_contas_receber ADD CONSTRAINT fk_cliente_id_cr FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;

-- FKs para admin_recebimentos
ALTER TABLE public.admin_recebimentos ADD CONSTRAINT fk_admin_id_recebimento FOREIGN KEY (admin_id) REFERENCES public.tbl_admins(id) ON DELETE CASCADE;
ALTER TABLE public.admin_recebimentos ADD CONSTRAINT fk_cliente_id_pagador FOREIGN KEY (cliente_id) REFERENCES public.tbl_clientes(id) ON DELETE RESTRICT;
```

### 3. Função RPC `activate_subscription` (Faturamento)

Esta função é o coração do fluxo de pagamento. Ela é chamada após o checkout bem-sucedido e executa a lógica de renovação de 30 dias e faturamento:

1.  **Calcula a `v_new_data_fim_acesso`:** Define a nova data de expiração do acesso (30 dias a partir da data base, ajustada para o final do dia).
2.  **Atualiza `tbl_clientes`:** Define o novo `plano_id`, `data_fim_acesso` e `permissoes`.
3.  **Registra o Faturamento do Admin:** Cria um registro de Conta a Receber (`admin_contas_receber`) marcado como `recebida` (paga), com a `data_vencimento` refletindo o período de acesso contratado.
4.  **Cria a Próxima Cobrança do Cliente:** Insere um registro `pendente` na tabela `contas_pagar` do cliente, com a `data_vencimento` sendo o dia seguinte à `data_fim_acesso`.

---

## 💻 Implementação Frontend e Integrações

### 1. `src/App.tsx` (Payment Success Handler)

O componente `PaymentSuccessHandler` intercepta os parâmetros de URL (`payment=success&session_id=...`) após o retorno do Stripe e chama o RPC `activate_subscription` para finalizar a transação e atualizar o perfil do usuário.

### 2. `src/hooks/use-sessao.ts` (Fluxo de Auth)

A lógica de autenticação foi aprimorada para priorizar o evento `PASSWORD_RECOVERY`, garantindo que o usuário seja redirecionado para `/atualizar-senha` em vez de ser logado automaticamente no painel.

### 3. Componentes Chave

*   **`src/components/CheckoutPlano.tsx`:** Gerencia a coleta de dados de adesão e a chamada para a Edge Function do Stripe.
*   **`src/components/LayoutPrincipal.tsx`:** Implementa a lógica de bloqueio de acesso (`isAccessExpired` / `isAccessBlocked`) e exibe o `TrialBanner` e o `TrialButton` conforme o status do cliente.
*   **`src/components/FormUsuario.tsx` / `src/components/FormCliente.tsx`:** Formulários de perfil que agora incluem campos de RH (salário, jornada, folgas) e a integração com o `useTagManager` para criar tags de contrato automaticamente.
*   **`src/hooks/use-tag-manager.ts`:** Hook responsável por verificar e alternar a presença de tags de contrato na tabela `contrato_tags` com base nos campos do perfil do Cliente/Usuário.