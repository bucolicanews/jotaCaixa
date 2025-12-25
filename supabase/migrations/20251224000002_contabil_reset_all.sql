CREATE OR REPLACE FUNCTION public.contabil_reset_all(p_proprietario_id uuid)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Desvincular FKs (mantém lançamentos, mas remove vínculos contábeis/históricos)
  UPDATE public.saldo_contas
    SET conta_contabil_id = NULL
  WHERE proprietario_id = p_proprietario_id;

  UPDATE public.lancamentos
    SET conta_contabil_id = NULL,
        conta_resultado_id = NULL,
        historico_id = NULL
  WHERE proprietario_id = p_proprietario_id;

  UPDATE public.configuracao_contas_receber
    SET conta_contabil_id = NULL
  WHERE proprietario_id = p_proprietario_id;

  UPDATE public.configuracao_contas_pagar
    SET conta_contabil_id = NULL
  WHERE proprietario_id = p_proprietario_id;

  UPDATE public.configuracoes_stripe
    SET conta_sintetica_id = NULL,
        conta_receber_id = NULL,
        historico_padrao_id = NULL,
        id_conta_resultado = NULL
  WHERE proprietario_id = p_proprietario_id;

  UPDATE public.configuracao_contratos
    SET id_conta_clientes_receber = NULL,
        id_conta_receita_contrato = NULL
  WHERE proprietario_id = p_proprietario_id;

  -- Remover configs contábeis (o setup recria)
  DELETE FROM public.configuracao_contabil WHERE proprietario_id = p_proprietario_id;
  DELETE FROM public.configuracao_contas_receber WHERE proprietario_id = p_proprietario_id;
  DELETE FROM public.configuracao_contas_pagar WHERE proprietario_id = p_proprietario_id;
  DELETE FROM public.configuracao_historico_padrao WHERE proprietario_id = p_proprietario_id;
  DELETE FROM public.saldo_contas WHERE proprietario_id = p_proprietario_id;

  -- Remover bases
  DELETE FROM public.plano_contas WHERE proprietario_id = p_proprietario_id;
  DELETE FROM public.historicos WHERE proprietario_id = p_proprietario_id;

  RETURN QUERY SELECT TRUE, 'Reset contábil executado com sucesso.';
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM::text;
END;
$function$;

