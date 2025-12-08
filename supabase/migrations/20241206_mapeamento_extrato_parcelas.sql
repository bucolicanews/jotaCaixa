-- Migration: Mapeamento Inteligente de Parcelas com Extrato
-- Data: 2024-12-06
-- Descrição: Adiciona campos para vincular transações de extrato com parcelas de CR/CP

-- ============================================================
-- 1. Criar ENUM para status de mapeamento
-- ============================================================
DO $$ BEGIN
    CREATE TYPE status_mapeamento_extrato AS ENUM (
        'pendente_mapeamento',
        'mapeado_automatico',
        'mapeado_manual',
        'sem_mapeamento'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- 2. Adicionar coluna status_mapeamento na tabela extratos
-- ============================================================
ALTER TABLE extratos 
ADD COLUMN IF NOT EXISTS status_mapeamento status_mapeamento_extrato DEFAULT 'sem_mapeamento';

CREATE INDEX IF NOT EXISTS idx_extratos_status_mapeamento ON extratos(status_mapeamento);

-- ============================================================
-- 3. Adicionar campo mapeado_extrato_id nas tabelas de parcelas
-- ============================================================

-- Admin Contas a Receber
ALTER TABLE admin_parcelas_receber 
ADD COLUMN IF NOT EXISTS mapeado_extrato_id UUID REFERENCES extratos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_parcelas_receber_extrato ON admin_parcelas_receber(mapeado_extrato_id);

ALTER TABLE admin_parcelas_receber 
DROP CONSTRAINT IF EXISTS uk_admin_parcelas_receber_extrato;

ALTER TABLE admin_parcelas_receber 
ADD CONSTRAINT uk_admin_parcelas_receber_extrato UNIQUE (mapeado_extrato_id);

-- Cliente Contas a Receber
ALTER TABLE parcelas_contas_receber 
ADD COLUMN IF NOT EXISTS mapeado_extrato_id UUID REFERENCES extratos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_parcelas_receber_extrato ON parcelas_contas_receber(mapeado_extrato_id);

ALTER TABLE parcelas_contas_receber 
DROP CONSTRAINT IF EXISTS uk_parcelas_receber_extrato;

ALTER TABLE parcelas_contas_receber 
ADD CONSTRAINT uk_parcelas_receber_extrato UNIQUE (mapeado_extrato_id);

-- Admin Contas a Pagar
ALTER TABLE admin_parcelas_pagar 
ADD COLUMN IF NOT EXISTS mapeado_extrato_id UUID REFERENCES extratos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_parcelas_pagar_extrato ON admin_parcelas_pagar(mapeado_extrato_id);

ALTER TABLE admin_parcelas_pagar 
DROP CONSTRAINT IF EXISTS uk_admin_parcelas_pagar_extrato;

ALTER TABLE admin_parcelas_pagar 
ADD CONSTRAINT uk_admin_parcelas_pagar_extrato UNIQUE (mapeado_extrato_id);

-- Cliente Contas a Pagar
ALTER TABLE parcelas_contas_pagar 
ADD COLUMN IF NOT EXISTS mapeado_extrato_id UUID REFERENCES extratos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_parcelas_pagar_extrato ON parcelas_contas_pagar(mapeado_extrato_id);

ALTER TABLE parcelas_contas_pagar 
DROP CONSTRAINT IF EXISTS uk_parcelas_pagar_extrato;

ALTER TABLE parcelas_contas_pagar 
ADD CONSTRAINT uk_parcelas_pagar_extrato UNIQUE (mapeado_extrato_id);

-- ============================================================
-- 4. Comentários para documentação
-- ============================================================
COMMENT ON COLUMN extratos.status_mapeamento IS 'Status do mapeamento: pendente_mapeamento, mapeado_automatico, mapeado_manual, sem_mapeamento';
COMMENT ON COLUMN admin_parcelas_receber.mapeado_extrato_id IS 'ID do extrato mapeado para esta parcela (vínculo 1:1)';
COMMENT ON COLUMN parcelas_contas_receber.mapeado_extrato_id IS 'ID do extrato mapeado para esta parcela (vínculo 1:1)';
COMMENT ON COLUMN admin_parcelas_pagar.mapeado_extrato_id IS 'ID do extrato mapeado para esta parcela (vínculo 1:1)';
COMMENT ON COLUMN parcelas_contas_pagar.mapeado_extrato_id IS 'ID do extrato mapeado para esta parcela (vínculo 1:1)';
