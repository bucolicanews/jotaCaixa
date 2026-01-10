-- Migration: Corrigir tabela admin_recebimentos
-- Data: 2026-01-09
-- Descrição: Ajustar referências e RLS

DROP TABLE IF EXISTS public.admin_recebimentos CASCADE;

CREATE TABLE public.admin_recebimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcela_id UUID NOT NULL REFERENCES admin_parcelas_receber(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL,
  cliente_id UUID REFERENCES tbl_clientes(id),
  valor_recebido DECIMAL(15,2) NOT NULL,
  data_recebimento DATE NOT NULL,
  tipo_recebimento VARCHAR(20) DEFAULT 'total',
  forma_pagamento VARCHAR(50) DEFAULT 'PagBank',
  conta_id UUID REFERENCES saldo_contas(id),
  id_conta_contabil UUID REFERENCES plano_contas(id),
  historico_id UUID REFERENCES historicos(id),
  id_conta_resultado UUID REFERENCES plano_contas(id),
  pagbank_charge_id VARCHAR(100),
  pagbank_taxa_valor DECIMAL(15,2) DEFAULT 0,
  pagbank_valor_liquido DECIMAL(15,2),
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_recebimentos_parcela ON admin_recebimentos(parcela_id);
CREATE INDEX idx_admin_recebimentos_admin ON admin_recebimentos(admin_id);
CREATE INDEX idx_admin_recebimentos_cliente ON admin_recebimentos(cliente_id);

ALTER TABLE admin_recebimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin e usuarios podem ver recebimentos"
ON admin_recebimentos FOR SELECT
USING (
  admin_id = auth.uid()
  OR admin_id IN (SELECT id FROM tbl_usuarios WHERE admin_id = auth.uid())
);

CREATE POLICY "Service role pode criar recebimentos"
ON admin_recebimentos FOR INSERT
WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_admin_recebimentos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_admin_recebimentos_updated_at
BEFORE UPDATE ON admin_recebimentos
FOR EACH ROW
EXECUTE FUNCTION update_admin_recebimentos_updated_at();
