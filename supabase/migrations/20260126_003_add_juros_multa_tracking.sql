-- Migration: Adicionar campos de rastreamento de juros/multa e boleto
-- Data: 2026-01-26
-- Descrição: Campos para armazenar valores calculados e dados do boleto

-- Campos para rastrear valores calculados
ALTER TABLE admin_parcelas_receber 
ADD COLUMN IF NOT EXISTS valor_original DECIMAL(15,2);

ALTER TABLE admin_parcelas_receber 
ADD COLUMN IF NOT EXISTS valor_multa DECIMAL(15,2) DEFAULT 0;

ALTER TABLE admin_parcelas_receber 
ADD COLUMN IF NOT EXISTS valor_juros DECIMAL(15,2) DEFAULT 0;

ALTER TABLE admin_parcelas_receber 
ADD COLUMN IF NOT EXISTS dias_atraso INTEGER DEFAULT 0;

ALTER TABLE admin_parcelas_receber 
ADD COLUMN IF NOT EXISTS data_calculo_juros TIMESTAMPTZ;

ALTER TABLE admin_parcelas_receber 
ADD COLUMN IF NOT EXISTS pagbank_boleto_barcode TEXT;

ALTER TABLE admin_parcelas_receber 
ADD COLUMN IF NOT EXISTS pagbank_boleto_pdf TEXT;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_parcelas_vencimento_status 
ON admin_parcelas_receber(data_vencimento, status) 
WHERE status = 'pendente';

-- Comentários explicativos
COMMENT ON COLUMN admin_parcelas_receber.valor_original 
IS 'Valor original da parcela antes de juros e multa';

COMMENT ON COLUMN admin_parcelas_receber.valor_multa 
IS 'Valor da multa calculada (geralmente 2% sobre valor original)';

COMMENT ON COLUMN admin_parcelas_receber.valor_juros 
IS 'Valor dos juros calculados (geralmente 0,033% ao dia)';

COMMENT ON COLUMN admin_parcelas_receber.dias_atraso 
IS 'Quantidade de dias em atraso no momento do cálculo';

COMMENT ON COLUMN admin_parcelas_receber.data_calculo_juros 
IS 'Data/hora em que juros e multa foram calculados pela última vez';

COMMENT ON COLUMN admin_parcelas_receber.pagbank_boleto_barcode 
IS 'Código de barras do boleto gerado (44 dígitos numéricos)';

COMMENT ON COLUMN admin_parcelas_receber.pagbank_boleto_pdf 
IS 'URL do PDF do boleto gerado pelo PagBank';
