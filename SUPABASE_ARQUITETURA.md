# 🗄️ Arquitetura do Banco de Dados (Supabase/PostgreSQL)

## 1. Configuração de RLS (Row Level Security)

As políticas de RLS garantem a segregação de dados entre os clientes (multi-tenancy) e o acesso correto aos dados de faturamento.

| Tabela | Política Adicionada | Propósito |
| :--- | :--- | :--- |
| `public.contas_pagar` | `Empresas podem gerenciar suas contas a pagar` | Permite que Clientes e seus Usuários vejam suas próprias contas a pagar (`empresa_id = auth.uid()` ou `empresa_id = cliente_id`). |
| `public.admin_recebimentos` | `Clientes can view their own payments` | Permite que o Cliente logado veja os registros de recebimento do Admin onde ele é o pagador (`cliente_id = auth.uid()`). |

## 2. Integridade de Dados (Foreign Keys)

Chaves estrangeiras foram adicionadas nas tabelas de faturamento do Admin para garantir a integridade:

```sql
-- Exemplo de FKs para admin_contas_receber
ALTER TABLE public.admin_contas_receber ADD CONSTRAINT fk_cliente_id_cr FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;

-- Exemplo de FKs para admin_recebimentos
ALTER TABLE public.admin_recebimentos ADD CONSTRAINT fk_cliente_id_pagador FOREIGN KEY (cliente_id) REFERENCES public.tbl_clientes(id) ON DELETE RESTRICT;
```

## 3. Função RPC `activate_subscription` (Detalhe SQL)

Esta função é chamada após o pagamento e executa a lógica de faturamento e renovação:

1.  **Cálculo da Data:** `v_new_data_fim_acesso` é calculada para 30 dias à frente.
2.  **Atualização:** `UPDATE tbl_clientes SET plano_id = v_plano_id, data_fim_acesso = v_new_data_fim_acesso, ...`
3.  **Faturamento Admin:** `INSERT INTO admin_contas_receber (...) VALUES (..., 'Recebida', ...)`
4.  **Próxima Cobrança:** `INSERT INTO contas_pagar (...) VALUES (..., 'Pendente', data_vencimento = v_new_data_fim_acesso + 1 dia, ...)`