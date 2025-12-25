-- Função RPC para mapear configurações padrão (chamada após importação de plano)
-- ATUALIZADO: Mapeamento da conta de receita ajustado para o novo plano de contas.
CREATE OR REPLACE FUNCTION public.map_default_configs(p_proprietario_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_conta_caixa_id UUID;
    v_conta_capital_id UUID;
    v_conta_clientes_id UUID;
    v_conta_fornecedores_id UUID;
    v_conta_receita_id UUID;
    v_conta_despesa_id UUID;
    v_conta_desconto_concedido_id UUID;
    v_conta_estorno_desconto_concedido_id UUID;
    v_conta_desconto_obtido_id UUID;
    v_conta_estorno_desconto_obtido_id UUID;
    v_conta_pagamento_fornecedor_id UUID;
    v_historico_capital_id UUID;
    v_historico_recebimento_id UUID;
    v_historico_pagamento_id UUID;
BEGIN
    -- 1. Busca os IDs das Contas Analíticas Padrão (códigos ajustados para o novo plano)
    SELECT id INTO v_conta_caixa_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '1.1.01.0001' LIMIT 1;
    SELECT id INTO v_conta_capital_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '3.1.00.0001' LIMIT 1;
    SELECT id INTO v_conta_clientes_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '1.1.02.0003' LIMIT 1; -- Clientes a Receber Avulso
    SELECT id INTO v_conta_fornecedores_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '2.1.03.0001' LIMIT 1; -- Fornecedores Nacionais
    SELECT id INTO v_conta_receita_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '4.1.01.0001' LIMIT 1; -- Prestação de Serviços Contabeis
    SELECT id INTO v_conta_despesa_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '5.1.01.0010' LIMIT 1;
    SELECT id INTO v_conta_desconto_concedido_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '5.1.01.0003' LIMIT 1;
    SELECT id INTO v_conta_estorno_desconto_concedido_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '4.1.03.0001' LIMIT 1;
    SELECT id INTO v_conta_desconto_obtido_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '4.3.01.0001' LIMIT 1;
    SELECT id INTO v_conta_estorno_desconto_obtido_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '5.2.01.0003' LIMIT 1;
    SELECT id INTO v_conta_pagamento_fornecedor_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '5.1.01.0010' LIMIT 1;
    
    -- 2. Busca os IDs dos Históricos Padrão
    SELECT id INTO v_historico_capital_id FROM public.historicos WHERE proprietario_id = p_proprietario_id AND codigo = '400' LIMIT 1;
    SELECT id INTO v_historico_recebimento_id FROM public.historicos WHERE proprietario_id = p_proprietario_id AND codigo = '200' LIMIT 1;
    SELECT id INTO v_historico_pagamento_id FROM public.historicos WHERE proprietario_id = p_proprietario_id AND codigo = '500' LIMIT 1;

    -- 3. Mapeamento de Níveis Contábeis (configuracao_contabil)
    INSERT INTO public.configuracao_contabil (proprietario_id, tipo_natureza, codigo_nivel_1)
    VALUES
        (p_proprietario_id, 'Ativo', '1'),
        (p_proprietario_id, 'Passivo', '2'),
        (p_proprietario_id, 'Patrimonio Liquido', '3'),
        (p_proprietario_id, 'Receita', '4'),
        (p_proprietario_id, 'Custo', '5'),
        (p_proprietario_id, 'Despesa', '6')
    ON CONFLICT (proprietario_id, tipo_natureza) DO UPDATE SET codigo_nivel_1 = EXCLUDED.codigo_nivel_1;

    -- 4. Mapeamento de Contas a Receber (configuracao_contas_receber)
    IF v_conta_clientes_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_receber (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES
            (p_proprietario_id, 'a_receber', v_conta_clientes_id),
            (p_proprietario_id, 'parcela', v_conta_clientes_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_caixa_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_receber (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'recebimento', v_conta_caixa_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_receita_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_receber (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'recebimento_resultado', v_conta_receita_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_desconto_concedido_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_receber (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'desconto_concedido', v_conta_desconto_concedido_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_estorno_desconto_concedido_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_receber (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'estorno_desconto_concedido', v_conta_estorno_desconto_concedido_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    
    -- 5. Mapeamento de Contas a Pagar (configuracao_contas_pagar)
    IF v_conta_fornecedores_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_pagar (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES
            (p_proprietario_id, 'a_pagar', v_conta_fornecedores_id),
            (p_proprietario_id, 'parcela_pagar', v_conta_fornecedores_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_pagamento_fornecedor_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_pagar (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'pagamento', v_conta_pagamento_fornecedor_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_desconto_obtido_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_pagar (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'desconto_obtido', v_conta_desconto_obtido_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_estorno_desconto_obtido_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_pagar (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'estorno_desconto_obtido', v_conta_estorno_desconto_obtido_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;

    -- 6. Mapeamento de Históricos Padrão (configuracao_historico_padrao)
    IF v_historico_capital_id IS NOT NULL THEN
        INSERT INTO public.configuracao_historico_padrao (proprietario_id, tipo_registro, historico_id)
        VALUES (p_proprietario_id, 'capital_social', v_historico_capital_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET historico_id = EXCLUDED.historico_id;
    END IF;
    IF v_historico_recebimento_id IS NOT NULL THEN
        INSERT INTO public.configuracao_historico_padrao (proprietario_id, tipo_registro, historico_id)
        VALUES (p_proprietario_id, 'recebimento_padrao', v_historico_recebimento_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET historico_id = EXCLUDED.historico_id;
    END IF;
    IF v_historico_pagamento_id IS NOT NULL THEN
        INSERT INTO public.configuracao_historico_padrao (proprietario_id, tipo_registro, historico_id)
        VALUES (p_proprietario_id, 'pagamento_padrao', v_historico_pagamento_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET historico_id = EXCLUDED.historico_id;
    END IF;

    -- 7. Cria a Conta de Saldo (Caixa)
    IF v_conta_caixa_id IS NOT NULL THEN
        INSERT INTO public.saldo_contas (proprietario_id, nome, saldo_inicial, tipo_saldo, natureza_contabil, conta_contabil_id)
        VALUES (p_proprietario_id, 'Caixa Inicial', 0.00, 'Debito', 'Ativo', v_conta_caixa_id)
        ON CONFLICT (proprietario_id, nome) DO NOTHING;
    END IF;

    -- 8. Mapeamento de Contratos (configuracao_contratos)
    IF v_conta_clientes_id IS NOT NULL AND v_conta_receita_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contratos(proprietario_id, id_conta_clientes_receber, id_conta_receita_contrato)
        VALUES (p_proprietario_id, v_conta_clientes_id, v_conta_receita_id)
        ON CONFLICT (proprietario_id) DO UPDATE 
        SET id_conta_clientes_receber = EXCLUDED.id_conta_clientes_receber,
            id_conta_receita_contrato = EXCLUDED.id_conta_receita_contrato;
    END IF;

    RETURN QUERY SELECT TRUE, 'Configurações padrão mapeadas com sucesso.'::TEXT;

EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, SQLERRM::text;
END;
$function$