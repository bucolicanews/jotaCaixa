-- Migration: Criar tabela de lançamentos avulsos para conciliação
-- Data: 2026-01-23
-- Descrição: Permite criar lançamentos contábeis avulsos diretamente vinculados a transações de extrato

-- ============================================================
-- 1. Criar tabela conciliacao_lancamentos_avulsos
-- ============================================================
CREATE TABLE IF NOT EXISTS conciliacao_lancamentos_avulsos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transacao_extrato_id UUID NOT NULL REFERENCES extratos(id) ON DELETE CASCADE,
    conta_contabil_id UUID NOT NULL REFERENCES plano_contas(id) ON DELETE RESTRICT,
    valor DECIMAL(15,2) NOT NULL CHECK (valor > 0),
    descricao TEXT NOT NULL,
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
    data_lancamento TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    empresa_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. Criar índices para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_lancamento_avulso_transacao 
ON conciliacao_lancamentos_avulsos(transacao_extrato_id);

CREATE INDEX IF NOT EXISTS idx_lancamento_avulso_conta_contabil 
ON conciliacao_lancamentos_avulsos(conta_contabil_id);

CREATE INDEX IF NOT EXISTS idx_lancamento_avulso_empresa 
ON conciliacao_lancamentos_avulsos(empresa_id);

CREATE INDEX IF NOT EXISTS idx_lancamento_avulso_data 
ON conciliacao_lancamentos_avulsos(data_lancamento DESC);

CREATE INDEX IF NOT EXISTS idx_lancamento_avulso_tipo 
ON conciliacao_lancamentos_avulsos(tipo);

-- ============================================================
-- 3. Habilitar RLS
-- ============================================================
ALTER TABLE conciliacao_lancamentos_avulsos ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. Criar políticas RLS baseadas em empresa_id
-- ============================================================
DROP POLICY IF EXISTS "Usuários podem visualizar lançamentos avulsos de sua empresa" ON conciliacao_lancamentos_avulsos;
CREATE POLICY "Usuários podem visualizar lançamentos avulsos de sua empresa"
ON conciliacao_lancamentos_avulsos
FOR SELECT
USING (
    empresa_id IN (
        SELECT empresa_id FROM usuarios_empresas WHERE user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Usuários podem criar lançamentos avulsos em sua empresa" ON conciliacao_lancamentos_avulsos;
CREATE POLICY "Usuários podem criar lançamentos avulsos em sua empresa"
ON conciliacao_lancamentos_avulsos
FOR INSERT
WITH CHECK (
    empresa_id IN (
        SELECT empresa_id FROM usuarios_empresas WHERE user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Usuários podem atualizar lançamentos avulsos de sua empresa" ON conciliacao_lancamentos_avulsos;
CREATE POLICY "Usuários podem atualizar lançamentos avulsos de sua empresa"
ON conciliacao_lancamentos_avulsos
FOR UPDATE
USING (
    empresa_id IN (
        SELECT empresa_id FROM usuarios_empresas WHERE user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Usuários podem deletar lançamentos avulsos de sua empresa" ON conciliacao_lancamentos_avulsos;
CREATE POLICY "Usuários podem deletar lançamentos avulsos de sua empresa"
ON conciliacao_lancamentos_avulsos
FOR DELETE
USING (
    empresa_id IN (
        SELECT empresa_id FROM usuarios_empresas WHERE user_id = auth.uid()
    )
);

-- ============================================================
-- 5. Comentários para documentação
-- ============================================================
COMMENT ON TABLE conciliacao_lancamentos_avulsos IS 'Lançamentos contábeis avulsos criados diretamente na conciliação bancária';
COMMENT ON COLUMN conciliacao_lancamentos_avulsos.id IS 'Identificador único do lançamento avulso';
COMMENT ON COLUMN conciliacao_lancamentos_avulsos.transacao_extrato_id IS 'ID da transação do extrato bancário';
COMMENT ON COLUMN conciliacao_lancamentos_avulsos.conta_contabil_id IS 'ID da conta contábil do plano de contas';
COMMENT ON COLUMN conciliacao_lancamentos_avulsos.valor IS 'Valor do lançamento';
COMMENT ON COLUMN conciliacao_lancamentos_avulsos.descricao IS 'Descrição do lançamento avulso';
COMMENT ON COLUMN conciliacao_lancamentos_avulsos.tipo IS 'Tipo do lançamento: ENTRADA ou SAIDA';
COMMENT ON COLUMN conciliacao_lancamentos_avulsos.data_lancamento IS 'Data do lançamento';
COMMENT ON COLUMN conciliacao_lancamentos_avulsos.usuario_id IS 'Usuário que criou o lançamento';
COMMENT ON COLUMN conciliacao_lancamentos_avulsos.empresa_id IS 'ID da empresa (para RLS)';
