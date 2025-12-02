# 💰 Módulo de Assinatura e Faturamento

Este módulo gerencia o ciclo de vida da assinatura, desde a adesão até o faturamento recorrente, utilizando o Stripe para processamento de pagamentos.

## Fluxo de Vendas e Checkout

*   **Página `/vendas`:** Permite a seleção de planos (PF/PJ) e inicia o Trial de 7 ou 30 dias ou o checkout pago.
*   **Edge Function `create-checkout-session`:** Gera uma sessão de pagamento única no Stripe, usando a chave secreta do Admin (proprietário do faturamento).
*   **Pós-Pagamento (Adesão - `PaymentSuccessHandler`):** Intercepta o retorno do Stripe e chama o RPC `activate_subscription` para finalizar a transação.
*   **Pós-Pagamento (Renovação - `PaymentRenewalHandler`):** Intercepta o retorno do Stripe e chama o RPC `manual_subscription_renewal` para quitar a parcela pendente e estender o acesso.

## Funções RPC de Faturamento

### 1. `activate_subscription(p_cliente_id, p_plano_id)`

Chamada após a **adesão inicial** (checkout Stripe).

1.  **Cálculo de Acesso:** Define a `data_fim_acesso` do cliente para 30 dias à frente.
2.  **Atualização do Cliente:** Atualiza `tbl_clientes` com `plano_id`, `data_fim_acesso` e `permissoes`.
3.  **Registro de Faturamento (Admin):** Cria a conta sintética `admin_contas_receber` (origem: `assinatura_recorrente`) e a primeira parcela (Nº 1) marcada como `paga`.
4.  **Lançamento de Caixa:** Cria um registro de `Entrada` na tabela `lancamentos` do Admin, vinculado à conta de saldo Stripe.
5.  **Próximas Cobranças:** Cria as próximas duas parcelas (Nº 2 e Nº 3) como `aberta` (pendente).

### 2. `manual_subscription_renewal(p_cliente_id, p_plano_id, p_conta_pagar_id, p_valor_pago, p_forma_pagamento)`

Chamada após a **renovação** (checkout Stripe ou pagamento manual).

1.  **Quitação da Parcela:** Marca a `admin_parcelas_receber` (ID = `p_conta_pagar_id`) como `paga`.
2.  **Atualização do Cliente:** Atualiza `tbl_clientes` com o novo `plano_id` e estende a `data_fim_acesso` por 30 dias.
3.  **Lançamento de Caixa:** Cria um registro de `Entrada` na tabela `lancamentos` do Admin.
4.  **Geração de Próximas Parcelas:** Cria as duas próximas parcelas pendentes.

## Minha Assinatura (`/minha-assinatura`)

Esta página exibe o status atual da assinatura, a próxima cobrança pendente (obtida da `admin_parcelas_receber` com status `aberta`) e o histórico de pagamentos (`admin_recebimentos`).