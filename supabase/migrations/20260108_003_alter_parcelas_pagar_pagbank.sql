-- Migration: Adicionar colunas PagBank em admin_parcelas_pagar
-- Data: 2026-01-08
-- Descrição: Armazena informações de transferências PagBank vinculadas às parcelas a pagar

ALTER TABLE public.admin_parcelas_pagar
ADD COLUMN IF NOT EXISTS pagbank_transfer_id TEXT,
ADD COLUMN IF NOT EXISTS pagbank_status TEXT CHECK (pagbank_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELED', NULL)),
ADD COLUMN IF NOT EXISTS pagbank_updated_at TIMESTAMPTZ;

-- Índices
CREATE INDEX IF NOT EXISTS idx_admin_parcelas_pagar_pagbank_transfer_id 
ON public.admin_parcelas_pagar(pagbank_transfer_id) 
WHERE pagbank_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_parcelas_pagar_pagbank_status 
ON public.admin_parcelas_pagar(pagbank_status) 
WHERE pagbank_status IS NOT NULL;

-- Comentários
COMMENT ON COLUMN public.admin_parcelas_pagar.pagbank_transfer_id IS 'ID da transferência criada no PagBank';
COMMENT ON COLUMN public.admin_parcelas_pagar.pagbank_status IS 'Status da transferência no PagBank';
COMMENT ON COLUMN public.admin_parcelas_pagar.pagbank_updated_at IS 'Última atualização de status do PagBank';
