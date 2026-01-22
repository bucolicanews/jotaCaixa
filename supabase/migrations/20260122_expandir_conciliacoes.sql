-- Migration para expandir a tabela conciliacoes com suporte a conciliação mapeada e direta
-- Data: 2026-01-22

-- Adicionar novos campos à tabela conciliacoes
ALTER TABLE conciliacoes 
  ADD COLUMN IF NOT EXISTS tipo_conciliacao VARCHAR(20) DEFAULT 'mapeada',
  ADD COLUMN IF NOT EXISTS parcela_id UUID NULL,
  ADD COLUMN IF NOT EXISTS lancamento_id UUID NULL,
  ADD COLUMN IF NOT EXISTS transacao_extrato_id UUID NULL,
  ADD COLUMN IF NOT EXISTS conciliado_por UUID NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS conciliado_em TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS revertido BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS revertido_em TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS revertido_por UUID NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS observacao_reversao TEXT NULL;

-- Adicionar índices para performance
CREATE INDEX IF NOT EXISTS idx_conciliacoes_tipo ON conciliacoes(tipo_conciliacao);
CREATE INDEX IF NOT EXISTS idx_conciliacoes_parcela ON conciliacoes(parcela_id) WHERE parcela_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conciliacoes_lancamento ON conciliacoes(lancamento_id) WHERE lancamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conciliacoes_revertido ON conciliacoes(revertido);
CREATE INDEX IF NOT EXISTS idx_conciliacoes_conciliado_em ON conciliacoes(conciliado_em DESC);

-- Adicionar comentários
COMMENT ON COLUMN conciliacoes.tipo_conciliacao IS 'Tipo de conciliação: mapeada (vinculada a parcela) ou direta (sem parcela)';
COMMENT ON COLUMN conciliacoes.parcela_id IS 'ID da parcela (contas a receber ou pagar) quando tipo_conciliacao = mapeada';
COMMENT ON COLUMN conciliacoes.lancamento_id IS 'ID do lançamento contábil quando tipo_conciliacao = direta';
COMMENT ON COLUMN conciliacoes.transacao_extrato_id IS 'ID da transação do extrato bancário';
COMMENT ON COLUMN conciliacoes.revertido IS 'Indica se a conciliação foi revertida';
