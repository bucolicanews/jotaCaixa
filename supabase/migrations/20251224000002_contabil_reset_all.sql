CREATE OR REPLACE FUNCTION public.contabil_reset_all(p_proprietario_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- 1. Limpar referências em Configurações (CP, CR, Contratos, Stripe)
  UPDATE public.configuracao_contas_receber SET conta_contabil_id = NULL WHERE proprietario_id = p_proprietario_id;
  UPDATE public.configuracao_contas_pagar SET conta_contabil_id = NULL WHERE proprietario_id = p_proprietario_id;
  UPDATE public.configuracao_contratos SET id_conta_clientes_receber = NULL, id_conta_receita_contrato = NULL WHERE proprietario_id = p_proprietario_id;
  UPDATE public.configuracoes_stripe SET conta_sintetica_id = NULL, conta_receber_id = NULL, id_conta_resultado = NULL WHERE proprietario_id = p_proprietario_id;
  
  -- 2. Limpar referências em Saldos
  UPDATE public.saldo_contas SET conta_contabil_id = NULL WHERE proprietario_id = p_proprietario_id;
  
  -- 3. Limpar referências em Lançamentos (Contábil e Histórico)
  UPDATE public.lancamentos SET conta_contabil_id = NULL, historico_id = NULL, conta_resultado_id = NULL WHERE proprietario_id = p_proprietario_id;
  
  -- 4. Limpar referências em Extratos
  UPDATE public.extratos SET conta_contabil_id = NULL WHERE empresa_id = p_proprietario_id;

  -- 5. Limpar configurações de níveis e históricos padrão
  DELETE FROM public.configuracao_contabil WHERE proprietario_id = p_proprietario_id;
  DELETE FROM public.configuracao_historico_padrao WHERE proprietario_id = p_proprietario_id;
  DELETE FROM public.conciliacao_regras WHERE proprietario_id = p_proprietario_id;

  -- 6. AGORA é seguro deletar o Plano de Contas e Históricos
  DELETE FROM public.plano_contas WHERE proprietario_id = p_proprietario_id;
  DELETE FROM public.historicos WHERE proprietario_id = p_proprietario_id;

  RETURN QUERY SELECT TRUE, 'Reset contábil concluído com sucesso.'::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 'Erro no reset: ' || SQLERRM::text;
END;
$function$;