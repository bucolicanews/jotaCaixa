-- Migration: Criar tabela de vínculo N:N entre extratos e parcelas
-- Data: 2026-01-23
-- Descrição: Permite mapeamento N:N entre transações de extrato e parcelas (CP/CR)

-- ============================================================
-- 1. Criar tabela extrato_parcela_vinculo
-- ============================================================
CREATE TABLE IF NOT EXISTS extrato_parcela_vinculo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transacao_extrato_id UUID NOT NULL REFERENCES extratos(id) ON DELETE CASCADE,
    parcela_id UUID NOT NULL,
    tipo_parcela VARCHAR(2) NOT NULL CHECK (tipo_parcela IN ('CR', 'CP')),
    valor_aplicado DECIMAL(15,2) NOT NULL CHECK (valor_aplicado > 0),
    data_vinculacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_vinculacao_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    observacao TEXT,
    empresa_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. Criar constraint UNIQUE para evitar duplicatas
-- ============================================================
ALTER TABLE extrato_parcela_vinculo 
DROP CONSTRAINT IF EXISTS uk_vinculo_transacao_parcela;

ALTER TABLE extrato_parcela_vinculo 
ADD CONSTRAINT uk_vinculo_transacao_parcela UNIQUE (transacao_extrato_id, parcela_id);

-- ============================================================
-- 3. Criar índices para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_vinculo_transacao 
ON extrato_parcela_vinculo(transacao_extrato_id);

CREATE INDEX IF NOT EXISTS idx_vinculo_parcela 
ON extrato_parcela_vinculo(parcela_id, tipo_parcela);

CREATE INDEX IF NOT EXISTS idx_vinculo_empresa 
ON extrato_parcela_vinculo(empresa_id);

CREATE INDEX IF NOT EXISTS idx_vinculo_data 
ON extrato_parcela_vinculo(data_vinculacao DESC);

-- ============================================================
-- 4. Habilitar RLS
-- ============================================================
ALTER TABLE extrato_parcela_vinculo ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. Criar políticas RLS baseadas em empresa_id
-- ============================================================
DROP POLICY IF EXISTS "Usuários podem visualizar vínculos de sua empresa" ON extrato_parcela_vinculo;
CREATE POLICY "Usuários podem visualizar vínculos de sua empresa"
ON extrato_parcela_vinculo
FOR SELECT
USING (
    empresa_id IN (
        SELECT empresa_id FROM usuarios_empresas WHERE user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Usuários podem criar vínculos em sua empresa" ON extrato_parcela_vinculo;
CREATE POLICY "Usuários podem criar vínculos em sua empresa"
ON extrato_parcela_vinculo
FOR INSERT
WITH CHECK (
    empresa_id IN (
        SELECT empresa_id FROM usuarios_empresas WHERE user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Usuários podem atualizar vínculos de sua empresa" ON extrato_parcela_vinculo;
CREATE POLICY "Usuários podem atualizar vínculos de sua empresa"
ON extrato_parcela_vinculo
FOR UPDATE
USING (
    empresa_id IN (
        SELECT empresa_id FROM usuarios_empresas WHERE user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Usuários podem deletar vínculos de sua empresa" ON extrato_parcela_vinculo;
CREATE POLICY "Usuários podem deletar vínculos de sua empresa"
ON extrato_parcela_vinculo
FOR DELETE
USING (
    empresa_id IN (
        SELECT empresa_id FROM usuarios_empresas WHERE user_id = auth.uid()
    )
);

-- ============================================================
-- 6. Comentários para documentação
-- ============================================================
COMMENT ON TABLE extrato_parcela_vinculo IS 'Tabela de vínculo N:N entre transações de extrato e parcelas (CR/CP)';
COMMENT ON COLUMN extrato_parcela_vinculo.id IS 'Identificador único do vínculo';
COMMENT ON COLUMN extrato_parcela_vinculo.transacao_extrato_id IS 'ID da transação do extrato bancário';
COMMENT ON COLUMN extrato_parcela_vinculo.parcela_id IS 'ID da parcela (CR ou CP)';
COMMENT ON COLUMN extrato_parcela_vinculo.tipo_parcela IS 'Tipo da parcela: CR (Contas a Receber) ou CP (Contas a Pagar)';
COMMENT ON COLUMN extrato_parcela_vinculo.valor_aplicado IS 'Valor aplicado deste vínculo (permite divisão de valores)';
COMMENT ON COLUMN extrato_parcela_vinculo.data_vinculacao IS 'Data e hora da vinculação';
COMMENT ON COLUMN extrato_parcela_vinculo.usuario_vinculacao_id IS 'Usuário que realizou a vinculação';
COMMENT ON COLUMN extrato_parcela_vinculo.observacao IS 'Observações sobre a vinculação';
COMMENT ON COLUMN extrato_parcela_vinculo.empresa_id IS 'ID da empresa (para RLS)';
