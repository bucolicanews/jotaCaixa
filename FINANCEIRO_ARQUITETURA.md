# 💰 Módulo Financeiro e Contábil (Contas a Pagar, Receber, Lançamentos)

Este módulo é o coração do sistema de gestão financeira, utilizando o conceito de partidas dobradas (Débito/Crédito) na tabela `lancamentos` para calcular saldos e gerar relatórios (DRE e Balanço Patrimonial).

## 1. Tabelas Chave e Relações

| Tabela | Propósito | Proprietário | RLS |
| :--- | :--- | :--- | :--- |
| `plano_contas` | Estrutura contábil (Ativo, Passivo, Receita, Despesa). | Admin/Cliente | Proprietário/Usuário |
| `saldo_contas` | Contas de Caixa/Banco (Ativo Circulante). | Admin/Cliente | Proprietário/Usuário |
| `lancamentos` | Registro de todas as movimentações (Débito/Crédito). | Admin/Cliente | Proprietário/Usuário |
| `historicos` | Descrições padronizadas para lançamentos. | Admin/Cliente | Proprietário/Usuário |
| `admin_contas_receber` | Contas sintéticas a receber (Admin). | Admin | Admin/Cliente Pagador |
| `admin_parcelas_receber` | Parcelas analíticas a receber (Admin). | Admin | Admin/Cliente Pagador |
| `admin_recebimentos` | Histórico de recebimentos (Admin). | Admin | Admin/Cliente Pagador |
| `admin_contas_pagar` | Contas sintéticas a pagar (Admin). | Admin | Admin |
| `admin_parcelas_pagar` | Parcelas analíticas a pagar (Admin). | Admin | Admin |
| `admin_pagamentos` | Histórico de pagamentos (Admin). | Admin | Admin |

## 2. Lógica de Partidas Dobradas (`lancamentos`)

A tabela `lancamentos` usa a coluna `tipo` (`Entrada` ou `Saida`) para representar Débito ou Crédito, dependendo da natureza da conta (`plano_contas`).

| Natureza da Conta | Débito (Aumenta Saldo) | Crédito (Diminui Saldo) |
| :--- | :--- | :--- |
| **Devedora** (Ativo: 1.x.x) | `tipo: 'Entrada'` | `tipo: 'Saida'` |
| **Credora** (Passivo, PL, Resultado: 2.x.x, 3.x.x, 4.x.x, 5.x.x, 6.x.x) | `tipo: 'Entrada'` | `tipo: 'Saida'` |

### Fluxos Contábeis Críticos (Admin)

#### A. Criação de Contas a Receber (Contrato/Manual)

*   **D:** Clientes a Receber (Ativo - `id_conta_patrimonial` da CR) -> `tipo: 'Entrada'`
*   **C:** Receita de Contratos (Resultado - `id_conta_resultado` da CR) -> `tipo: 'Saida'`

#### B. Registro de Recebimento (Quitação de Parcela)

*   **D:** Caixa/Banco (Ativo - `conta_contabil_id` da `saldo_contas`) -> `tipo: 'Entrada'`
*   **C:** Clientes a Receber (Ativo - `id_conta_patrimonial` da CR) -> `tipo: 'Saida'`
*   **D/C:** Receita/Resultado (Se for pagamento de assinatura, a lógica é mais complexa e envolve a RPC `manual_subscription_renewal`).

#### C. Criação de Contas a Pagar (Manual)

*   **D:** Despesa/Custo (Resultado - `id_conta_resultado` da CP) -> `tipo: 'Entrada'`
*   **C:** Fornecedores a Pagar (Passivo - `id_conta_patrimonial` da CP) -> `tipo: 'Saida'`

#### D. Registro de Pagamento (Quitação de Parcela)

*   **D:** Fornecedores a Pagar (Passivo - `id_conta_patrimonial` da CP) -> `tipo: 'Entrada'`
*   **C:** Caixa/Banco (Ativo - `conta_contabil_id` da `saldo_contas`) -> `tipo: 'Saida'`

## 3. Funções RPC Críticas

| Função | Propósito | Status |
| :--- | :--- | :--- |
| `activate_subscription` | Ativa a assinatura inicial e gera faturamento (CR). | OK |
| `manual_subscription_renewal` | Processa a renovação paga e gera faturamento recorrente. | OK |
| `delete_contract_and_reverse_accounting` | Deleta contrato e gera estorno contábil (D: Receita, C: Ativo). | OK |
| `cancel_contract_installments` | Bloqueia contrato e cancela parcelas pendentes. | OK |
| `reactivate_contract_installments` | Reativa contrato e reabre parcelas. | OK |