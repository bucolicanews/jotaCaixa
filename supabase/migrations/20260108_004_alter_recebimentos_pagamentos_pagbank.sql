-- Migration: Adicionar colunas PagBank em admin_recebimentos e admin_pagamentos
-- Data: 2026-01-08
-- Descrição: Armazena informações de taxas e valores líquidos de transações PagBank

-- Tabela: admin_recebimentos
ALTER TABLE public.admin_recebimentos
ADD COLUMN IF NOT EXISTS pagbank_charge_id TEXT,
ADD COLUMN IF NOT EXISTS pagbank_taxa_valor NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS pagbank_valor_liquido NUMERIC(10,2);

-- Índice
CREATE INDEX IF NOT EXISTS idx_admin_recebimentos_pagbank_charge_id 
ON public.admin_recebimentos(pagbank_charge_id) 
WHERE pagbank_charge_id IS NOT NULL;

-- Comentários
COMMENT ON COLUMN public.admin_recebimentos.pagbank_charge_id IS 'ID da cobrança do PagBank associada ao recebimento';
COMMENT ON COLUMN public.admin_recebimentos.pagbank_taxa_valor IS 'Valor da taxa cobrada pelo PagBank';
COMMENT ON COLUMN public.admin_recebimentos.pagbank_valor_liquido IS 'Valor líquido recebido após desconto da taxa';

-- Tabela: admin_pagamentos
ALTER TABLE public.admin_pagamentos
ADD COLUMN IF NOT EXISTS pagbank_transfer_id TEXT,
ADD COLUMN IF NOT EXISTS pagbank_taxa_valor NUMERIC(10,2) DEFAULT 0.00;

-- Índice
CREATE INDEX IF NOT EXISTS idx_admin_pagamentos_pagbank_transfer_id 
ON public.admin_pagamentos(pagbank_transfer_id) 
WHERE pagbank_transfer_id IS NOT NULL;

-- Comentários
COMMENT ON COLUMN public.admin_pagamentos.pagbank_transfer_id IS 'ID da transferência do PagBank associada ao pagamento';
COMMENT ON COLUMN public.admin_pagamentos.pagbank_taxa_valor IS 'Valor da taxa cobrada pelo PagBank';
