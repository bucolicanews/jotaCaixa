-- Migration: Add pagbank_link_expira_em field to track PIX expiration
-- Created: 2026-01-27

ALTER TABLE public.admin_parcelas_receber
ADD COLUMN IF NOT EXISTS pagbank_link_expira_em TIMESTAMPTZ;

-- Index for querying expired payments
CREATE INDEX IF NOT EXISTS idx_admin_parcelas_receber_pagbank_expira_em 
ON public.admin_parcelas_receber(pagbank_link_expira_em) 
WHERE pagbank_link_expira_em IS NOT NULL;

-- Comment
COMMENT ON COLUMN public.admin_parcelas_receber.pagbank_link_expira_em IS 'Data/hora de expiração do PIX ou link de pagamento';
