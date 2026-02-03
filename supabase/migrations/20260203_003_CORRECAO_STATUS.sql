-- =====================================================
-- CORREÇÃO RÁPIDA: Aceitar status 'pendente' OU 'aberta'
-- Execute este script no Supabase para corrigir
-- =====================================================

-- Function: criar_aditivo_contratual (CORRIGIDA)
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

  -- Buscar valor atual do contrato (soma das parcelas pendentes OU abertas)
  SELECT 
    COUNT(*),
    COALESCE(SUM(valor_parcela), 0)
  INTO 
    v_parcelas_abertas,
    v_soma_parcelas_abertas
  FROM admin_parcelas_receber
  WHERE conta_receber_id = p_conta_receber_id
  AND status IN ('pendente', 'aberta');

  IF v_parcelas_abertas = 0 THEN
    RAISE EXCEPTION 'Nenhuma parcela pendente/aberta encontrada para este contrato';
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
      AND status IN ('pendente', 'aberta')
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
      AND status IN ('pendente', 'aberta')
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

-- PRONTO! Agora aceita ambos: 'pendente' E 'aberta'
