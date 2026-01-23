-- Migration: Adicionar campos de conciliação
-- Data: 2026-01-23
-- Descrição: Adiciona campos de status e valores de conciliação nas tabelas de extratos e parcelas

-- ============================================================
-- 1. ALTER TABLE extratos - Adicionar campos de conciliação
-- ============================================================
ALTER TABLE extratos 
ADD COLUMN IF NOT EXISTS status_conciliacao VARCHAR(30) DEFAULT 'PENDENTE' 
CHECK (status_conciliacao IN ('PENDENTE', 'PARCIALMENTE_CONCILIADA', 'CONCILIADA'));

ALTER TABLE extratos 
ADD COLUMN IF NOT EXISTS valor_conciliado DECIMAL(15,2) DEFAULT 0.00;

-- Criar índice para status_conciliacao
CREATE INDEX IF NOT EXISTS idx_extratos_status_conciliacao 
ON extratos(status_conciliacao);

-- ============================================================
-- 2. ALTER TABLE admin_parcelas_receber
-- ============================================================
ALTER TABLE admin_parcelas_receber 
ADD COLUMN IF NOT EXISTS vinculada_extrato BOOLEAN DEFAULT FALSE;

ALTER TABLE admin_parcelas_receber 
ADD COLUMN IF NOT EXISTS valor_vinculado DECIMAL(15,2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_admin_parcelas_receber_vinculada 
ON admin_parcelas_receber(vinculada_extrato) 
WHERE vinculada_extrato = TRUE;

-- ============================================================
-- 3. ALTER TABLE parcelas_contas_receber
-- ============================================================
ALTER TABLE parcelas_contas_receber 
ADD COLUMN IF NOT EXISTS vinculada_extrato BOOLEAN DEFAULT FALSE;

ALTER TABLE parcelas_contas_receber 
ADD COLUMN IF NOT EXISTS valor_vinculado DECIMAL(15,2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_parcelas_receber_vinculada 
ON parcelas_contas_receber(vinculada_extrato) 
WHERE vinculada_extrato = TRUE;

-- ============================================================
-- 4. ALTER TABLE admin_parcelas_pagar
-- ============================================================
ALTER TABLE admin_parcelas_pagar 
ADD COLUMN IF NOT EXISTS vinculada_extrato BOOLEAN DEFAULT FALSE;

ALTER TABLE admin_parcelas_pagar 
ADD COLUMN IF NOT EXISTS valor_vinculado DECIMAL(15,2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_admin_parcelas_pagar_vinculada 
ON admin_parcelas_pagar(vinculada_extrato) 
WHERE vinculada_extrato = TRUE;

-- ============================================================
-- 5. ALTER TABLE parcelas_contas_pagar
-- ============================================================
ALTER TABLE parcelas_contas_pagar 
ADD COLUMN IF NOT EXISTS vinculada_extrato BOOLEAN DEFAULT FALSE;

ALTER TABLE parcelas_contas_pagar 
ADD COLUMN IF NOT EXISTS valor_vinculado DECIMAL(15,2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_parcelas_pagar_vinculada 
ON parcelas_contas_pagar(vinculada_extrato) 
WHERE vinculada_extrato = TRUE;

-- ============================================================
-- 6. Comentários para documentação
-- ============================================================
COMMENT ON COLUMN extratos.status_conciliacao IS 'Status da conciliação: PENDENTE, PARCIALMENTE_CONCILIADA, CONCILIADA';
COMMENT ON COLUMN extratos.valor_conciliado IS 'Valor total já conciliado desta transação';

COMMENT ON COLUMN admin_parcelas_receber.vinculada_extrato IS 'Indica se a parcela possui vínculo com extrato';
COMMENT ON COLUMN admin_parcelas_receber.valor_vinculado IS 'Valor total vinculado ao extrato';

COMMENT ON COLUMN parcelas_contas_receber.vinculada_extrato IS 'Indica se a parcela possui vínculo com extrato';
COMMENT ON COLUMN parcelas_contas_receber.valor_vinculado IS 'Valor total vinculado ao extrato';

COMMENT ON COLUMN admin_parcelas_pagar.vinculada_extrato IS 'Indica se a parcela possui vínculo com extrato';
COMMENT ON COLUMN admin_parcelas_pagar.valor_vinculado IS 'Valor total vinculado ao extrato';

COMMENT ON COLUMN parcelas_contas_pagar.vinculada_extrato IS 'Indica se a parcela possui vínculo com extrato';
COMMENT ON COLUMN parcelas_contas_pagar.valor_vinculado IS 'Valor total vinculado ao extrato';
