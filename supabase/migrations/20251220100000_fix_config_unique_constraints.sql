-- Migration to fix unique constraints on configuration tables for multi-tenancy.
-- This ensures that uniqueness of 'tipo_registro' is enforced per 'proprietario_id'.
-- Updated to be safely re-runnable.

BEGIN;

-- Drop old single-column unique constraints if they exist
ALTER TABLE public.configuracao_contas_pagar DROP CONSTRAINT IF EXISTS configuracao_contas_pagar_tipo_registro_key;
ALTER TABLE public.configuracao_contas_receber DROP CONSTRAINT IF EXISTS configuracao_contas_receber_tipo_registro_key;
ALTER TABLE public.configuracao_historico_padrao DROP CONSTRAINT IF EXISTS configuracao_historico_padrao_tipo_registro_key;

-- Drop new composite unique constraints if they exist (for re-runnability)
ALTER TABLE public.configuracao_contas_pagar DROP CONSTRAINT IF EXISTS configuracao_contas_pagar_proprietario_id_tipo_registro_key;
ALTER TABLE public.configuracao_contas_receber DROP CONSTRAINT IF EXISTS configuracao_contas_receber_proprietario_id_tipo_registro_key;
ALTER TABLE public.configuracao_historico_padrao DROP CONSTRAINT IF EXISTS configuracao_historico_padrao_proprietario_id_tipo_registro_key;

-- Add new composite unique constraints
ALTER TABLE public.configuracao_contas_pagar ADD CONSTRAINT configuracao_contas_pagar_proprietario_id_tipo_registro_key UNIQUE (proprietario_id, tipo_registro);
ALTER TABLE public.configuracao_contas_receber ADD CONSTRAINT configuracao_contas_receber_proprietario_id_tipo_registro_key UNIQUE (proprietario_id, tipo_registro);
ALTER TABLE public.configuracao_historico_padrao ADD CONSTRAINT configuracao_historico_padrao_proprietario_id_tipo_registro_key UNIQUE (proprietario_id, tipo_registro);

COMMIT;