-- =====================================================
-- SCRIPT COMPLETO: Sistema de Aditivos Contratuais
-- Data: 2026-02-03
-- Descrição: Implementa sistema completo de aditivos 
--            para contratos (acréscimos e reduções)
-- =====================================================

-- 1. Criar tabela de aditivos contratuais
CREATE TABLE IF NOT EXISTS admin_aditivos_contratuais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_receber_id UUID NOT NULL REFERENCES admin_contas_receber(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES tbl_admins(id),
  
  -- Dados do Aditivo
  tipo_aditivo TEXT NOT NULL CHECK (tipo_aditivo IN ('acrescimo', 'reducao')),
  valor_ajuste NUMERIC(15, 2) NOT NULL CHECK (valor_ajuste > 0),
  modo_distribuicao TEXT NOT NULL CHECK (modo_distribuicao IN ('proporcional', 'fixo')),
  
  -- Documentação
  motivo TEXT NOT NULL,
  observacao TEXT,
  
  -- Dados de Auditoria
  valor_contrato_anterior NUMERIC(15, 2) NOT NULL,
  valor_contrato_novo NUMERIC(15, 2) NOT NULL,
  quantidade_parcelas_afetadas INTEGER NOT NULL,
  
  -- Status e Controle
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'cancelado')),
  cancelado_por UUID REFERENCES tbl_admins(id),
  motivo_cancelamento TEXT,
  cancelado_em TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_aditivos_conta_receber ON admin_aditivos_contratuais(conta_receber_id);
CREATE INDEX idx_aditivos_admin ON admin_aditivos_contratuais(admin_id);
CREATE INDEX idx_aditivos_status ON admin_aditivos_contratuais(status);
CREATE INDEX idx_aditivos_created ON admin_aditivos_contratuais(created_at DESC);

-- Comentários
COMMENT ON TABLE admin_aditivos_contratuais IS 'Registro de aditivos contratuais (acréscimos/reduções de valor)';
COMMENT ON COLUMN admin_aditivos_contratuais.tipo_aditivo IS 'Tipo: acrescimo ou reducao';
COMMENT ON COLUMN admin_aditivos_contratuais.modo_distribuicao IS 'proporcional: distribui conforme peso das parcelas | fixo: mesmo valor em cada parcela';
COMMENT ON COLUMN admin_aditivos_contratuais.quantidade_parcelas_afetadas IS 'Número de parcelas abertas que foram recalculadas';

-- 2. Adicionar campos de auditoria em admin_parcelas_receber
-- Campo valor_original (valor antes de qualquer aditivo)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'admin_parcelas_receber' 
    AND column_name = 'valor_original'
  ) THEN
    ALTER TABLE admin_parcelas_receber 
    ADD COLUMN valor_original NUMERIC(15, 2);
    
    -- Preencher com valores atuais para parcelas existentes
    UPDATE admin_parcelas_receber 
    SET valor_original = valor_parcela 
    WHERE valor_original IS NULL;
    
    COMMENT ON COLUMN admin_parcelas_receber.valor_original IS 'Valor original da parcela antes de aditivos contratuais';
  END IF;
END $$;

-- Campo ultimo_aditivo_id (rastreabilidade)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'admin_parcelas_receber' 
    AND column_name = 'ultimo_aditivo_id'
  ) THEN
    ALTER TABLE admin_parcelas_receber 
    ADD COLUMN ultimo_aditivo_id UUID REFERENCES admin_aditivos_contratuais(id);
    
    COMMENT ON COLUMN admin_parcelas_receber.ultimo_aditivo_id IS 'Último aditivo que modificou esta parcela';
  END IF;
END $$;

-- 3. Habilitar RLS
ALTER TABLE admin_aditivos_contratuais ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS

-- 4.1. Política de Leitura (SELECT)
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar aditivos" ON admin_aditivos_contratuais;
CREATE POLICY "Usuários autenticados podem visualizar aditivos"
ON admin_aditivos_contratuais
FOR SELECT
TO authenticated
USING (true);

-- 4.2. Política de Inserção (INSERT) - Apenas Admin
DROP POLICY IF EXISTS "Apenas admin podem criar aditivos" ON admin_aditivos_contratuais;
CREATE POLICY "Apenas admin podem criar aditivos"
ON admin_aditivos_contratuais
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tbl_admins
    WHERE tbl_admins.id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM admin_usuarios
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- 4.3. Política de Atualização (UPDATE) - Apenas Admin (para cancelamento)
DROP POLICY IF EXISTS "Apenas admin podem cancelar aditivos" ON admin_aditivos_contratuais;
CREATE POLICY "Apenas admin podem cancelar aditivos"
ON admin_aditivos_contratuais
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tbl_admins
    WHERE tbl_admins.id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM admin_usuarios
    WHERE admin_usuarios.id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tbl_admins
    WHERE tbl_admins.id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM admin_usuarios
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- 4.4. Política de Exclusão (DELETE) - Bloqueada
DROP POLICY IF EXISTS "Bloquear exclusão física de aditivos" ON admin_aditivos_contratuais;
CREATE POLICY "Bloquear exclusão física de aditivos"
ON admin_aditivos_contratuais
FOR DELETE
TO authenticated
USING (false);

-- 5. Function: criar_aditivo_contratual
CREATE OR REPLACE FUNCTION criar_aditivo_contratual(
  p_conta_receber_id UUID,
  p_admin_id UUID,
  p_tipo_aditivo TEXT,
  p_valor_ajuste NUMERIC,
  p_modo_distribuicao TEXT,
  p_motivo TEXT,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_aditivo_id UUID;
  v_valor_contrato_anterior NUMERIC;
  v_valor_contrato_novo NUMERIC;
  v_parcelas_abertas INTEGER;
  v_soma_parcelas_abertas NUMERIC;
  v_ajuste_por_parcela NUMERIC;
  v_parcela RECORD;
  v_novo_valor NUMERIC;
  v_peso NUMERIC;
BEGIN
  -- Verificar permissão (Admin ou AdminUsuario)
  IF NOT EXISTS (
    SELECT 1 FROM tbl_admins WHERE id = p_admin_id
  ) AND NOT EXISTS (
    SELECT 1 FROM admin_usuarios WHERE id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'Usuário sem permissão para criar aditivos';
  END IF;

  -- Buscar valor atual do contrato (soma das parcelas abertas)
  SELECT 
    COUNT(*),
    COALESCE(SUM(valor_parcela), 0)
  INTO 
    v_parcelas_abertas,
    v_soma_parcelas_abertas
  FROM admin_parcelas_receber
  WHERE conta_receber_id = p_conta_receber_id
  AND status = 'pendente';

  IF v_parcelas_abertas = 0 THEN
    RAISE EXCEPTION 'Nenhuma parcela aberta encontrada para este contrato';
  END IF;

  v_valor_contrato_anterior := v_soma_parcelas_abertas;

  -- Calcular novo valor do contrato
  IF p_tipo_aditivo = 'acrescimo' THEN
    v_valor_contrato_novo := v_valor_contrato_anterior + p_valor_ajuste;
  ELSE
    v_valor_contrato_novo := v_valor_contrato_anterior - p_valor_ajuste;
    IF v_valor_contrato_novo < 0 THEN
      RAISE EXCEPTION 'Redução resulta em valor negativo';
    END IF;
  END IF;

  -- Criar registro de aditivo
  INSERT INTO admin_aditivos_contratuais (
    conta_receber_id,
    admin_id,
    tipo_aditivo,
    valor_ajuste,
    modo_distribuicao,
    motivo,
    observacao,
    valor_contrato_anterior,
    valor_contrato_novo,
    quantidade_parcelas_afetadas
  ) VALUES (
    p_conta_receber_id,
    p_admin_id,
    p_tipo_aditivo,
    p_valor_ajuste,
    p_modo_distribuicao,
    p_motivo,
    p_observacao,
    v_valor_contrato_anterior,
    v_valor_contrato_novo,
    v_parcelas_abertas
  ) RETURNING id INTO v_aditivo_id;

  -- Recalcular parcelas conforme modo de distribuição
  IF p_modo_distribuicao = 'fixo' THEN
    -- Modo FIXO: mesmo valor em cada parcela
    v_ajuste_por_parcela := p_valor_ajuste / v_parcelas_abertas;
    
    FOR v_parcela IN 
      SELECT id, valor_parcela, valor_original
      FROM admin_parcelas_receber
      WHERE conta_receber_id = p_conta_receber_id
      AND status = 'pendente'
    LOOP
      -- Salvar valor original se ainda não foi salvo
      IF v_parcela.valor_original IS NULL THEN
        UPDATE admin_parcelas_receber
        SET valor_original = v_parcela.valor_parcela
        WHERE id = v_parcela.id;
      END IF;

      -- Calcular novo valor
      IF p_tipo_aditivo = 'acrescimo' THEN
        v_novo_valor := v_parcela.valor_parcela + v_ajuste_por_parcela;
      ELSE
        v_novo_valor := v_parcela.valor_parcela - v_ajuste_por_parcela;
      END IF;

      -- Atualizar parcela
      UPDATE admin_parcelas_receber
      SET 
        valor_parcela = v_novo_valor,
        ultimo_aditivo_id = v_aditivo_id,
        updated_at = now()
      WHERE id = v_parcela.id;
    END LOOP;

  ELSE
    -- Modo PROPORCIONAL: distribui conforme peso de cada parcela
    FOR v_parcela IN 
      SELECT id, valor_parcela, valor_original
      FROM admin_parcelas_receber
      WHERE conta_receber_id = p_conta_receber_id
      AND status = 'pendente'
    LOOP
      -- Salvar valor original se ainda não foi salvo
      IF v_parcela.valor_original IS NULL THEN
        UPDATE admin_parcelas_receber
        SET valor_original = v_parcela.valor_parcela
        WHERE id = v_parcela.id;
      END IF;

      -- Calcular peso proporcional
      v_peso := v_parcela.valor_parcela / v_soma_parcelas_abertas;
      v_ajuste_por_parcela := p_valor_ajuste * v_peso;

      -- Calcular novo valor
      IF p_tipo_aditivo = 'acrescimo' THEN
        v_novo_valor := v_parcela.valor_parcela + v_ajuste_por_parcela;
      ELSE
        v_novo_valor := v_parcela.valor_parcela - v_ajuste_por_parcela;
      END IF;

      -- Atualizar parcela
      UPDATE admin_parcelas_receber
      SET 
        valor_parcela = v_novo_valor,
        ultimo_aditivo_id = v_aditivo_id,
        updated_at = now()
      WHERE id = v_parcela.id;
    END LOOP;
  END IF;

  -- Retornar resultado
  RETURN json_build_object(
    'success', true,
    'aditivo_id', v_aditivo_id,
    'valor_anterior', v_valor_contrato_anterior,
    'valor_novo', v_valor_contrato_novo,
    'parcelas_afetadas', v_parcelas_abertas
  );
END;
$$;

COMMENT ON FUNCTION criar_aditivo_contratual IS 'Cria aditivo contratual e recalcula parcelas abertas';

-- 6. Function: buscar_aditivos_contrato
CREATE OR REPLACE FUNCTION buscar_aditivos_contrato(p_conta_receber_id UUID)
RETURNS TABLE (
  id UUID,
  tipo_aditivo TEXT,
  valor_ajuste NUMERIC,
  modo_distribuicao TEXT,
  motivo TEXT,
  observacao TEXT,
  valor_contrato_anterior NUMERIC,
  valor_contrato_novo NUMERIC,
  quantidade_parcelas_afetadas INTEGER,
  status TEXT,
  admin_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  cancelado_em TIMESTAMP WITH TIME ZONE,
  motivo_cancelamento TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.tipo_aditivo,
    a.valor_ajuste,
    a.modo_distribuicao,
    a.motivo,
    a.observacao,
    a.valor_contrato_anterior,
    a.valor_contrato_novo,
    a.quantidade_parcelas_afetadas,
    a.status,
    COALESCE(adm.nome, adm_usr.nome, 'Desconhecido') AS admin_nome,
    a.created_at,
    a.cancelado_em,
    a.motivo_cancelamento
  FROM admin_aditivos_contratuais a
  LEFT JOIN tbl_admins adm ON a.admin_id = adm.id
  LEFT JOIN admin_usuarios adm_usr ON a.admin_id = adm_usr.id
  WHERE a.conta_receber_id = p_conta_receber_id
  ORDER BY a.created_at DESC;
END;
$$;

COMMENT ON FUNCTION buscar_aditivos_contrato IS 'Retorna histórico de aditivos de um contrato';

-- 7. Function: cancelar_aditivo_contratual
CREATE OR REPLACE FUNCTION cancelar_aditivo_contratual(
  p_aditivo_id UUID,
  p_admin_id UUID,
  p_motivo_cancelamento TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_aditivo RECORD;
BEGIN
  -- Verificar permissão
  IF NOT EXISTS (
    SELECT 1 FROM tbl_admins WHERE id = p_admin_id
  ) AND NOT EXISTS (
    SELECT 1 FROM admin_usuarios WHERE id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'Usuário sem permissão para cancelar aditivos';
  END IF;

  -- Buscar aditivo
  SELECT * INTO v_aditivo
  FROM admin_aditivos_contratuais
  WHERE id = p_aditivo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aditivo não encontrado';
  END IF;

  IF v_aditivo.status = 'cancelado' THEN
    RAISE EXCEPTION 'Aditivo já está cancelado';
  END IF;

  -- Marcar como cancelado (sem rollback de valores)
  UPDATE admin_aditivos_contratuais
  SET 
    status = 'cancelado',
    cancelado_por = p_admin_id,
    motivo_cancelamento = p_motivo_cancelamento,
    cancelado_em = now(),
    updated_at = now()
  WHERE id = p_aditivo_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Aditivo cancelado com sucesso'
  );
END;
$$;

COMMENT ON FUNCTION cancelar_aditivo_contratual IS 'Cancela um aditivo contratual (sem rollback de valores)';

-- 8. Function: contar_aditivos_ativos
CREATE OR REPLACE FUNCTION contar_aditivos_ativos(p_conta_receber_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM admin_aditivos_contratuais
  WHERE conta_receber_id = p_conta_receber_id
  AND status = 'ativo';
  
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION contar_aditivos_ativos IS 'Retorna quantidade de aditivos ativos de um contrato';
