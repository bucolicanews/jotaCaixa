-- Adicionar campos para rastreamento de webhook e fallback
ALTER TABLE admin_parcelas_receber
ADD COLUMN IF NOT EXISTS webhook_processed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS webhook_retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS webhook_last_error TEXT,
ADD COLUMN IF NOT EXISTS last_check_at TIMESTAMPTZ;

-- Comentários
COMMENT ON COLUMN admin_parcelas_receber.webhook_processed_at IS 'Data/hora em que o webhook do PagBank processou esta parcela com sucesso';
COMMENT ON COLUMN admin_parcelas_receber.webhook_retry_count IS 'Número de tentativas de processar webhook que falharam';
COMMENT ON COLUMN admin_parcelas_receber.webhook_last_error IS 'Último erro ao processar webhook (para debugging)';
COMMENT ON COLUMN admin_parcelas_receber.last_check_at IS 'Última vez que o cron job verificou esta parcela no PagBank';

-- Criar índice para consultas de fallback
CREATE INDEX IF NOT EXISTS idx_parcelas_pending_pagbank 
ON admin_parcelas_receber(status, pagbank_checkout_id) 
WHERE status IN ('pendente', 'aguardando') AND pagbank_checkout_id IS NOT NULL;

-- Criar índice para monitoramento
CREATE INDEX IF NOT EXISTS idx_parcelas_webhook_retry 
ON admin_parcelas_receber(webhook_retry_count) 
WHERE webhook_retry_count > 0;
