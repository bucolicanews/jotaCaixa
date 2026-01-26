-- Migration: Adicionar configurações de juros e multa
-- Data: 2026-01-26
-- Descrição: Permite configurar percentuais de juros e multa por proprietário

-- Adicionar configurações de juros e multa
ALTER TABLE configuracoes_pagbank 
ADD COLUMN IF NOT EXISTS percentual_multa DECIMAL(5,2) DEFAULT 2.00;

ALTER TABLE configuracoes_pagbank 
ADD COLUMN IF NOT EXISTS percentual_juros_mes DECIMAL(5,2) DEFAULT 1.00;

ALTER TABLE configuracoes_pagbank 
ADD COLUMN IF NOT EXISTS aplica_juros_multa BOOLEAN DEFAULT true;

-- Comentários explicativos
COMMENT ON COLUMN configuracoes_pagbank.percentual_multa 
IS 'Percentual de multa aplicado em caso de atraso (padrão: 2%)';

COMMENT ON COLUMN configuracoes_pagbank.percentual_juros_mes 
IS 'Percentual de juros ao mês aplicado em caso de atraso (padrão: 1% = 0,033% ao dia)';

COMMENT ON COLUMN configuracoes_pagbank.aplica_juros_multa 
IS 'Se true, aplica juros e multa automaticamente em parcelas atrasadas';
