-- Migration: Corrigir foreign key duplicada em admin_contas_receber
-- Data: 2026-01-09
-- Descrição: Remove constraint fk_cliente_id_cr incorreta que referencia tabela 'clientes' inexistente

-- Remover constraint incorreta que aponta para public.clientes (tabela errada)
ALTER TABLE public.admin_contas_receber
DROP CONSTRAINT IF EXISTS fk_cliente_id_cr;

-- A constraint correta admin_contas_receber_cliente_id_fkey já existe
-- e aponta corretamente para public.tbl_clientes
-- Portanto não é necessário recriar, apenas remover a duplicada
