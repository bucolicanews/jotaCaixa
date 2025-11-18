-- Função RPC para renovar a assinatura após o pagamento (Fluxo de Renovação)
CREATE OR REPLACE FUNCTION public.manual_subscription_renewal(p_cliente_id uuid, p_plano_id uuid, p_conta_pagar_id uuid, p_valor_pago numeric, p_forma_pagamento text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_plano_preco NUMERIC;
  v_plano_nome TEXT; -- NOVO: Para usar na descrição
  v_plano_permissoes JSONB;
  v_data_hoje DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_admin_id UUID;
  v_cliente_nome TEXT;
  v_cliente_email TEXT;
  v_current_data_fim_acesso TIMESTAMP WITH TIME ZONE;
  v_new_data_fim_acesso TIMESTAMP WITH TIME ZONE;
  v_start_of_today TIMESTAMP WITH TIME ZONE := date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_base_date TIMESTAMP WITH TIME ZONE;
  v_proximo_vencimento DATE;
  v_segundo_vencimento DATE; -- 60 dias para a segunda
  v_recorrencia_id UUID; -- ID da conta sintética de recorrência
  v_parcela_paga_id UUID; -- ID da parcela que está sendo paga
  v_conta_destino_id UUID; -- NOVO: ID da conta de destino (Stripe/Banco)
  
  -- Variáveis de Configuração Stripe
  v_conta_sintetica_stripe_id UUID; -- conta_sintetica_id
  v_historico_padrao_stripe_id UUID;       -- historico_padrao_id
  v_conta_resultado_stripe_id UUID; -- NOVO: id_conta_resultado do Stripe
  
  -- NOVAS VARIÁVEIS PARA MAPEAR CONTAS CONTÁBEIS
  v_conta_contabil_a_receber UUID;
  v_conta_contabil_parcela UUID;
  v_conta_contabil_recebimento UUID;
  v_conta_resultado_recebimento UUID; -- NOVO: Conta de Resultado (Receita)
  v_historico_padrao_recebimento UUID; -- NOVO: Histórico Padrão para Recebimentos
BEGIN
  -- 1. Verifica permissão (Apenas Admin ou o próprio Cliente pode executar)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso negado. Usuário não autenticado.';
  END IF;
  
  -- 2. Busca o ID do Admin (necessário para registrar o recebimento)
  SELECT admin_id INTO v_admin_id FROM public.tbl_clientes WHERE id = p_cliente_id;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin não encontrado para o cliente.';
  END IF;
  
  -- NOVO: 3. Busca o mapeamento contábil CR (Pode ser NULL, mas é usado nos lançamentos)
  SELECT conta_contabil_id INTO v_conta_contabil_a_receber FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'a_receber' LIMIT 1;
  SELECT conta_contabil_id INTO v_conta_contabil_parcela FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'parcela' LIMIT 1;
  SELECT conta_contabil_id INTO v_conta_contabil_recebimento FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'recebimento' LIMIT 1;
  SELECT conta_contabil_id INTO v_conta_resultado_recebimento FROM public.configuracao_contas_receber WHERE proprietario_id = v_admin_id AND tipo_registro = 'recebimento_resultado' LIMIT 1;
  
  -- NOVO: Busca Histórico Padrão de Recebimento (da tabela correta)
  SELECT historico_id INTO v_historico_padrao_recebimento FROM public.configuracao_historico_padrao WHERE proprietario_id = v_admin_id AND tipo_registro = 'recebimento_padrao' LIMIT 1;
  
  -- 4. Busca mapeamento Stripe (incluindo a conta de resultado)
  SELECT conta_sintetica_id, historico_padrao_id, id_conta_resultado INTO v_conta_sintetica_stripe_id, v_historico_padrao_stripe_id, v_conta_resultado_stripe_id FROM public.configuracoes_stripe WHERE proprietario_id = v_admin_id LIMIT 1;
  
  -- 5. VALIDAÇÃO CRÍTICA: Apenas as configurações do Stripe são obrigatórias
  IF v_conta_sintetica_stripe_id IS NULL OR v_historico_padrao_stripe_id IS NULL OR v_conta_resultado_stripe_id IS NULL THEN -- ADICIONADO v_conta_resultado_stripe_id
    RAISE EXCEPTION 'Configurações Stripe incompletas. Verifique: Conta Sintética Stripe, Histórico Padrão Stripe e Conta de Resultado Stripe.';
  END IF;

  -- 6. Busca a saldo_conta do Admin que referencia a conta sintética configurada no Stripe
  SELECT id INTO v_conta_destino_id 
  FROM public.saldo_contas 
  WHERE proprietario_id = v_admin_id AND conta_contabil_id = v_conta_sintetica_stripe_id
  LIMIT 1;
  
  IF v_conta_destino_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma conta de saldo (Stripe/Banco) encontrada para o Admin vinculada à conta contábil configurada no Stripe. Cadastre uma em Bancos/Caixas.';
  END IF;

  -- 7. Busca o preço, NOME e as PERMISSÕES do NOVO plano
  SELECT preco_mensal, nome, permissoes INTO v_plano_preco, v_plano_nome, v_plano_permissoes FROM public.planos WHERE id = p_plano_id;

  IF v_plano_preco IS NULL THEN
    RAISE EXCEPTION 'Plano não encontrado ou sem preço definido.';
  END IF;
  
  -- 8. Busca nome, email e data_fim_acesso atual do cliente
  SELECT nome, email, data_fim_acesso INTO v_cliente_nome, v_cliente_email, v_current_data_fim_acesso FROM public.tbl_clientes WHERE id = p_cliente_id;

  -- 9. Determina a data base para o cálculo de renovação (30 dias)
  v_base_date := v_start_of_today;
  
  -- Calcula a data de vencimento da PRÓXIMA MENSALIDADE (30 dias a partir da data base)
  v_proximo_vencimento := (date_trunc('day', v_base_date) + INTERVAL '30 days')::DATE;
  v_segundo_vencimento := (date_trunc('day', v_base_date) + INTERVAL '60 days')::DATE; -- 60 dias para a segunda
  
  -- A nova data de fim de acesso é o final do dia ANTERIOR ao próximo vencimento.
  v_new_data_fim_acesso := (v_proximo_vencimento::TIMESTAMP WITH TIME ZONE - INTERVAL '1 millisecond') AT TIME ZONE 'America/Sao_Paulo';

  -- 10. Atualiza o perfil do cliente com a nova data de acesso E PERMISSÕES
  UPDATE public.tbl_clientes
  SET 
    plano_id = p_plano_id,
    data_fim_acesso = v_new_data_fim_acesso,
    permissoes = v_plano_permissoes, -- APLICANDO AS PERMISSÕES DO NOVO PLANO
    aprovado = TRUE
  WHERE id = p_cliente_id;

  -- 11. BUSCA A CONTA SINTÉTICA DE RECORRÊNCIA
  SELECT id INTO v_recorrencia_id
  FROM public.admin_contas_receber
  WHERE cliente_id = p_cliente_id AND origem = 'assinatura_recorrente'
  LIMIT 1;

  IF v_recorrencia_id IS NULL THEN
    RAISE EXCEPTION 'Conta de recorrência não encontrada para o cliente %.', p_cliente_id;
  END IF;
  
  -- CORREÇÃO: Atualiza a descrição, o valor total e a conta contábil da conta sintética
  UPDATE public.admin_contas_receber
  SET
    descricao = 'Assinatura Recorrente - Plano ' || v_plano_nome, -- USANDO NOME DO PLANO
    valor_total = v_plano_preco, -- CORREÇÃO: Atualiza o valor total
    data_vencimento = v_proximo_vencimento, -- Atualiza o vencimento sintético para o próximo
    id_conta_patrimonial = v_conta_contabil_a_receber -- NOVO: Atualiza Conta Contábil
  WHERE id = v_recorrencia_id;
  
  -- 12. MARCA A PARCELA CORRESPONDENTE AO PAGAMENTO COMO PAGA
  UPDATE public.admin_parcelas_receber
  SET 
    status = 'paga',
    valor_pago = p_valor_pago,
    data_pagamento = v_data_hoje,
    id_conta_contabil = v_conta_contabil_parcela -- NOVO: Conta Contábil da Parcela
  WHERE id = p_conta_pagar_id -- p_conta_pagar_id agora é o ID da parcela
  RETURNING id INTO v_parcela_paga_id;

  -- 13. DELETA TODAS AS OUTRAS PARCELAS PENDENTES DE ASSINATURA ANTERIORES
  -- ESTA É A LÓGICA CRÍTICA: DELETA TODAS AS PARCELAS ABERTAS/PENDENTES (EXCETO A QUE ACABOU DE SER PAGA)
  DELETE FROM public.admin_parcelas_receber
  WHERE admin_id = v_admin_id
    AND conta_receber_id = v_recorrencia_id
    AND status IN ('aberta', 'reprogramada', 'parcial')
    AND id != v_parcela_paga_id; -- Não altera a parcela que acabou de ser paga

  -- 14. CRIA O REGISTRO DE RECEBIMENTO DO ADMIN (AGORA COM conta_id E id_conta_contabil)
  INSERT INTO public.admin_recebimentos (parcela_id, admin_id, cliente_id, valor_recebido, data_recebimento, tipo_recebimento, forma_pagamento, conta_id, id_conta_contabil, historico_id, id_conta_resultado)
  VALUES (
    v_parcela_paga_id,
    v_admin_id,
    p_cliente_id,
    p_valor_pago,
    NOW() AT TIME ZONE 'America/Sao_Paulo',
    'total',
    p_forma_pagamento, -- Usa a forma de pagamento fornecida
    v_conta_destino_id, -- ID da conta de destino (buscada via conta_sintetica_stripe_id)
    v_conta_contabil_recebimento, -- Conta Contábil do Recebimento (Patrimonial)
    v_historico_padrao_stripe_id,
    v_conta_resultado_stripe_id -- USANDO v_conta_resultado_stripe_id
  );
  
  -- NOVO: 14.1 CRIA O LANÇAMENTO DE ENTRADA NA CONTA DE SALDO (Stripe) - DÉBITO (Ativo)
  IF v_conta_sintetica_stripe_id IS NOT NULL THEN
    INSERT INTO public.lancamentos (proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id)
    VALUES (
      v_admin_id,
      NOW() AT TIME ZONE 'America/SaoPaulo',
      'Recebimento Renovação Assinatura - Cliente ' || v_cliente_nome || ' (CR ID: ' || v_recorrencia_id::TEXT || ')', -- NOVO: Inclui ID da CR
      p_valor_pago,
      'Entrada',
      v_conta_destino_id, -- ID da saldo_contas (Stripe)
      v_conta_sintetica_stripe_id, -- ID da conta_contabil (Stripe)
      'assinatura_stripe',
      true, -- Pagamentos via Stripe já vêm conciliados
      v_historico_padrao_stripe_id -- NOVO: Histórico Padrão
    );
  END IF;
  
  -- NOVO: 14.2 CRIA O LANÇAMENTO DE RECEITA (DRE) - CRÉDITO (Resultado)
  -- CORREÇÃO CRÍTICA: Tipo deve ser 'Saida' para contas de Receita (Natureza Credora)
  IF v_conta_resultado_stripe_id IS NOT NULL THEN
    INSERT INTO public.lancamentos (proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id)
    VALUES (v_admin_id, v_data_hoje, 'Receita Renovação Assinatura - Plano ' || v_plano_nome || ' (CR ID: ' || v_recorrencia_id::TEXT || ')', p_valor_pago, 'Saida', NULL, v_conta_resultado_stripe_id, 'assinatura_stripe', true, v_historico_padrao_stripe_id); -- NOVO: Inclui ID da CR
  END IF;
  
  -- NOVO: 14.3 CRIA O LANÇAMENTO INICIAL DE DÉBITO (CR) - DÉBITO (Ativo)
  -- Este lançamento deve ser o valor total do plano, pois o valor total da conta sintética foi atualizado no passo 10.
  IF v_conta_contabil_a_receber IS NOT NULL THEN
    INSERT INTO public.lancamentos (proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id)
    VALUES (v_admin_id, v_data_hoje, 'Lançamento Inicial CR: Assinatura Recorrente (CR ID: ' || v_recorrencia_id::TEXT || ')', v_plano_preco, 'Entrada', NULL, v_conta_contabil_a_receber, 'assinatura_stripe', true, v_historico_padrao_stripe_id);
  END IF;
  
  -- NOVO: 14.4 CRIA O LANÇAMENTO DE ESTORNO PATRIMONIAL (CR) - CRÉDITO (Ativo)
  IF v_conta_contabil_a_receber IS NOT NULL THEN
    INSERT INTO public.lancamentos (proprietario_id, data_movimentacao, descricao, valor, tipo, conta_bancaria_id, conta_contabil_id, origem, conciliado, historico_id)
    VALUES (v_admin_id, v_data_hoje, 'Estorno Patrimonial CR - Renovação Assinatura (CR ID: ' || v_recorrencia_id::TEXT || ')', p_valor_pago, 'Saida', NULL, v_conta_contabil_a_receber, 'assinatura_stripe', true, v_historico_padrao_stripe_id); -- NOVO: Inclui ID da CR
  END IF;
  
  -- 15. CRIA AS PRÓXIMAS DUAS PARCELAS PENDENTES (30 e 60 dias)
  IF v_conta_contabil_parcela IS NOT NULL THEN
    -- Próxima Mensalidade (30 dias)
    INSERT INTO public.admin_parcelas_receber (conta_receber_id, admin_id, numero_parcela, valor_parcela, data_vencimento, status, id_conta_contabil)
    VALUES (
      v_recorrencia_id,
      v_admin_id,
      (SELECT COALESCE(MAX(numero_parcela), 1) + 1 FROM public.admin_parcelas_receber WHERE conta_receber_id = v_recorrencia_id), -- Próximo número de parcela
      v_plano_preco,
      v_proximo_vencimento,
      'aberta',
      v_conta_contabil_parcela -- NOVO: Conta Contábil da Parcela
    );
    
    -- Segunda Mensalidade (60 dias)
    INSERT INTO public.admin_parcelas_receber (conta_receber_id, admin_id, numero_parcela, valor_parcela, data_vencimento, status, id_conta_contabil)
    VALUES (
      v_recorrencia_id,
      v_admin_id,
      (SELECT COALESCE(MAX(numero_parcela), 1) + 1 FROM public.admin_parcelas_receber WHERE conta_receber_id = v_recorrencia_id), -- Próximo número de parcela
      v_plano_preco,
      v_segundo_vencimento,
      'aberta',
      v_conta_contabil_parcela -- NOVO: Conta Contábil da Parcela
    );
  END IF;

END;
$function$;