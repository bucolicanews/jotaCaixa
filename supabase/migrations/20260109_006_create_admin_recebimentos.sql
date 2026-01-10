-- Migration: Criar tabela admin_recebimentos para registro de recebimentos
-- Data: 2026-01-09
-- Descrição: Armazena recebimentos de parcelas via PagBank ou outras formas

CREATE TABLE IF NOT EXISTS public.admin_recebimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcela_id UUID NOT NULL REFERENCES admin_parcelas_receber(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES tbl_usuarios(id),
  cliente_id UUID REFERENCES tbl_clientes(id),
  valor_recebido DECIMAL(15,2) NOT NULL,
  data_recebimento DATE NOT NULL,
  tipo_recebimento VARCHAR(20) DEFAULT 'total', -- 'total', 'parcial', 'adiantamento'
  forma_pagamento VARCHAR(50) DEFAULT 'PagBank',
  conta_id UUID REFERENCES saldo_contas(id),
  id_conta_contabil UUID REFERENCES plano_contas(id),
  historico_id UUID REFERENCES historicos_padrao(id),
  id_conta_resultado UUID REFERENCES plano_contas(id),
  pagbank_charge_id VARCHAR(100),
  pagbank_taxa_valor DECIMAL(15,2) DEFAULT 0,
  pagbank_valor_liquido DECIMAL(15,2),
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_admin_recebimentos_parcela ON admin_recebimentos(parcela_id);
CREATE INDEX IF NOT EXISTS idx_admin_recebimentos_admin ON admin_recebimentos(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_recebimentos_cliente ON admin_recebimentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_admin_recebimentos_data ON admin_recebimentos(data_recebimento);
CREATE INDEX IF NOT EXISTS idx_admin_recebimentos_pagbank ON admin_recebimentos(pagbank_charge_id);

-- RLS
ALTER TABLE admin_recebimentos ENABLE ROW LEVEL SECURITY;

-- Policy SELECT
DROP POLICY IF EXISTS "Admin e usuarios podem ver recebimentos" ON admin_recebimentos;
CREATE POLICY "Admin e usuarios podem ver recebimentos"
ON admin_recebimentos FOR SELECT
USING (
  admin_id IN (
    SELECT id FROM tbl_usuarios 
    WHERE id = auth.uid() 
    OR proprietario_id = auth.uid()
  )
);

-- Policy INSERT
DROP POLICY IF EXISTS "Admin e usuarios podem criar recebimentos" ON admin_recebimentos;
CREATE POLICY "Admin e usuarios podem criar recebimentos"
ON admin_recebimentos FOR INSERT
WITH CHECK (
  admin_id IN (
    SELECT id FROM tbl_usuarios 
    WHERE id = auth.uid() 
    OR proprietario_id = auth.uid()
  )
);

-- Policy UPDATE
DROP POLICY IF EXISTS "Admin e usuarios podem atualizar recebimentos" ON admin_recebimentos;
CREATE POLICY "Admin e usuarios podem atualizar recebimentos"
ON admin_recebimentos FOR UPDATE
USING (
  admin_id IN (
    SELECT id FROM tbl_usuarios 
    WHERE id = auth.uid() 
    OR proprietario_id = auth.uid()
  )
);

-- Policy DELETE
DROP POLICY IF EXISTS "Admin e usuarios podem deletar recebimentos" ON admin_recebimentos;
CREATE POLICY "Admin e usuarios podem deletar recebimentos"
ON admin_recebimentos FOR DELETE
USING (
  admin_id IN (
    SELECT id FROM tbl_usuarios 
    WHERE id = auth.uid() 
    OR proprietario_id = auth.uid()
  )
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_admin_recebimentos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_admin_recebimentos_updated_at ON admin_recebimentos;
CREATE TRIGGER trigger_admin_recebimentos_updated_at
BEFORE UPDATE ON admin_recebimentos
FOR EACH ROW
EXECUTE FUNCTION update_admin_recebimentos_updated_at();
