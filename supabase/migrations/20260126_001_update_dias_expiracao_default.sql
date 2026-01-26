-- Migration: Atualizar default de dias_expiracao_link para 30 dias
-- Data: 2026-01-26
-- Descrição: Aumentar prazo padrão de expiração de links de pagamento de 7 para 30 dias

-- Atualizar default da coluna
ALTER TABLE public.configuracoes_pagbank 
ALTER COLUMN dias_expiracao_link SET DEFAULT 30;

-- Atualizar registros existentes que estão usando o default de 7 dias
UPDATE public.configuracoes_pagbank 
SET dias_expiracao_link = 30 
WHERE dias_expiracao_link = 7 OR dias_expiracao_link IS NULL;

-- Atualizar comentário
COMMENT ON COLUMN public.configuracoes_pagbank.dias_expiracao_link 
IS 'Número de dias que o link de pagamento fica válido (padrão: 30 dias, mínimo: 1, máximo: 365)';
