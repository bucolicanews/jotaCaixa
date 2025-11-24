# Fluxo de Caixa - Sistema de Gestão Financeira (v2.0)

# PROXIMO PASSO

- VERIFICAR CONTAS APAGAR

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

### 4. Módulo de Documentos Societários (NOVO)

Criação e gestão de documentos internos (Atas, Contratos Sociais, etc.) usando modelos e blocos de conteúdo reutilizáveis.

*   **Gerenciar Blocos (`/documentos-societarios/blocos`):** Criação de blocos de texto reutilizáveis.
*   **Gerenciar Modelos (`/documentos-societarios/modelos`):** Criação de templates de documentos com tags dinâmicas.
*   **Documentos Gerados (`/documentos-societarios`):** Lista e gerencia documentos finalizados.

### 5. Módulo de Bancos / Caixas (`/bancos`)

*   **Cálculo de Saldo Dinâmico:** O saldo atual de cada conta (`saldo_contas`) é calculado em tempo real, somando o `saldo_inicial` com todas as `Entradas` e subtraindo todas as `Saídas` registradas na tabela `lancamentos`.
*   **Contas Patrimoniais (`/contas-patrimoniais`):** Novo módulo para gerenciar contas de Ativo/Passivo/PL que não são contas de caixa/banco, mas que recebem lançamentos contábeis.
*   **Integração com CR/CP:** O registro de recebimentos/pagamentos gera automaticamente lançamentos de `Entrada`/`Saída` na conta de destino selecionada, garantindo a apuração correta do saldo.

---

## 🗄️ Arquitetura do Banco de Dados (Supabase/PostgreSQL)

### 1. Configuração de RLS e Permissões

Foram adicionadas políticas de RLS cruciais para garantir que os Clientes possam acessar seus próprios dados financeiros e de RH, mas não os dados de outros clientes ou os dados de faturamento do Admin.

### 2. Fluxo Contábil (Partidas Dobradas)

Todas as movimentações financeiras (recebimentos, pagamentos, conciliação) geram registros na tabela `lancamentos` para permitir o cálculo de saldo e a geração de relatórios (DRE/Balanço).

**Novas Regras Contábeis Implementadas:**

*   **Contas a Receber (CR):** A criação de um CR gera **DÉBITO** no Ativo (Clientes a Receber) e **CRÉDITO** na Receita (Resultado).
*   **Recebimento de CR:** O recebimento gera **DÉBITO** no Ativo (Caixa/Banco) e **CRÉDITO** no Ativo (Clientes a Receber - Estorno Patrimonial).
*   **Contas a Pagar (CP):** A criação de um CP gera **DÉBITO** na Despesa/Custo (Resultado) e **CRÉDITO** no Passivo (Obrigação a Pagar).
*   **Pagamento de CP:** O pagamento gera **DÉBITO** no Passivo (Obrigação a Pagar - Estorno Patrimonial) e **CRÉDITO** no Ativo (Caixa/Banco).

### 3. Funções RPC e Edge Functions

| Função | Propósito | Status |
| :--- | :--- | :--- |
| `activate_subscription` | Ativa a assinatura inicial e gera faturamento (CR). | OK |
| `manual_subscription_renewal` | Processa a renovação paga e gera faturamento recorrente. | OK |
| `delete_contract_and_reverse_accounting` | Deleta contrato e gera estorno contábil (D: Receita, C: Ativo). | OK |
| `cancel_contract_installments` | Bloqueia contrato e cancela parcelas pendentes. | OK |
| `reactivate_contract_installments` | Reativa contrato e reabre parcelas. | OK |
| `create-user-admin` (Edge) | Cria usuários (Funcionários/Clientes) usando a Service Role Key. | OK |
| `manage-plano-contas` (Edge) | Limpa e insere o novo Plano de Contas em massa. | OK |
| `update-plano-contas-fks` (Edge) | Atualiza todas as referências de FKs após a importação do Plano de Contas. | OK |

---

## 💻 Implementação Frontend e Integrações

### 1. Fluxo de Faturamento e Pagamento

*   **`PaymentSuccessHandler` / `PaymentRenewalHandler`:** Lidam com o retorno do Stripe, chamando as RPCs de ativação/renovação e garantindo que o `id_conta_resultado` (Receita) seja passado para o lançamento contábil correto.
*   **`CheckoutPlano.tsx`:** Lógica de checkout unificada para adesão e renovação, garantindo que o `plano_id` e as `permissoes` sejam atualizados no perfil do cliente antes do pagamento.

### 2. Contabilidade e Relatórios

*   **`useContabilConfig`:** Novo hook para buscar o mapeamento de códigos de nível 1 (Ativo=1, Receita=4, etc.) definido pelo Admin, garantindo que os relatórios (DRE/Balanço) e lançamentos usem a estrutura correta.
*   **`useBalancoPatrimonial` / `useDRE`:** Hooks de cálculo que utilizam a tabela `lancamentos` e o `configMap` para gerar relatórios dinâmicos.
*   **`ExportarLancamentos.tsx`:** Exporta lançamentos no formato de partidas dobradas (Débito/Crédito) para sistemas contábeis (ex: Calima), com validação de mapeamento de contas e históricos.

### 3. Formulários e Componentes

*   **`FormContasReceber` / `FormContasPagar`:** Formulários atualizados para incluir a seleção de `conta_patrimonial_id` e `historico_id`, garantindo que cada lançamento sintético tenha o vínculo contábil necessário para o Balanço Patrimonial.
*   **`DetalhesLancamentosDialog`:** Permite visualizar o extrato detalhado de qualquer conta de saldo ou conta patrimonial, com a opção de exclusão de lançamentos.