-- Migration: Adicionar colunas PagBank em admin_parcelas_receber
-- Data: 2026-01-08
-- Descrição: Armazena informações de cobranças PagBank vinculadas às parcelas a receber

ALTER TABLE public.admin_parcelas_receber
ADD COLUMN IF NOT EXISTS pagbank_charge_id TEXT,
ADD COLUMN IF NOT EXISTS pagbank_payment_link TEXT,
ADD COLUMN IF NOT EXISTS pagbank_payment_method TEXT CHECK (pagbank_payment_method IN ('pix', 'boleto', 'credit_card', NULL)),
ADD COLUMN IF NOT EXISTS pagbank_status TEXT CHECK (pagbank_status IN ('WAITING', 'PAID', 'DECLINED', 'CANCELED', 'EXPIRED', NULL)),
ADD COLUMN IF NOT EXISTS pagbank_qr_code TEXT,
ADD COLUMN IF NOT EXISTS pagbank_qr_code_text TEXT,
ADD COLUMN IF NOT EXISTS pagbank_boleto_barcode TEXT,
ADD COLUMN IF NOT EXISTS pagbank_boleto_pdf_url TEXT,
ADD COLUMN IF NOT EXISTS pagbank_updated_at TIMESTAMPTZ;

-- Índices para melhorar performance de consultas
CREATE INDEX IF NOT EXISTS idx_admin_parcelas_receber_pagbank_charge_id 
ON public.admin_parcelas_receber(pagbank_charge_id) 
WHERE pagbank_charge_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_parcelas_receber_pagbank_status 
ON public.admin_parcelas_receber(pagbank_status) 
WHERE pagbank_status IS NOT NULL;

-- Comentários
COMMENT ON COLUMN public.admin_parcelas_receber.pagbank_charge_id IS 'ID da cobrança criada no PagBank';
COMMENT ON COLUMN public.admin_parcelas_receber.pagbank_payment_link IS 'URL do link de pagamento gerado pelo PagBank';
COMMENT ON COLUMN public.admin_parcelas_receber.pagbank_payment_method IS 'Método de pagamento: pix, boleto ou credit_card';
COMMENT ON COLUMN public.admin_parcelas_receber.pagbank_status IS 'Status da cobrança no PagBank';
COMMENT ON COLUMN public.admin_parcelas_receber.pagbank_qr_code IS 'QR Code PIX em base64';
COMMENT ON COLUMN public.admin_parcelas_receber.pagbank_qr_code_text IS 'Código PIX Copia e Cola';
COMMENT ON COLUMN public.admin_parcelas_receber.pagbank_boleto_barcode IS 'Código de barras do boleto';
COMMENT ON COLUMN public.admin_parcelas_receber.pagbank_boleto_pdf_url IS 'URL do PDF do boleto';
COMMENT ON COLUMN public.admin_parcelas_receber.pagbank_updated_at IS 'Última atualização de status do PagBank';
