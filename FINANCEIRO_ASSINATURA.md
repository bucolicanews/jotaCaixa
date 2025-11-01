# 💰 Módulo de Assinatura e Faturamento (Stripe)

Este módulo gerencia o ciclo de vida da assinatura, desde a adesão até o faturamento recorrente, utilizando o Stripe para processamento de pagamentos.

## Fluxo de Vendas e Checkout

*   **Página `/vendas`:** Permite a seleção de planos (PF/PJ) e inicia o período de Trial de 30 dias ou o checkout pago.
*   **Integração Stripe (Edge Function):** O componente `CheckoutPlano.tsx` chama a Edge Function `create-checkout-session` para gerar uma sessão de pagamento única.
*   **Pós-Pagamento (`src/App.tsx`):** O componente `PaymentSuccessHandler` intercepta o retorno do Stripe e chama o RPC `activate_subscription` para finalizar a transação.

## Ativação da Assinatura (RPC `activate_subscription`)

Esta função de banco de dados é crucial para a lógica de faturamento:

1.  **Cálculo de Renovação:** Define a `data_fim_acesso` do cliente para 30 dias a partir da data base (ajustada para UTC-3).
2.  **Atualização do Cliente:** Atualiza `tbl_clientes` com o novo `plano_id`, `data_fim_acesso` e `permissoes`.
3.  **Registro de Recebimento (Admin):** Cria um registro em `admin_recebimentos` (marcado como pago) para o período contratado.
4.  **Criação da Próxima Cobrança (Cliente):** Insere um registro `pendente` na tabela `contas_pagar` do cliente, com vencimento no dia seguinte à `data_fim_acesso`.

## Minha Assinatura (`/minha-assinatura`)

Esta página exibe o status atual da assinatura.

*   **Dados Exibidos:** Plano atual, próxima data de cobrança (obtida da `contas_pagar` pendente) e histórico de pagamentos (obtido de `admin_recebimentos` filtrado pelo `cliente_id`).